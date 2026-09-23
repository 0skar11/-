import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { ensureMediaRole, grantMediaRoleToAllMembers } from '../services/mediaRoleService.js';

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
      try {
        const { skipped, granted, failed } = await grantMediaRoleToAllMembers(guild);
        if (!skipped) startupLog(`Media role given to all members in ${guild.name}: granted ${granted}, failed ${failed}`);
      } catch (error) {
        logger.error(`Failed to give the media role to all members in ${guild.name}:`, error);
      }
    }
  },
};
