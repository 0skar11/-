import { Events } from 'discord.js';
import { logRoleCreate } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A new role goes to the roles log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildRoleCreate,
  async execute(role) {
    await logRoleCreate(role).catch((error) => logger.error('Server log failed (GuildRoleCreate):', error));
  },
};
