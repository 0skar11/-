import { AuditLogEvent, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { logger } from '../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';
import { findRecentAuditEntry, sendAntiNukeLog } from '../utils/antiNukeLogging.js';
import { isServerOwner } from '../config/serverOwners.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';

const ROLE_PERMISSIONS_CHANNEL_ID = '1550598605382099044';
const PERMISSION_BOARD_FOOTER = 'Staff permissions • Anti-Raid / Anti-Nuke administration';

const PERMISSION_LABELS = new Map([
  [PermissionFlagsBits.Administrator, 'Administrator — إدارة كاملة'],
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log — مشاهدة سجل التدقيق'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server — إدارة السيرفر'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels — إدارة الرومات'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles — إدارة الرتب'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks — إدارة الويب هوكس'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages — إدارة الرسائل'],
  [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames — إدارة الأسماء'],
  [PermissionFlagsBits.KickMembers, 'Kick Members — طرد الأعضاء'],
  [PermissionFlagsBits.BanMembers, 'Ban Members — حظر الأعضاء'],
  [PermissionFlagsBits.ModerateMembers, 'Moderate Members — تايم أوت'],
  [PermissionFlagsBits.ViewChannel, 'View Channels — مشاهدة الرومات'],
  [PermissionFlagsBits.SendMessages, 'Send Messages — إرسال الرسائل'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History — قراءة سجل الرسائل'],
  [PermissionFlagsBits.Connect, 'Connect — دخول الصوت'],
  [PermissionFlagsBits.Speak, 'Speak — التحدث بالصوت'],
  [PermissionFlagsBits.MoveMembers, 'Move Members — سحب ونقل من الفويس'],
  [PermissionFlagsBits.MuteMembers, 'Mute Members — ميوت بالفويس'],
  [PermissionFlagsBits.DeafenMembers, 'Deafen Members — ديفن بالفويس'],
  [PermissionFlagsBits.ManageThreads, 'Manage Threads — إدارة الثريدات'],
  [PermissionFlagsBits.ManageEvents, 'Manage Events — إدارة الفعاليات'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone — منشن الجميع'],
  [PermissionFlagsBits.SendMessagesInThreads, 'Send Messages in Threads — الكتابة في الثريدات'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links — إرسال الروابط'],
  [PermissionFlagsBits.AttachFiles, 'Attach Files — إرسال الملفات'],
  [PermissionFlagsBits.AddReactions, 'Add Reactions — الرياكشن'],
  [PermissionFlagsBits.UseExternalEmojis, 'Use External Emojis — إيموجي خارجي'],
  [PermissionFlagsBits.PinMessages, 'Pin Messages — تثبيت الرسائل'],
  [PermissionFlagsBits.Stream, 'Video / Stream — الكاميرا والشير'],
  [PermissionFlagsBits.UseVAD, 'Voice Activity — التحدث بدون ضغط زر'],
  [PermissionFlagsBits.PrioritySpeaker, 'Priority Speaker — أولوية التحدث'],
  [PermissionFlagsBits.RequestToSpeak, 'Request to Speak — طلب التحدث في الستيدج'],
  [PermissionFlagsBits.UseSoundboard, 'Use Soundboard — الساوند بورد'],
  [PermissionFlagsBits.UseExternalSounds, 'Use External Sounds — أصوات خارجية'],
  [PermissionFlagsBits.UseEmbeddedActivities, 'Use Activities — الأنشطة في الفويس'],
  [PermissionFlagsBits.SetVoiceChannelStatus, 'Set Voice Status — حالة روم الفويس'],
]);

// Every permission except Administrator: 🔨 Moderator can do everything without being an administrator.
const ALL_EXCEPT_ADMINISTRATOR = new PermissionsBitField(PermissionsBitField.All).remove(PermissionFlagsBits.Administrator).bitfield;

const BASE_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];

// Chat moderation: timeout/mute and /warn (ModerateMembers), /usernotes and message cleanup (ManageMessages), /cases (ViewAuditLog).
const CHAT_MODERATOR_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.PinMessages,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseExternalEmojis,
];

// Every voice permission: disconnect/move, server mute and deafen, plus everything a member can do in voice.
const VOICE_MODERATOR_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.RequestToSpeak,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.UseExternalSounds,
  PermissionFlagsBits.UseEmbeddedActivities,
  PermissionFlagsBits.SetVoiceChannelStatus,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
];

// Trial moderator: /warn and /timeout (ModerateMembers), /kick (KickMembers) and /usernotes (ManageMessages); never ban.
const TRIAL_MODERATOR_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageMessages,
];

