import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { synchronizeStaffRoles } from '../services/staffRoleHierarchyService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let created = 0;
    let updated = 0;
    let positioned = 0;

    for (const guild of client.guilds.cache.values()) {
      // The permission board is never posted automatically on startup; it is only
      // published on demand via /publish-admin-permissions.
      try {
        const summary = await synchronizeStaffRoles(guild);
        created += summary.created;
        updated += summary.updated;
        positioned += summary.positioned;
      } catch (error) {
        logger.error(`Failed to synchronize staff roles in ${guild.name}:`, error);
      }
    }

    startupLog(`Staff role hierarchy: created ${created}, updated ${updated}, positioned ${positioned}`);
  },
};
