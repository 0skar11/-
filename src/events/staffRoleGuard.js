import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { guardStaffRoleUpdate } from '../services/staffRoleHierarchyService.js';

// Staff roles are owner-only: the owners' edits stay, anyone else's are reverted.
export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    try {
      await guardStaffRoleUpdate(oldRole, newRole);
    } catch (error) {
      logger.error(`Staff role guard failed for ${newRole?.name}:`, error);
    }
  },
};
