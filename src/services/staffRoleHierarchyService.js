import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';
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
  [PermissionFlagsBits.ManageEvents, 'Manage Events — إدارة الفعاليات'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone — منشن الجميع'],
]);

const ROLE_DEFINITIONS = [
  { name: '👑 Owner', color: '#f1c40f', permissions: [PermissionFlagsBits.Administrator] },
  { name: '⚡ Head Admin', color: '#e74c3c', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageEvents, PermissionFlagsBits.MentionEveryone] },
  { name: '🛡️ Admin', color: '#e67e22', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  { name: '🔨 Moderator', color: '#2ecc71', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  { name: '🔰 Trial Moderator', color: '#3498db', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  { name: '📢 Event Manager', color: '#f39c12', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageEvents, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
];

// Roles removed from the server on purpose (🧪 Developer and the non-booster VIP); deleted on startup if they still exist.
const RETIRED_ROLE_IDS = ['1551308801439698965', '1551311500025798736'];

// role.permissions.toArray() returns flag names ('ViewAuditLog'), while the labels are keyed by bit.
function permissionNames(permissions) {
  return permissions.map((permission) => `✅ ${PERMISSION_LABELS.get(PermissionFlagsBits[permission] ?? permission) || permission}`);
}

// A plain embed object rather than an EmbedBuilder: src/utils/embeds.js drops builder footers (and strips emojis),
// and the footer is how the bot recognizes its board message to edit it instead of posting a new one.
function buildBoardEmbed(role, definition) {
  const permissionLines = permissionNames(role.permissions.toArray());
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
  return deleted;
}

export async function synchronizeStaffRoles(guild) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn(`Role hierarchy skipped for ${guild.name}: bot needs Manage Roles.`);
    return { created: 0, updated: 0, positioned: 0 };
  }

  const roles = await guild.roles.fetch();
  const managedRoles = [];
  let created = 0;
  let updated = 0;

  for (const definition of ROLE_DEFINITIONS) {
    let role = roles.find((candidate) => candidate.name === definition.name && !candidate.managed);
    if (!role) {
      role = await guild.roles.create({ name: definition.name, color: definition.color, hoist: true, mentionable: false, permissions: definition.permissions, reason: 'Create/update ordered staff role hierarchy' });
      created += 1;
    } else if (role.position < botMember.roles.highest.position) {
      await role.edit({ color: definition.color, hoist: true, permissions: definition.permissions, reason: 'Synchronize ordered staff role permissions' });
      updated += 1;
    }
    if (!role.managed && role.position < botMember.roles.highest.position) managedRoles.push(role);
  }

  const refreshedBotMember = await guild.members.fetchMe();
  const highestPosition = refreshedBotMember.roles.highest.position;
  const positionUpdates = managedRoles.map((role, index) => ({ role: role.id, position: Math.max(1, highestPosition - index - 1) }));
  if (positionUpdates.length) await guild.roles.setPositions(positionUpdates);
  return { created, updated, positioned: positionUpdates.length };
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
  return ROLE_DEFINITIONS.flatMap((definition) => {
    const role = roles.find((candidate) => candidate.name === definition.name && !candidate.managed);
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

export { ROLE_DEFINITIONS, ROLE_PERMISSIONS_CHANNEL_ID, RETIRED_ROLE_IDS, BOARD_RESET_VERSION };
