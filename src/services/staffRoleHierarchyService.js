import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

const ROLE_DEFINITIONS = [
  {
    name: '👑 Owner',
    color: '#f1c40f',
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    name: '⚡ Head Admin',
    color: '#e74c3c',
    permissions: [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.MentionEveryone,
    ],
  },
  {
    name: '🛡️ Admin',
    color: '#e67e22',
    permissions: [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.ManageEvents,
    ],
  },
  {
    name: '🔨 Moderator',
    color: '#2ecc71',
    permissions: [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
  },
  {
    name: '🔰 Trial Moderator',
    color: '#3498db',
    permissions: [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
  },
  {
    name: '🧪 Developer',
    color: '#9b59b6',
    permissions: [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
  },
  {
    name: '📢 Event Manager',
    color: '#f39c12',
    permissions: [
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
  },
  {
    name: '🌟 VIP',
    color: '#f1c40f',
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ],
  },
];

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
      role = await guild.roles.create({
        name: definition.name,
        color: definition.color,
        hoist: true,
        mentionable: false,
        permissions: definition.permissions,
        reason: 'Create/update ordered staff role hierarchy',
      });
      created += 1;
    } else {
      if (role.position >= botMember.roles.highest.position) {
        logger.warn(`Cannot update ${definition.name} in ${guild.name}: role is above the bot.`);
        continue;
      }

      await role.edit({
        color: definition.color,
        hoist: true,
        permissions: definition.permissions,
        reason: 'Synchronize ordered staff role permissions',
      });
      updated += 1;
    }

    if (!role.managed && role.position < botMember.roles.highest.position) {
      managedRoles.push(role);
    }
  }

  // The first definition is the highest staff role; keep every role below the bot.
  const refreshedBotMember = await guild.members.fetchMe();
  const highestPosition = refreshedBotMember.roles.highest.position;
  const positionUpdates = managedRoles.map((role, index) => ({
    role: role.id,
    position: Math.max(1, highestPosition - index - 1),
  }));

  if (positionUpdates.length > 0) {
    await guild.roles.setPositions(positionUpdates);
  }

  return { created, updated, positioned: positionUpdates.length };
}

export { ROLE_DEFINITIONS };
