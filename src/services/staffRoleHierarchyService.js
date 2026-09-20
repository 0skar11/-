import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

const ROLE_PERMISSIONS_CHANNEL_ID = '1550598605382099044';

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
  { name: '🛡️ Admin', color: '#e67e22', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageEvents] },
  { name: '🔨 Moderator', color: '#2ecc71', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  { name: '🔰 Trial Moderator', color: '#3498db', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  { name: '🧪 Developer', color: '#9b59b6', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  { name: '📢 Event Manager', color: '#f39c12', permissions: [PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageEvents, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
  // VIP is intentionally excluded from the administration permission board.
  { name: '🌟 VIP', color: '#f1c40f', permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak], memberOnly: true },
];

function permissionNames(permissions) {
  return permissions.map((permission) => `✅ ${PERMISSION_LABELS.get(permission) || permission}`);
}

export async function synchronizeStaffRoles(guild) {
  const botMember = guild.members.me;
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
    } else {
      if (role.position >= botMember.roles.highest.position) {
        logger.warn(`Cannot update ${definition.name} in ${guild.name}: role is above the bot.`);
        continue;
      }
      await role.edit({ color: definition.color, hoist: true, permissions: definition.permissions, reason: 'Synchronize ordered staff role permissions' });
      updated += 1;
    }
    if (!role.managed && role.position < botMember.roles.highest.position) managedRoles.push(role);
  }

  const refreshedBotMember = await guild.members.fetchMe();
  const highestPosition = refreshedBotMember.roles.highest.position;
  const positionUpdates = managedRoles.map((role, index) => ({ role: role.id, position: Math.max(1, highestPosition - index - 1) }));
  if (positionUpdates.length > 0) await guild.roles.setPositions(positionUpdates);

  return { created, updated, positioned: positionUpdates.length };
}

export async function publishStaffPermissionBoard(guild) {
  const channel = await guild.channels.fetch(ROLE_PERMISSIONS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Permission board channel ${ROLE_PERMISSIONS_CHANNEL_ID} was not found in ${guild.name}.`);
    return 0;
  }

  const me = guild.members.me;
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    logger.warn(`Permission board skipped in ${guild.name}: bot needs View Channel, Send Messages and Embed Links.`);
    return 0;
  }

  const oldMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const oldBoardMessages = oldMessages?.filter((message) => (
    message.author.id === guild.client.user.id && message.content === 'STAFF_PERMISSION_BOARD'
  )) || [];
  if (oldBoardMessages.size) await channel.bulkDelete(oldBoardMessages, true).catch(() => {});

  let sent = 0;
  for (const definition of ROLE_DEFINITIONS.filter((role) => !role.memberOnly)) {
    const role = guild.roles.cache.find((candidate) => candidate.name === definition.name && !candidate.managed);
    if (!role) continue;

    const embed = new EmbedBuilder()
      .setColor(definition.color)
      .setTitle(`${definition.name} — الصلاحيات`)
      .setDescription(`الرتبة: ${role}\n\n${permissionNames(definition.permissions).join('\n')}`)
      .setFooter({ text: 'Staff permissions • Anti-Raid / Anti-Nuke administration' })
      .setTimestamp();

    await channel.send({ content: 'STAFF_PERMISSION_BOARD', embeds: [embed] });
    sent += 1;
  }

  return sent;
}

export { ROLE_DEFINITIONS };
