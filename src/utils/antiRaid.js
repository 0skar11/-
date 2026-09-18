import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';

const TRUST_KEY = guildId => `guild:${guildId}:antiRaidTrust`;
const WINDOW_MS = 60_000;
const MESSAGE_WINDOW_MS = 20_000;
const PUNISHED_TTL_MS = 10 * 60_000;

const state = new Map();

function getState(guildId) {
  if (!state.has(guildId)) {
    state.set(guildId, {
      kicks: [],
      bans: [],
      messageDeletes: [],
      channels: [],
      roles: [],
      roleUpdates: [],
      punished: new Map(),
    });
  }

  return state.get(guildId);
}

function normalizeTrust(value) {
  return {
    trustedUserIds: Array.isArray(value?.trustedUserIds) ? [...new Set(value.trustedUserIds.map(String))] : [],
    trustedRoleIds: Array.isArray(value?.trustedRoleIds) ? [...new Set(value.trustedRoleIds.map(String))] : [],
  };
}

async function readTrust(guild) {
  const value = await guild.client.db?.get?.(TRUST_KEY(guild.id), { trustedUserIds: [], trustedRoleIds: [] });
  return normalizeTrust(value);
}

async function saveTrust(guild, trust) {
  const normalized = normalizeTrust(trust);
  await guild.client.db.set(TRUST_KEY(guild.id), normalized);
  return normalized;
}

export async function updateAntiRaidTrust(guild, { userId, roleId, remove = false }) {
  const id = String(userId || roleId || '');
  if (!id) return readTrust(guild);

  const trust = await readTrust(guild);
  const key = userId ? 'trustedUserIds' : 'trustedRoleIds';
  const current = trust[key] || [];
  trust[key] = remove
    ? current.filter(item => item !== id)
    : [...new Set([...current, id])];

  return saveTrust(guild, trust);
}

export async function isTrusted(guild, userId) {
  const targetId = String(userId || '');
  if (!targetId) return false;

  const trust = await readTrust(guild);
  if (trust.trustedUserIds.includes(targetId)) return true;
  if (!trust.trustedRoleIds.length) return false;

  let member = guild.members.cache.get(targetId) || null;
  if (!member) {
    member = await guild.members.fetch(targetId).catch(() => null);
  }

  return Boolean(member?.roles?.cache?.some(role => trust.trustedRoleIds.includes(role.id)));
}

function pruneAndCount(events, windowMs) {
  const cutoff = Date.now() - windowMs;
  const filtered = events.filter(event => event.time > cutoff);
  const total = filtered.reduce((sum, event) => sum + event.amount, 0);
  return { filtered, total };
}

function addEvent(guildId, type, amount = 1) {
  const current = getState(guildId);
  const windowMs = type === 'messageDeletes' ? MESSAGE_WINDOW_MS : WINDOW_MS;
  const { filtered } = pruneAndCount(current[type], windowMs);
  const next = [...filtered, { time: Date.now(), amount }];
  current[type] = next;
  return next.reduce((total, event) => total + event.amount, 0);
}

async function latestExecutor(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);
  const entry = logs?.entries.find(item => {
    if (Date.now() - item.createdTimestamp > 15_000) return false;
    if (!targetId) return true;
    return item.target?.id === targetId;
  });
  return entry?.executor || null;
}

async function punish(guild, executor, reason, mode = 'kick') {
  if (!executor || executor.id === guild.ownerId || await isTrusted(guild, executor.id)) return false;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  const botMember = guild.members.me;
  if (!member || !botMember || member.roles.highest.position >= botMember.roles.highest.position) return false;

  const current = getState(guild.id);
  const now = Date.now();
  const punishedAt = current.punished.get(executor.id);
  if (punishedAt && now - punishedAt < PUNISHED_TTL_MS) return true;
  current.punished.set(executor.id, now);

  for (const [userId, ts] of current.punished.entries()) {
    if (now - ts >= PUNISHED_TTL_MS) current.punished.delete(userId);
  }

  if (mode === 'strip') {
    const removable = member.roles.cache.filter(
      role => role.id !== guild.id && !role.managed && role.position < botMember.roles.highest.position,
    );
    await member.roles.remove(removable, `Anti-raid: ${reason}`).catch(() => {});
    return true;
  }

  await member.kick(`Anti-raid: ${reason}`).catch(() => {});
  return true;
}

function resolveRemovalTargetId(subject) {
  return subject?.id || subject?.user?.id || null;
}

export async function inspectMemberRemoval(subject, action = AuditLogEvent.MemberKick) {
  const guild = subject?.guild;
  const targetId = resolveRemovalTargetId(subject);
  if (!guild || !targetId) return;

  const executor = await latestExecutor(guild, action, targetId);
  if (!executor) return;

  const type = action === AuditLogEvent.MemberBanAdd ? 'bans' : 'kicks';
  const total = addEvent(guild.id, type);
  if (total >= 10) await punish(guild, executor, `${total} members removed in one minute`);
}

