import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { deleteRetiredRoles, synchronizeStaffRoles, publishStaffPermissionBoard } from '../services/staffRoleHierarchyService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let created = 0;
    let updated = 0;
    let positioned = 0;
    let retired = 0;
    let boardEdited = 0;

    for (const guild of client.guilds.cache.values()) {
      // The permission board is never posted automatically on startup (first post: /publish-board
      // admin-permissions); its existing messages are only edited to match the synced permissions.
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
      try {
        boardEdited += (await publishStaffPermissionBoard(guild, { editOnly: true })).edited;
      } catch (error) {
        logger.warn(`Permission board not refreshed in ${guild.name}: ${error.message}`);
      }
    }

    startupLog(`Staff role hierarchy: created ${created}, updated ${updated}, positioned ${positioned}, retired ${retired}, board messages refreshed ${boardEdited}`);
  },
};
