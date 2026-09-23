import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

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
  { name: '🧪 Developer', color: '#9b59b6', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  { name: '📢 Event Manager', color: '#f39c12', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageEvents, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
];

function permissionNames(permissions) {
  return permissions.map((permission) => `✅ ${PERMISSION_LABELS.get(permission) || permission}`);
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

export async function publishStaffPermissionBoard(guild) {
  const channel = await guild.channels.fetch(ROLE_PERMISSIONS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`Permission channel ${ROLE_PERMISSIONS_CHANNEL_ID} was not found in guild ${guild.id}`);

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory];
  if (!permissions?.has(required)) throw new Error(`Missing permissions in channel ${ROLE_PERMISSIONS_CHANNEL_ID}: ViewChannel, SendMessages, EmbedLinks and ReadMessageHistory are required`);

  // This board is intentionally persistent. Never delete/repost it on bot restarts.
  const oldMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  // If the history can't be read we can't tell whether the board exists, so don't post.
  if (!oldMessages) throw new Error(`Could not read message history in channel ${ROLE_PERMISSIONS_CHANNEL_ID}`);
  const existingBoardMessages = oldMessages.filter((message) =>
    message.author.id === guild.client.user.id && message.embeds[0]?.footer?.text === PERMISSION_BOARD_FOOTER
  );
  if (existingBoardMessages.size > 0) {
    logger.info(`Permission board already exists in guild ${guild.id}; skipping repost.`);
    return { sent: 0, existing: existingBoardMessages.size, guildId: guild.id, channelId: channel.id };
  }

  const roles = await guild.roles.fetch();
  let sent = 0;
  for (const definition of ROLE_DEFINITIONS) {
    const role = roles.find((candidate) => candidate.name === definition.name && !candidate.managed);
    if (!role) continue;
    const permissionLines = permissionNames(role.permissions.toArray());
    const embed = new EmbedBuilder()
      .setColor(role.color || definition.color)
      .setTitle(`${role.name} — الصلاحيات`)
      .setDescription(`الرتبة: ${role}\n\n${permissionLines.join('\n') || 'لا توجد صلاحيات إضافية'}`)
      .setFooter({ text: PERMISSION_BOARD_FOOTER });
    await channel.send({ embeds: [embed] });
    sent += 1;
  }
  logger.info(`Published ${sent} admin permission messages in guild ${guild.id}, channel ${ROLE_PERMISSIONS_CHANNEL_ID}`);
  return { sent, existing: 0, guildId: guild.id, channelId: channel.id };
}

export { ROLE_DEFINITIONS, ROLE_PERMISSIONS_CHANNEL_ID };
