import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { ensureMediaRole } from '../services/mediaRoleService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      try {
        const { created, positioned, locked } = await ensureMediaRole(guild);
        startupLog(`Media role in ${guild.name}: created ${created}, positioned ${positioned}, locked roles ${locked}`);
      } catch (error) {
        logger.error(`Failed to set up the media role in ${guild.name}:`, error);
      }
    }
  },
};
