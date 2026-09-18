import { AuditLogEvent, PermissionFlagsBits } from 'discord.js';

const TRUST_KEY = guildId => `guild:${guildId}:antiRaidTrust`;
const WINDOW_MS = 60_000;
const MESSAGE_WINDOW_MS = 20_000;
const AUDIT_WINDOW_MS = 15_000;
const PUNISH_COOLDOWN_MS = 5 * 60_000;
const PROCESSED_AUDIT_TTL_MS = 2 * 60_000;

const state = new Map();

function createState() {
  return {
    kicks: [],
    bans: [],
    messageDeletes: [],
    channels: [],
    roles: [],
    roleUpdates: [],
    punished: new Map(),
    processedAudit: new Map(),
  };
}

function getState(guildId) {
  if (!state.has(guildId)) state.set(guildId, createState());
  return state.get(guildId);
}

function pruneState(guildId) {
  const now = Date.now();
  const current = getState(guildId);

  for (const key of ['kicks', 'bans', 'channels', 'roles', 'roleUpdates']) {
    current[key] = current[key].filter(event => now - event.time <= WINDOW_MS);
  }
  current.messageDeletes = current.messageDeletes.filter(event => now - event.time <= MESSAGE_WINDOW_MS);

  for (const [userId, timestamp] of current.punished.entries()) {
    if (now - timestamp > PUNISH_COOLDOWN_MS) current.punished.delete(userId);
  }
  for (const [auditKey, timestamp] of current.processedAudit.entries()) {
    if (now - timestamp > PROCESSED_AUDIT_TTL_MS) current.processedAudit.delete(auditKey);
  }
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
  const id = userId || roleId;
  if (!id) return trust;

  const collection = userId ? trust.trustedUserIds : trust.trustedRoleIds;
  const next = remove ? collection.filter(item => item !== id) : [...new Set([...collection, id])];

  if (userId) trust.trustedUserIds = next;
  else trust.trustedRoleIds = next;

  await guild.client.db.set(TRUST_KEY(guild.id), trust);
  return trust;
}

export async function isTrusted(guild, userId, { member = null } = {}) {
  const trust = await readTrust(guild);
  if (trust.trustedUserIds.includes(userId)) return true;

  const resolvedMember = member
    || guild.members.cache.get(userId)
    || await guild.members.fetch(userId).catch(() => null);

  return Boolean(resolvedMember?.roles.cache.some(role => trust.trustedRoleIds.includes(role.id)));
}

function addEvent(guildId, type, amount = 1) {
  pruneState(guildId);
  const current = getState(guildId);
  const now = Date.now();

  current[type].push({ time: now, amount });
  return current[type].reduce((total, event) => total + event.amount, 0);
}

function markAuditProcessed(guildId, scope, entryId) {
  if (!entryId) return true;

  pruneState(guildId);
  const current = getState(guildId);
  const key = `${scope}:${entryId}`;
  if (current.processedAudit.has(key)) return false;

  current.processedAudit.set(key, Date.now());
  return true;
}

async function findRecentAuditEntry(guild, type, targetId) {
  const logs = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);
  if (!logs?.entries?.size) return null;

  const now = Date.now();
  for (const entry of logs.entries.values()) {
    if (!entry?.executor || !entry?.createdTimestamp) continue;
    if (now - entry.createdTimestamp > AUDIT_WINDOW_MS) continue;
    if (targetId && entry.target?.id !== targetId) continue;
    if (entry.executor.id === guild.members.me?.id) continue;
    return entry;
  }
  return null;
}

async function punish(guild, executor, reason, mode = 'kick') {
  if (!executor || executor.id === guild.ownerId || executor.id === guild.members.me?.id) return false;
  if (await isTrusted(guild, executor.id)) return false;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  const botMember = guild.members.me;
  if (!member || !botMember || member.roles.highest.position >= botMember.roles.highest.position) return false;

  pruneState(guild.id);
  const current = getState(guild.id);
  if (current.punished.has(executor.id)) return true;

  current.punished.set(executor.id, Date.now());

  if (mode === 'strip') {
    const removable = member.roles.cache.filter(role => role.id !== guild.id && !role.managed && role.position < botMember.roles.highest.position);
    if (removable.size > 0) {
      await member.roles.remove(removable, `Anti-raid: ${reason}`).catch(() => {});
    }
    return true;
  }

  if (member.kickable) {
    await member.kick(`Anti-raid: ${reason}`).catch(() => {});
  }
  return true;
}