export async function inspectMessageDelete(message) {
  if (!message?.guild) return;

  const executor = await latestExecutor(message.guild, AuditLogEvent.MessageBulkDelete, message.channelId);
  if (!executor) return;

  const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageBulkDelete, limit: 5 }).catch(() => null);
  const entry = logs?.entries.find(item => item.executor?.id === executor.id && Date.now() - item.createdTimestamp < 15_000);
  const total = addEvent(message.guild.id, 'messageDeletes', Number(entry?.extra?.count || 1));
  if (total >= 20) await punish(message.guild, executor, `${total} messages deleted in twenty seconds`);
}

export async function inspectChannelDelete(channel) {
  if (!channel?.guild) return;

  const executor = await latestExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (executor && addEvent(channel.guild.id, 'channels') >= 3) {
    await punish(channel.guild, executor, 'three channels deleted in one minute');
  }
}

export async function inspectRoleDelete(role) {
  if (!role?.guild) return;

  const executor = await latestExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  if (executor && addEvent(role.guild.id, 'roles') >= 3) {
    await punish(role.guild, executor, 'three roles deleted in one minute');
  }
}

export async function inspectRoleUpdate(role) {
  if (!role?.guild) return;

  const executor = await latestExecutor(role.guild, AuditLogEvent.RoleUpdate, role.id);
  if (executor && addEvent(role.guild.id, 'roleUpdates') >= 3) {
    await punish(role.guild, executor, 'mass role or permission changes', 'strip');
  }
}

function mentionFromType(type, id) {
  return type === 'role' ? `<@&${id}>` : `<@${id}>`;
}

function parseTrustTarget(raw) {
  const content = (raw || '').trim();
  if (!content) return null;

  const roleMatch = content.match(/^<@&(\d{17,20})>$/u);
  if (roleMatch) return { id: roleMatch[1], mentionType: 'role' };

  const userMatch = content.match(/^<@!?(\d{17,20})>$/u);
  if (userMatch) return { id: userMatch[1], mentionType: 'user' };

  const idMatch = content.match(/^(\d{17,20})$/u);
  if (idMatch) return { id: idMatch[1], mentionType: 'id' };

  return null;
}

function antiRaidStatus(guildId) {
  const current = getState(guildId);
  const kicks = pruneAndCount(current.kicks, WINDOW_MS).total;
  const bans = pruneAndCount(current.bans, WINDOW_MS).total;
  const messageDeletes = pruneAndCount(current.messageDeletes, MESSAGE_WINDOW_MS).total;
  const channels = pruneAndCount(current.channels, WINDOW_MS).total;
  const rolesDeleted = pruneAndCount(current.roles, WINDOW_MS).total;
  const roleUpdates = pruneAndCount(current.roleUpdates, WINDOW_MS).total;

  return [
    '🛡️ **حالة Anti-Raid**',
    '• الحالة: يعمل تلقائيًا',
    '• الحدود: 10 طرد/بان خلال دقيقة، 20 رسالة خلال 20 ثانية، و3 قنوات/رتب خلال دقيقة.',
    `• النشاط الحالي: طرد (${kicks}) | بان (${bans}) | حذف رسائل (${messageDeletes}) | حذف قنوات (${channels}) | حذف رتب (${rolesDeleted}) | تعديل رتب (${roleUpdates})`,
  ].join('\n');
}

export async function handleAntiRaidCommand(message) {
  if (!message.guild || message.author?.bot) return false;

  const match = message.content.trim().match(/^(انترايد|تراست|انتراست)\b\s*(.*)$/u);
  if (!match) return false;

  if (message.guild.ownerId !== message.author.id) {
    await message.channel.send('❌ هذا الأمر لمالك السيرفر فقط.');
    return true;
  }

  const [, command, rawTarget] = match;

  if (command === 'انترايد') {
    await message.channel.send(antiRaidStatus(message.guild.id));
    return true;
  }

  const parsed = parseTrustTarget(rawTarget);
  if (!parsed) {
    await message.channel.send(`❌ استخدم: \`${command} @user\` أو \`${command} @role\` أو اكتب ID صالح.`);
    return true;
  }

  let targetType = parsed.mentionType;
  let role = null;
  let user = null;

  if (parsed.mentionType === 'role' || parsed.mentionType === 'id') {
    role = message.guild.roles.cache.get(parsed.id)
      || await message.guild.roles.fetch(parsed.id).catch(() => null);
    if (role) targetType = 'role';
  }

  if (!role) {
    user = await message.client.users.fetch(parsed.id).catch(() => null);
    if (user) targetType = 'user';
  }

  if (!role && !user) {
    await message.channel.send('❌ لم أستطع العثور على مستخدم أو رتبة بهذا المعرف.');
    return true;
  }

  const remove = command === 'انتراست';
  await updateAntiRaidTrust(message.guild, {
    userId: targetType === 'user' ? parsed.id : undefined,
    roleId: targetType === 'role' ? parsed.id : undefined,
    remove,
  });

  const targetText = role ? mentionFromType('role', role.id) : mentionFromType('user', parsed.id);
  const actionText = remove ? 'إزالة' : 'إضافة';
  await message.channel.send(`✅ تم ${actionText} ${targetText} ${remove ? 'من' : 'إلى'} قائمة الثقة.`);
  return true;
}

export function antiRaidPermission() {
  return PermissionFlagsBits.ViewAuditLog;
}

export { TRUST_KEY };
