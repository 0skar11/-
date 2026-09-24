import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { deleteRetiredRoles, synchronizeStaffRoles, refreshStaffPermissionBoard } from '../services/staffRoleHierarchyService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let created = 0;
    let updated = 0;
    let positioned = 0;
    let retired = 0;
    const boardResults = [];

    for (const guild of client.guilds.cache.values()) {
      // The permission board is edited to match the synced permissions. The bot never posts there on its own,
      // except once per BOARD_RESET_VERSION, when it clears the channel and posts the board fresh.
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
        const board = await refreshStaffPermissionBoard(guild);
        boardResults.push(board.status === 'sent' ? `${board.status} (cleared ${board.deleted})` : board.status);
      } catch (error) {
        logger.warn(`Permission board not refreshed in ${guild.name}: ${error.message}`);
      }
    }

    startupLog(`Staff role hierarchy: created ${created}, updated ${updated}, positioned ${positioned}, retired ${retired}, permission board ${boardResults.join(', ') || 'skipped'}`);
  },
};