// Support staff answer tickets only: no moderation permission at all.
const SUPPORT_STAFF_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
];

// Highest first. ⚔️ Senior Moderator and everything above it are Administrator.
const ROLE_DEFINITIONS = [
  { name: '👑 Owner', color: '#f1c40f', permissions: [PermissionFlagsBits.Administrator] },
  { name: '⚡ Head Admin', color: '#e74c3c', permissions: [PermissionFlagsBits.Administrator] },
  { name: '🛡️ Admin', color: '#e67e22', permissions: [PermissionFlagsBits.Administrator] },
  { name: '🎖️ Supervisor', color: '#9b59b6', permissions: [PermissionFlagsBits.Administrator] },
  { name: '⚔️ Senior Moderator', color: '#16a085', permissions: [PermissionFlagsBits.Administrator] },
  // allButAdministrator: the board sums Moderator up in one line; ~50 permissions spelled out would not fit Discord's embed limits.
  { name: '🔨 Moderator', color: '#2ecc71', permissions: [ALL_EXCEPT_ADMINISTRATOR], allButAdministrator: true },
  { name: '💬 Chat Moderator', color: '#e84393', permissions: CHAT_MODERATOR_PERMISSIONS },
  { name: '🎧 Voice Moderator', color: '#6c5ce7', permissions: VOICE_MODERATOR_PERMISSIONS },
  { name: '🔰 Trial Moderator', color: '#3498db', permissions: TRIAL_MODERATOR_PERMISSIONS },
  { name: '🎫 Support Staff', color: '#95a5a6', permissions: SUPPORT_STAFF_PERMISSIONS },
];

// Roles removed from the server on purpose (🧪 Developer and the non-booster VIP); deleted on startup if they still exist.
const RETIRED_ROLE_IDS = ['1551308801439698965', '1551311500025798736'];
// Retired roles known only by name (the owner removed Event Manager completely), matched on their letters
// only so "📢 Event Manager", "Event Manager" or "event manger" all count.
const RETIRED_ROLE_NAMES = ['eventmanager', 'eventmanger'];
export const isRetiredRoleName = (name) => RETIRED_ROLE_NAMES.includes(String(name || '').toLowerCase().replace(/[^a-z]/g, ''));

// role.permissions.toArray() returns flag names ('ViewAuditLog'), while the labels are keyed by bit.
function permissionNames(permissions) {
  return permissions.map((permission) => `✅ ${PERMISSION_LABELS.get(PermissionFlagsBits[permission] ?? permission) || permission}`);
}

function allButAdministratorLines(role) {
  const lines = ['✅ كل الصلاحيات ما عدا Administrator'];
  const missing = role.permissions.missing(ALL_EXCEPT_ADMINISTRATOR, false);
  if (missing.length) lines.push(`❌ ناقصة: ${missing.join(', ')}`);
  return lines;
}

// A plain embed object rather than an EmbedBuilder: src/utils/embeds.js drops builder footers (and strips emojis),
// and the footer is how the bot recognizes its board message to edit it instead of posting a new one.
function buildBoardEmbed(role, definition) {
  const permissionLines = definition.allButAdministrator ? allButAdministratorLines(role) : permissionNames(role.permissions.toArray());
  return {
    color: role.color || parseInt(definition.color.slice(1), 16),
    title: `${role.name} — الصلاحيات`,
    description: `الرتبة: ${role}\n\n${permissionLines.join('\n') || 'لا توجد صلاحيات إضافية'}`,
    footer: { text: PERMISSION_BOARD_FOOTER },
  };
}

export async function deleteRetiredRoles(guild) {
  let deleted = 0;
  for (const roleId of RETIRED_ROLE_IDS) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) continue;
    await role.delete('Retired role removed by the owner');
    deleted += 1;
  }
  const roles = await guild.roles.fetch().catch(() => null);
  for (const role of roles?.values() || []) {
    if (!isRetiredRoleName(role.name) || role.managed || !role.editable) continue;
    await role.delete('Retired role removed by the owner');
    deleted += 1;
  }
  return deleted;
}

