import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';

const TRUST_KEY = guildId => `guild:${guildId}:antiRaidTrust`;
const WINDOW_MS = 60_000;
const MESSAGE_WINDOW_MS = 20_000;
const state = new Map();

function getState(guildId) {
  if (!state.has(guildId)) {
    state.set(guildId, { kicks: [], bans: [], messageDeletes: [], channels: [], roles: [], roleUpdates: [], punished: new Set() });
  }
  return state.get(guildId);
}

async function readTrust(guild) {
  const value = await guild.client.db?.get?.(TRUST_KEY(guild.id), { trustedUserIds: [], trustedRoleIds: [] });
  return {
    trustedUserIds: Array.isArray(value?.trustedUserIds) ? value.trustedUserIds : [],
    trustedRoleIds: Array.isArray(value?.trustedRoleIds) ? value.trustedRoleIds : [],
  };
}

export async function updateAntiRaidTrust(guild, { userId, roleId, remove = false }) {
  const trust = await readTrust(guild);
  const collection = userId ? trust.trustedUserIds : trust.trustedRoleIds;
  const id = userId || roleId;
  const next = remove ? collection.filter(item => item !== id) : [...new Set([...collection, id])];
  if (userId) trust.trustedUserIds = next;
  else trust.trustedRoleIds = next;
  await guild.client.db.set(TRUST_KEY(guild.id), trust);
  return trust;
}

export async function isTrusted(guild, userId) {
  const trust = await readTrust(guild);
  if (trust.trustedUserIds.includes(userId)) return true;
  const member = guild.members.cache.get(userId);
  return Boolean(member?.roles.cache.some(role => trust.trustedRoleIds.includes(role.id)));
}

function addEvent(guildId, type, amount = 1) {
  const now = Date.now();
  const current = getState(guildId);
  const cutoff = now - (type === 'messageDeletes' ? MESSAGE_WINDOW_MS : WINDOW_MS);
  current[type] = current[type].filter(event => event.time > cutoff);
  current[type].push({ time: now, amount });
  return current[type].reduce((total, event) => total + event.amount, 0);
}

async function latestExecutor(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);
  const entry = logs?.entries.find(item =>
    (!targetId || item.target?.id === targetId) && Date.now() - item.createdTimestamp < 15_000
  );
  return entry?.executor || null;
}

async function punish(guild, executor, reason, mode = 'kick') {
  if (!executor || executor.bot || executor.id === guild.ownerId || await isTrusted(guild, executor.id)) return false;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  const botMember = guild.members.me;
  if (!member || !botMember || member.roles.highest.position >= botMember.roles.highest.position) return false;

  const current = getState(guild.id);
  if (current.punished.has(executor.id)) return true;
  current.punished.add(executor.id);

  if (mode === 'strip') {
    const removable = member.roles.cache.filter(role => role.id !== guild.id && !role.managed && role.position < botMember.roles.highest.position);
    await member.roles.remove(removable, `Anti-raid: ${reason}`).catch(() => {});
  } else {
    await member.kick(`Anti-raid: ${reason}`).catch(() => {});
  }
  return true;
}

export async function inspectMemberRemoval(member, action = AuditLogEvent.MemberKick) {
  const executor = await latestExecutor(member.guild, action, member.id);
  if (!executor) return;
  const type = action === AuditLogEvent.MemberBanAdd ? 'bans' : 'kicks';
  const total = addEvent(member.guild.id, type);
  if (total >= 10) await punish(member.guild, executor, `${total} members removed in one minute`);
}

export async function inspectMessageDelete(message) {
  const executor = await latestExecutor(message.guild, AuditLogEvent.MessageBulkDelete, message.channelId);
  if (!executor) return;
  const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 5 }).catch(() => null);
  const entry = logs?.entries.find(item => item.executor?.id === executor.id && Date.now() - item.createdTimestamp < 15_000);
  const total = addEvent(message.guild.id, 'messageDeletes', Number(entry?.extra?.count || 1));
  if (total >= 20) await punish(message.guild, executor, `${total} messages deleted in twenty seconds`);
}

export async function inspectChannelDelete(channel) {
  const executor = await latestExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (executor && addEvent(channel.guild.id, 'channels') >= 3) await punish(channel.guild, executor, 'three channels deleted in one minute');
}

export async function inspectRoleDelete(role) {
  const executor = await latestExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  if (executor && addEvent(role.guild.id, 'roles') >= 3) await punish(role.guild, executor, 'three roles deleted in one minute');
}

export async function inspectRoleUpdate(role) {
  const executor = await latestExecutor(role.guild, AuditLogEvent.RoleUpdate, role.id);
  if (executor && addEvent(role.guild.id, 'roleUpdates') >= 3) await punish(role.guild, executor, 'mass role or permission changes', 'strip');
}

export async function handleAntiRaidCommand(message) {
  const match = message.content.trim().match(/^(انترايد|تراست|انتراست)\s*(.*)$/u);
  if (!match) return false;
  if (message.guild.ownerId !== message.author.id) {
    await message.channel.send('❌ هذا الأمر لمالك السيرفر فقط.');
    return true;
  }

  const [, command, rawTarget] = match;
  if (command === 'انترايد') {
    await message.channel.send('🛡️ Anti-Raid يعمل تلقائيًا: 10 طرد/بان خلال دقيقة، 20 رسالة خلال 20 ثانية، و3 قنوات/رتب خلال دقيقة.');
    return true;
  }

  const target = rawTarget.match(/^<@!?(\d+)>$/u) || rawTarget.match(/^<@&(\d+)>$/u) || rawTarget.match(/^(\d{17,20})$/u);
  if (!target) {
    await message.channel.send(`❌ استخدم: \`${command} @user\` أو \`${command} @role\` أو اكتب ID.`);
    return true;
  }
  const id = target[1];
  const role = guildRole(message.guild, id);
  const user = role ? null : await message.client.users.fetch(id).catch(() => null);
  if (!role && !user) {
    await message.channel.send('❌ لم أجد المستخدم أو الرتبة.');
    return true;
  }
  await updateAntiRaidTrust(message.guild, { userId: user?.id, roleId: role?.id, remove: command === 'انتراست' });
  await message.channel.send(command === 'تراست' ? `✅ تمت إضافة ${role || user} إلى قائمة الثقة.` : `✅ تمت إزالة ${role || user} من قائمة الثقة.`);
  return true;
}

function guildRole(guild, id) {
  return guild.roles.cache.get(id) || null;
}

export function antiRaidPermission() {
  return PermissionFlagsBits.ViewAuditLog;
}