export async function inspectMemberRemoval(member, action = AuditLogEvent.MemberKick) {
  const guild = member.guild;
  const targetId = member.user?.id || member.id;
  const entry = await findRecentAuditEntry(guild, action, targetId);
  if (!entry || !markAuditProcessed(guild.id, 'memberRemoval', entry.id)) return;

  const type = action === AuditLogEvent.MemberBanAdd ? 'bans' : 'kicks';
  const total = addEvent(guild.id, type);
  if (total >= 10) await punish(guild, entry.executor, `${total} members removed in one minute`);
}

export async function inspectMessageDelete(message) {
  const entry = await findRecentAuditEntry(message.guild, AuditLogEvent.MessageBulkDelete, message.channelId);
  if (!entry || !markAuditProcessed(message.guild.id, 'bulkDelete', entry.id)) return;

  const count = Math.max(1, Number(entry.extra?.count || 1));
  const total = addEvent(message.guild.id, 'messageDeletes', count);
  if (total >= 20) await punish(message.guild, entry.executor, `${total} messages deleted in twenty seconds`);
}

export async function inspectChannelDelete(channel) {
  const entry = await findRecentAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!entry || !markAuditProcessed(channel.guild.id, 'channelDelete', entry.id)) return;

  if (addEvent(channel.guild.id, 'channels') >= 3) {
    await punish(channel.guild, entry.executor, 'three channels deleted in one minute');
  }
}

export async function inspectRoleDelete(role) {
  const entry = await findRecentAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
  if (!entry || !markAuditProcessed(role.guild.id, 'roleDelete', entry.id)) return;

  if (addEvent(role.guild.id, 'roles') >= 3) {
    await punish(role.guild, entry.executor, 'three roles deleted in one minute');
  }
}

export async function inspectRoleUpdate(role) {
  const entry = await findRecentAuditEntry(role.guild, AuditLogEvent.RoleUpdate, role.id);
  if (!entry || !markAuditProcessed(role.guild.id, 'roleUpdate', entry.id)) return;

  if (addEvent(role.guild.id, 'roleUpdates') >= 3) {
    await punish(role.guild, entry.executor, 'mass role or permission changes', 'strip');
  }
}

function guildRole(guild, id) {
  return guild.roles.cache.get(id) || null;
}

export async function handleAntiRaidCommand(message) {
  const match = message.content.trim().match(/^(انترايد|تراست|انتراست)\s*(.*)$/u);
  if (!match) return false;

  const [, command, rawTarget] = match;
  if (command === 'انترايد') {
    if (message.guild.ownerId !== message.author.id) {
      await message.channel.send('❌ هذا الأمر لمالك السيرفر فقط.');
      return true;
    }
    await message.channel.send('🛡️ Anti-Raid يعمل تلقائيًا: 10 طرد/بان خلال دقيقة، 20 رسالة خلال 20 ثانية، و3 قنوات/رتب خلال دقيقة.');
    return true;
  }

  const canManageTrust = message.guild.ownerId === message.author.id
    || await isTrusted(message.guild, message.author.id, { member: message.member ?? null });
  if (!canManageTrust) {
    await message.channel.send('❌ هذا الأمر لمالك السيرفر أو مستخدم موثوق فقط.');
    return true;
  }

  const normalizedTarget = rawTarget.trim();

  const target = normalizedTarget.match(/^<@!?(\d+)>$/u)
    || normalizedTarget.match(/^<@&(\d+)>$/u)
    || normalizedTarget.match(/^(\d{17,20})$/u);

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

  await updateAntiRaidTrust(message.guild, {
    userId: user?.id,
    roleId: role?.id,
    remove: command === 'انتراست',
  });

  await message.channel.send(
    command === 'تراست'
      ? `✅ تمت إضافة ${role || user} إلى قائمة الثقة.`
      : `✅ تمت إزالة ${role || user} من قائمة الثقة.`,
  );
  return true;
}

export function antiRaidPermission() {
  return PermissionFlagsBits.ViewAuditLog;
}