function grantablePermissions(botMember, definition) {
  const wanted = new PermissionsBitField(definition.permissions);
  if (botMember.permissions.has(PermissionFlagsBits.Administrator)) return wanted.bitfield;
  const missing = botMember.permissions.missing(wanted, false);
  if (missing.length) logger.warn(`${definition.name}: the bot lacks ${missing.join(', ')} and cannot grant it. Give the bot Administrator.`);
  return new PermissionsBitField(wanted.bitfield & botMember.permissions.bitfield).bitfield;
}

// Config keys: which role is which staff role (so an owner can rename one), and the roles an owner edited by hand.
const STAFF_ROLE_IDS_KEY = 'staffRoleIds';
const OWNER_KEPT_ROLES_KEY = 'staffRolesKeptByOwner';

function findStaffRole(roles, definition, config) {
  const storedId = config?.[STAFF_ROLE_IDS_KEY]?.[definition.name];
  const stored = storedId ? roles.get?.(storedId) : null;
  if (stored && !stored.managed) return stored;
  return roles.find((candidate) => candidate.name === definition.name && !candidate.managed);
}

// Role updates the bot makes itself (sync, reverting a stranger's edit) must not be judged again by the guard,
// even when the audit log still shows the previous editor. The bot remembers the exact state it set, so any
// other edit landing right after it is still judged.
const botEdits = new Map();
const markBotEdit = (role, changes) => botEdits.set(role.id, JSON.stringify({ ...roleSnapshot(role), ...changes }));
function isBotEdit(role) {
  const expected = botEdits.get(role.id);
  if (!expected || expected !== JSON.stringify(roleSnapshot(role))) return false;
  botEdits.delete(role.id);
  return true;
}

export async function synchronizeStaffRoles(guild) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn(`Role hierarchy skipped for ${guild.name}: bot needs Manage Roles.`);
    return { created: 0, updated: 0, positioned: 0, kept: 0 };
  }

  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  const keptByOwner = new Set(config?.[OWNER_KEPT_ROLES_KEY] || []);
  const roleIds = {};
  const roles = await guild.roles.fetch();
  const managedRoles = [];
  let created = 0;
  let updated = 0;
  let kept = 0;

  for (const definition of ROLE_DEFINITIONS) {
    // Discord only lets the bot grant permissions it holds itself (all of them when it is an Administrator).
    const permissions = grantablePermissions(botMember, definition);
    let role = findStaffRole(roles, definition, config);
    try {
      if (!role) {
        role = await guild.roles.create({ name: definition.name, color: definition.color, hoist: true, mentionable: false, permissions, reason: 'Create/update ordered staff role hierarchy' });
        created += 1;
      } else if (keptByOwner.has(role.id)) {
        // An owner edited this role by hand: leave it exactly as they set it.
        kept += 1;
      } else if (role.position < botMember.roles.highest.position) {
        markBotEdit(role, { colors: [parseInt(definition.color.slice(1), 16), null, null], hoist: true, permissions: String(permissions) });
        await role.edit({ color: definition.color, hoist: true, permissions, reason: 'Synchronize ordered staff role permissions' });
        updated += 1;
      } else {
        logger.warn(`Role ${definition.name} in ${guild.name} is above the bot's highest role; its permissions were not synchronized.`);
      }
    } catch (error) {
      logger.error(`Failed to synchronize ${definition.name} in ${guild.name}:`, error);
    }
    if (role?.id) roleIds[definition.name] = role.id;
    if (role && !role.managed && role.position < botMember.roles.highest.position) managedRoles.push(role);
  }

  if (config && JSON.stringify(roleIds) !== JSON.stringify(config[STAFF_ROLE_IDS_KEY] || {})) {
    await updateGuildConfig(guild.client, guild.id, { [STAFF_ROLE_IDS_KEY]: roleIds }).catch((error) => logger.warn(`Staff role ids not saved for ${guild.name}: ${error.message}`));
  }

  const refreshedBotMember = await guild.members.fetchMe();
  const highestPosition = refreshedBotMember.roles.highest.position;
  const positionUpdates = managedRoles.map((role, index) => ({ role: role.id, position: Math.max(1, highestPosition - index - 1) }));
  if (positionUpdates.length) await guild.roles.setPositions(positionUpdates);
  return { created, updated, positioned: positionUpdates.length, kept };
}

