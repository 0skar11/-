import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { publishStaffPermissionBoard, synchronizeStaffRoles } from '../services/staffRoleHierarchyService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let created = 0;
    let updated = 0;
    let positioned = 0;
    let boards = 0;

    for (const guild of client.guilds.cache.values()) {
      // Do not let a role-sync failure prevent the permission board from being sent.
      try {
        const summary = await synchronizeStaffRoles(guild);
        created += summary.created;
        updated += summary.updated;
        positioned += summary.positioned;
      } catch (error) {
        logger.error(`Failed to synchronize staff roles in ${guild.name}:`, error);
      }

      try {
        boards += await publishStaffPermissionBoard(guild);
      } catch (error) {
        logger.error(`Failed to publish staff permission board in ${guild.name}:`, error);
      }
    }

    startupLog(`Staff role hierarchy: created ${created}, updated ${updated}, positioned ${positioned}, permission messages ${boards}`);
  },
};
