import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { ensureGameRoles } from '../services/gameRolesService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      try {
        const { skipped, created, icons, positioned, canUseIcons } = await ensureGameRoles(guild);
        if (skipped) {
          logger.warn(`Game roles skipped for ${guild.name}: bot needs Manage Roles.`);
          continue;
        }
        startupLog(`Game roles in ${guild.name}: created ${created}, icons set ${icons}, moved to bottom ${positioned}`);
        if (!canUseIcons) logger.warn(`Game role icons skipped for ${guild.name}: role icons need server boost level 2.`);
      } catch (error) {
        logger.error(`Failed to set up the game roles in ${guild.name}:`, error);
      }
    }
  },
};
