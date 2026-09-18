import { Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

const MEMBER_ROLE_ID = '1155238281861156955';

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member) {
    try {
      // Apply this role to human members only; bots are intentionally excluded.
      if (!member.guild || member.user?.bot) return;

      const role = member.guild.roles.cache.get(MEMBER_ROLE_ID)
        || await member.guild.roles.fetch(MEMBER_ROLE_ID).catch(() => null);
      const botMember = member.guild.members.me;

      if (!role || !botMember) {
        logger.warn(`Auto-member-role could not resolve role ${MEMBER_ROLE_ID} in guild ${member.guild.id}`);
        return;
      }

      if (role.managed || role.position >= botMember.roles.highest.position) {
        logger.warn(`Auto-member-role cannot assign ${role.name} (${role.id}) in guild ${member.guild.id}: role is managed or not below the bot.`);
        return;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn(`Auto-member-role requires Manage Roles in guild ${member.guild.id}`);
        return;
      }

      await member.roles.add(role, 'Automatic member role on join');
      logger.info(`Assigned member role ${role.id} to ${member.user.tag} (${member.id}) in ${member.guild.name}`);
    } catch (error) {
      logger.error(`Failed to assign automatic member role ${MEMBER_ROLE_ID}:`, error);
    }
  },
};
