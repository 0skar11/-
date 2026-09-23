import { Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

const TARGET_GUILD_ID = '1155236281706627173';
const WELCOME_CHANNEL_ID = '1547305745417113700';

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
  },
};