// What a staff role edit can change (position is left out: Discord logs no audit entry for it).
function roleSnapshot(role) {
  return {
    name: role.name,
    colors: role.colors ? [role.colors.primaryColor, role.colors.secondaryColor ?? null, role.colors.tertiaryColor ?? null] : [role.color, null, null],
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: String(role.permissions?.bitfield ?? 0n),
    icon: role.icon || null,
    unicodeEmoji: role.unicodeEmoji || null,
  };
}

function isStaffRole(role, config) {
  const ids = Object.values(config?.[STAFF_ROLE_IDS_KEY] || {});
  return ids.includes(role.id) || ROLE_DEFINITIONS.some((definition) => definition.name === role.name);
}

async function findRoleEditor(guild, roleId, retryDelayMs) {
  const entry = await findRecentAuditEntry(guild, AuditLogEvent.RoleUpdate, roleId);
  if (entry?.executor?.id) return entry.executor;
  // The audit entry can lag behind the gateway event, so look once more before giving up.
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  return (await findRecentAuditEntry(guild, AuditLogEvent.RoleUpdate, roleId))?.executor || null;
}

/**
 * Staff roles belong to the server owners: an edit by one of them (SERVER_OWNER_IDS) is kept, and the startup
 * sync leaves that role alone from then on. An edit by anyone else is reverted to how the role was before.
 * @returns {Promise<'ignored'|'bot'|'kept'|'reverted'|'unknown'|'failed'>}
 */
export async function guardStaffRoleUpdate(oldRole, newRole, { retryDelayMs = 1500 } = {}) {
  const guild = newRole?.guild;
  if (!guild || newRole.managed) return 'ignored';
  const before = roleSnapshot(oldRole);
  const after = roleSnapshot(newRole);
  if (JSON.stringify(before) === JSON.stringify(after)) return 'ignored';

  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if (!isStaffRole(oldRole, config) && !isStaffRole(newRole, config)) return 'ignored';
  if (isBotEdit(newRole)) return 'bot';

  const editor = await findRoleEditor(guild, newRole.id, retryDelayMs);
  if (!editor) {
    logger.warn(`Staff role ${newRole.name} (${newRole.id}) in ${guild.name} was edited but the audit log shows no editor; left as is.`);
    return 'unknown';
  }
  if (editor.id === guild.client.user?.id) return 'bot';

  if (isServerOwner(editor.id)) {
    const kept = new Set(config?.[OWNER_KEPT_ROLES_KEY] || []);
    kept.add(newRole.id);
    await updateGuildConfig(guild.client, guild.id, { [OWNER_KEPT_ROLES_KEY]: [...kept] })
      .catch((error) => logger.warn(`Owner edit of ${newRole.name} not remembered: ${error.message}`));
    return 'kept';
  }

  const [primaryColor, secondaryColor, tertiaryColor] = before.colors;
  const restore = { name: before.name, colors: { primaryColor, secondaryColor, tertiaryColor }, hoist: before.hoist, mentionable: before.mentionable, permissions: BigInt(before.permissions) };
  if (before.icon !== after.icon) restore.icon = oldRole.iconURL?.({ extension: 'png' }) || null;
  if (before.unicodeEmoji !== after.unicodeEmoji) restore.unicodeEmoji = before.unicodeEmoji;
  try {
    markBotEdit(newRole, before);
    await newRole.edit({ ...restore, reason: `Staff roles are owner-only: reverted an edit by ${editor.tag || editor.id}` });
  } catch (error) {
    logger.error(`Failed to revert ${newRole.name} in ${guild.name}:`, error);
    return 'failed';
  }
  await sendAntiNukeLog(guild, {
    action: 'Staff role edited',
    target: `${before.name} (${newRole.id})`,
    executor: editor,
    punishment: 'تم إرجاع الرتبة زي ما كانت',
    reason: `عدّل رتبة إدارية (${before.name}) وهو مش من الأونرز`,
  }).catch(() => {});
  return 'reverted';
}

const BOARD_KEY = 'staffPermissions';
// Bump this to wipe the permission channel once more and post a fresh board on the next startup.
// Otherwise the bot never posts in that channel; it only edits its board message.
const BOARD_RESET_VERSION = 1;
const BOARD_RESET_CONFIG_KEY = 'staffPermissionBoardResetVersion';
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;

