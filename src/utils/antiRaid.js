import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';

const TRUST_KEY = guildId => `guild:${guildId}:antiRaidTrust`;
const AUTHORIZED_USER_ID = '1159601661392715906';
const WINDOW_MS = 60_000;
const MESSAGE_WINDOW_MS = 20_000;
const state = new Map();

function getState(guildId) {
  if (!state.has(guildId)) state.set(guildId, { kicks: [], bans: [], messageDeletes: [], channels: [], roles: [], roleUpdates: [], punished: new Set() });
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
  if (!userId && !roleId) throw new Error('A user or role is required');
  const trust = await readTrust(guild);
  const key = userId ? 'trustedUserIds' : 'trustedRoleIds';
  const id = userId || roleId;
  trust[key] = remove ? trust[key].filter(item => item !== id) : [...new Set([...trust[key], id])];
  await guild.client.db?.set?.(TRUST_KEY(guild.id), trust);
  return trust;
}

export async function isTrusted(guild, userId) {
  if (!userId) return false;
  if (userId === guild.ownerId) return true;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const trust = await readTrust(guild);
  return trust.trustedUserIds.includes(userId) || Boolean(member?.roles.cache.some(role => trust.trustedRoleIds.includes(role.id)));
}

function addEvent(guildId, type, amount = 1) {
  const current = getState(guildId);
  const cutoff = Date.now() - (type === 'messageDeletes' ? MESSAGE_WINDOW_MS : WINDOW_MS);
  current[type] = current[type].filter(event => event.time > cutoff);
  current[type].push({ time: Date.now(), amount });
  return current[type].reduce((total, event) => total + event.amount, 0);
}

async function latestExecutor(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);
  return logs?.entries.find(entry => (!targetId || entry.target?.id === targetId) && Date.now() - entry.createdTimestamp < 15_000)?.executor || null;
}

async function punish(guild, executor, reason, mode = 'kick') {
  const trusted = await isTrusted(guild, executor?.id);
  if (!executor || executor.bot || trusted) return false;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  const botMember = guild.members.me;
  if (!member || !botMember || member.roles.highest.position >= botMember.roles.highest.position) {
    await sendAntiNukeLog(guild, { action: 'تم اكتشاف مخالفة ولكن تعذر معاقبة المنفذ', executor, target: executor?.id, details: [['السبب', reason], ['الإجراء', 'تحقق من رتبة البوت']], severity: 'CRITICAL' });
    return false;
  }
  const current = getState(guild.id);
  if (current.punished.has(executor.id)) return true;
  current.punished.add(executor.id);
  let action = 'KICK';
  if (mode === 'strip') {
    const removable = member.roles.cache.filter(role => role.id !== guild.id && !role.managed && role.position < botMember.roles.highest.position);
    await member.roles.remove(removable, `Anti-raid: ${reason}`).catch(() => {});
    action = 'ROLE STRIP';
  } else {
    await member.kick(`Anti-raid: ${reason}`).catch(() => {});
  }
  await sendAntiNukeLog(guild, { action: `تم تنفيذ ${action}`, executor, target: executor, details: [['السبب', reason]], severity: 'CRITICAL', mentionEveryone: true });
  return true;
}

async function report(guild, action, executor, target, details = [], severity = 'HIGH') {
  await sendAntiNukeLog(guild, { action, executor, target, details, severity });
}

export async function inspectMemberRemoval(member, action = AuditLogEvent.MemberKick) {
  const executor = await latestExecutor(member.guild, action, member.id);
  if (!executor) return;
  const type = action === AuditLogEvent.MemberBanAdd ? 'bans' : 'kicks';
  const total = addEvent(member.guild.id, type);
  await report(member.guild, action === AuditLogEvent.MemberBanAdd ? 'حظر عضو' : 'طرد عضو', executor, member.user || member.id, [['العدد خلال دقيقة', total]], total >= 10 ? 'CRITICAL' : 'HIGH');
  if (total >= 10) await punish(member.guild, executor, `${total} members removed in one minute`);
}

