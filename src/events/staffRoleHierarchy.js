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
    let boardSent = 0;

    for (const guild of client.guilds.cache.values()) {
      // The permission board is refreshed to match the synced permissions; a role whose message
      // is missing (e.g. deleted) gets it posted again. Saved message IDs prevent duplicates.
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
        const board = await publishStaffPermissionBoard(guild);
        boardEdited += board.edited;
        boardSent += board.sent;
      } catch (error) {
        logger.warn(`Permission board not refreshed in ${guild.name}: ${error.message}`);
      }
    }

    startupLog(`Staff role hierarchy: created ${created}, updated ${updated}, positioned ${positioned}, retired ${retired}, board messages refreshed ${boardEdited}, posted ${boardSent}`);
  },
};
