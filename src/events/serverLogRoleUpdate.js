import { Events } from 'discord.js';
import { logRoleUpdate } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A changed role goes to the roles log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    await logRoleUpdate(oldRole, newRole).catch((error) => logger.error('Server log failed (GuildRoleUpdate):', error));
  },
};