async function fetchBoardChannel(guild, { reset = false } = {}) {
  const channel = await guild.channels.fetch(ROLE_PERMISSIONS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`Permission channel ${ROLE_PERMISSIONS_CHANNEL_ID} was not found in guild ${guild.id}`);

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory];
  if (reset) required.push(PermissionFlagsBits.ManageMessages);
  if (!permissions?.has(required)) throw new Error(`Missing permissions in channel ${ROLE_PERMISSIONS_CHANNEL_ID}: ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory${reset ? ' and ManageMessages' : ''} are required`);
  return channel;
}

// One message holds every staff role's embed (one embed per role, in hierarchy order).
async function buildBoardEmbeds(guild) {
  const roles = await guild.roles.fetch();
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  return ROLE_DEFINITIONS.flatMap((definition) => {
    const role = findStaffRole(roles, definition, config);
    return role ? [buildBoardEmbed(role, definition)] : [];
  });
}

/** Deletes every message in the channel, the bot's own included. Messages older than 14 days can't be bulk deleted, so they go one by one. */
async function wipeChannel(channel) {
  let deleted = 0;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100 });
    if (!batch.size) break;
    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const recent = [...batch.values()].filter((message) => message.createdTimestamp > cutoff);
    const old = [...batch.values()].filter((message) => message.createdTimestamp <= cutoff);
    let removed = 0;
    if (recent.length > 1) removed += (await channel.bulkDelete(recent.map((message) => message.id), true)).size;
    else if (recent.length === 1) removed += await recent[0].delete().then(() => 1).catch(() => 0);
    for (const message of old) removed += await message.delete().then(() => 1).catch(() => 0);
    deleted += removed;
    if (!removed) break;
  }
  return deleted;
}

const isBoard = (guild) => (message) => message.author?.id === guild.client.user.id && message.embeds[0]?.footer?.text === PERMISSION_BOARD_FOOTER;

/**
 * Edits the bot's permission board to match the current roles. It never posts: when the board message
 * is missing, nothing is sent ({ status: 'missing' }).
 * With `reset`, every message in the channel is deleted first and one fresh board message is posted.
 */
export async function publishStaffPermissionBoard(guild, { reset = false } = {}) {
  const channel = await fetchBoardChannel(guild, { reset });
  const embeds = await buildBoardEmbeds(guild);
  const result = { guildId: guild.id, channelId: channel.id, deleted: 0 };

  if (reset) {
    result.deleted = await wipeChannel(channel);
    if (!embeds.length) return { ...result, status: 'no-roles' };
    const posted = await channel.send({ embeds });
    await rememberBoardMessage(channel, BOARD_KEY, posted.id);
    logger.info(`Permission board in guild ${guild.id}: channel ${channel.id} cleared (${result.deleted} messages) and the board was posted`);
    return { ...result, status: 'sent' };
  }

  const existing = await findBoardMessage(channel, BOARD_KEY, isBoard(guild));
  if (!existing) return { ...result, status: 'missing' };
  if (!embeds.length) return { ...result, status: 'no-roles' };
  await existing.edit({ embeds });
  return { ...result, status: 'updated' };
}

/**
 * Startup refresh: the first run after BOARD_RESET_VERSION changes clears the channel and posts the board
 * once; every other run only edits the existing board message.
 */
export async function refreshStaffPermissionBoard(guild) {
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  // Without the config the reset state is unknown, so play safe and only edit.
  const reset = Boolean(config) && config[BOARD_RESET_CONFIG_KEY] !== BOARD_RESET_VERSION;
  const result = await publishStaffPermissionBoard(guild, { reset });
  if (reset) await updateGuildConfig(guild.client, guild.id, { [BOARD_RESET_CONFIG_KEY]: BOARD_RESET_VERSION });
  return result;
}

export { ROLE_DEFINITIONS, ALL_EXCEPT_ADMINISTRATOR, CHAT_MODERATOR_PERMISSIONS, VOICE_MODERATOR_PERMISSIONS, TRIAL_MODERATOR_PERMISSIONS, SUPPORT_STAFF_PERMISSIONS, ROLE_PERMISSIONS_CHANNEL_ID, RETIRED_ROLE_IDS, BOARD_RESET_VERSION };
