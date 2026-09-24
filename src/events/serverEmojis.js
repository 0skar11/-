import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { ensureServerEmojis } from '../services/serverEmojiService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      try {
        const { skipped, added, failed } = await ensureServerEmojis(guild);
        if (skipped) logger.warn(`Server emojis skipped for ${guild.name}: bot needs Manage Expressions.`);
        else startupLog(`Server emojis in ${guild.name}: added ${added}, failed ${failed}`);
      } catch (error) {
        logger.error(`Failed to add server emojis in ${guild.name}:`, error);
      }
    }
  },
};
