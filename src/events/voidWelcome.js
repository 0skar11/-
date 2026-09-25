import { Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { CHAOS_GUILD_ID as TARGET_GUILD_ID, WELCOME_CHANNEL_ID } from '../config/inviteRewards.js';
import { handleMemberJoinInvite } from '../services/inviteTrackerService.js';
import { inviteWelcomeNotice } from '../services/inviteRewardService.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member) {
    if (!member.guild || member.guild.id !== TARGET_GUILD_ID || member.user?.bot) return;

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID)
      || await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch((error) => {
        logger.error(`Could not fetch welcome channel ${WELCOME_CHANNEL_ID}:`, error);
        return null;
      });

    if (!channel?.isTextBased?.()) {
      logger.warn(`Welcome channel ${WELCOME_CHANNEL_ID} is missing or is not text-based.`);
      return;
    }

    const botMember = member.guild.members.me;
    const permissions = botMember ? channel.permissionsFor(botMember) : null;
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      logger.warn(`Bot lacks View Channel or Send Messages in welcome channel ${WELCOME_CHANNEL_ID}.`);
      return;
    }

    try {
      await channel.send({
        content: `welcome to chaos ${member}`,
        allowedMentions: { users: [member.id] },
      });
      logger.info(`Sent chaos welcome for ${member.user.tag} in channel ${WELCOME_CHANNEL_ID}.`);
    } catch (error) {
      logger.error(`Failed to send chaos welcome in channel ${WELCOME_CHANNEL_ID}:`, error);
    }

    // A separate small message under the welcome: who invited them and what the inviter gets.
    try {
      const join = await handleMemberJoinInvite(member);
      const notice = inviteWelcomeNotice(member.id, join?.reward);
      if (notice) await channel.send({ content: notice, allowedMentions: { parse: [] } });
    } catch (error) {
      logger.error(`Failed to send the invite notice for ${member.user.tag}:`, error);
    }
  },
};