export async function inspectMessageDelete(message) {
  const executor = await latestExecutor(message.guild, AuditLogEvent.MessageBulkDelete, message.channelId);
  if (!executor) return;
  const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 5 }).catch(() => null);
  const entry = logs?.entries.find(item => item.executor?.id === executor.id && Date.now() - item.createdTimestamp < 15_000);
  const total = addEvent(message.guild.id, 'messageDeletes', Number(entry?.extra?.count || 1));
  await report(message.guild, 'حذف رسائل جماعي', executor, `<#${message.channelId}>`, [['عدد الرسائل', total]], total >= 20 ? 'CRITICAL' : 'HIGH');
  if (total >= 20) await punish(message.guild, executor, `${total} messages deleted in twenty seconds`);
}

export async function inspectChannelDelete(channel) {
  const executor = await latestExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!executor) return;
  const total = addEvent(channel.guild.id, 'channels');
  await report(channel.guild, 'حذف قناة', executor, channel.name || channel.id, [['العدد خلال دقيقة', total]], total >= 3 ? 'CRITICAL' : 'HIGH');
  if (total >= 3) await punish(channel.guild, executor, 'three channels deleted in one minute');
}

export async function inspectRoleDelete(role) {
  const executor = await latestExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  if (!executor) return;
  const total = addEvent(role.guild.id, 'roles');
  await report(role.guild, 'حذف رتبة', executor, role.name || role.id, [['العدد خلال دقيقة', total]], total >= 3 ? 'CRITICAL' : 'HIGH');
  if (total >= 3) await punish(role.guild, executor, 'three roles deleted in one minute');
}

export async function inspectRoleUpdate(role) {
  const executor = await latestExecutor(role.guild, AuditLogEvent.RoleUpdate, role.id);
  if (!executor) return;
  const total = addEvent(role.guild.id, 'roleUpdates');
  await report(role.guild, 'تعديل رتبة', executor, role.name || role.id, [['العدد خلال دقيقة', total]], total >= 3 ? 'CRITICAL' : 'HIGH');
  if (total >= 3) await punish(role.guild, executor, 'mass role or permission changes', 'strip');
}

export async function handleAntiRaidCommand(message) {
  if (message.__antiRaidHandled) return true;
  const match = message.content.trim().match(/^(انترايد|تراست|انتراست|trust|untrust)\s*(.*)$/iu);
  if (!match) return false;
  message.__antiRaidHandled = true;

  // Only this user may control the security system.
  if (message.author.id !== AUTHORIZED_USER_ID) {
    await message.channel.send('❌ هذا النظام متاح لمالكه فقط.').catch(() => {});
    return true;
  }

  const command = match[1].toLowerCase();
  if (command === 'انترايد') {
    await message.channel.send('🛡️ الحماية تعمل: 10 عمليات طرد/حظر أو 20 حذف رسالة أو 3 حذف قنوات/رتب خلال دقيقة.');
    return true;
  }
  const rawTarget = match[2].trim();
  const target = rawTarget.match(/^<@!?([0-9]+)>$/u) || rawTarget.match(/^<@&([0-9]+)>$/u) || rawTarget.match(/^([0-9]{17,20})$/u);
  if (!target) {
    await message.channel.send(`❌ الاستخدام: \\`${match[1]} @user\\` أو \\`${match[1]} @role\\`.`);
    return true;
  }
  const id = target[1];
  const role = message.guild.roles.cache.get(id);
  const user = role ? null : await message.client.users.fetch(id).catch(() => null);
  if (!role && !user) {
    await message.channel.send('❌ لم أجد المستخدم أو الرتبة.');
    return true;
  }
  const remove = command === 'انتراست' || command === 'untrust';
  await updateAntiRaidTrust(message.guild, { userId: user?.id, roleId: role?.id, remove });
  await sendAntiNukeLog(message.guild, { action: remove ? 'إزالة Trust' : 'إضافة Trust', executor: message.author, target: role ? role.name : user.tag, details: [['الأمر', message.content], ['الصلاحية', 'استثناء من Anti-Raid / Anti-Nuke']], severity: 'HIGH' });
  await message.channel.send(remove ? `✅ تمت إزالة الثقة من ${role || user}.` : `✅ تمت إضافة ${role || user} إلى قائمة الثقة.`);
  return true;
}

export function antiRaidPermission() {
  return PermissionFlagsBits.ViewAuditLog;
}
