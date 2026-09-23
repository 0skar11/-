import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { deleteRetiredRoles, synchronizeStaffRoles } from '../services/staffRoleHierarchyService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let created = 0;
    let updated = 0;
    let positioned = 0;
    let retired = 0;

    for (const guild of client.guilds.cache.values()) {
      // The permission board is never posted automatically on startup; it is only
      // published on demand via /publish-board admin-permissions.
      try {
        retired += await deleteRetiredRoles(guild);
      } catch (error) {
        logger.error(`Failed to delete retired roles in ${guild.name}:`, error);
      }
      try {
        const summary = await synchronizeStaffRoles(guild);
        created += summary.created;
        updated += summary.updated;
        positioned += summary.positioned;
      } catch (error) {
        logger.error(`Failed to synchronize staff roles in ${guild.name}:`, error);
      }
    }

    startupLog(`Staff role hierarchy: created ${created}, updated ${updated}, positioned ${positioned}, retired ${retired}`);
  },
};
