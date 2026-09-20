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

function permissionNames(permissions) {
  return permissions.map((permission) => `✅ ${PERMISSION_LABELS.get(permission) || permission}`);
}

export async function publishStaffPermissionBoard(guild) {
  const channel = await guild.channels.fetch(ROLE_PERMISSIONS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Permission board channel ${ROLE_PERMISSIONS_CHANNEL_ID} was not found in ${guild.name}.`);
    return 0;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    logger.warn(`Permission board skipped in ${guild.name}: bot needs View Channel, Send Messages and Embed Links.`);
    return 0;
  }

  // Delete only previous board messages. Do it individually so Manage Messages
  // is optional and old messages do not prevent the new board from being sent.
  const oldMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const oldBoardMessages = oldMessages?.filter((message) => (
    message.author.id === guild.client.user.id && message.embeds[0]?.footer?.text === 'Staff permissions • Anti-Raid / Anti-Nuke administration'
  )) || [];
  for (const message of oldBoardMessages.values()) {
    await message.delete().catch(() => {});
  }

  const adminRoleNames = new Set(['👑 Owner', '⚡ Head Admin', '🛡️ Admin', '🔨 Moderator', '🔰 Trial Moderator', '🧪 Developer', '📢 Event Manager']);
  const roles = await guild.roles.fetch();
  let sent = 0;

  for (const role of roles.values()) {
    if (!adminRoleNames.has(role.name) || role.managed) continue;

    const permissionsForRole = role.permissions.toArray();
    const embed = new EmbedBuilder()
      .setColor(role.color || 0x5865f2)
      .setTitle(`${role.name} — الصلاحيات`)
      .setDescription(`الرتبة: ${role}\n\n${permissionNames(permissionsForRole).join('\n') || 'لا توجد صلاحيات إضافية'}`)
      .setFooter({ text: 'Staff permissions • Anti-Raid / Anti-Nuke administration' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    sent += 1;
  }

  logger.info(`Published ${sent} admin permission messages in ${guild.name} (${ROLE_PERMISSIONS_CHANNEL_ID})`);
  return sent;
}
