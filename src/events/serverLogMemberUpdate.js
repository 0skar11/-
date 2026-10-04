import { Events } from 'discord.js';
import { logMemberRoles, logTimeout } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// Role changes go to the roles log channel and timeouts to the timeout log channel
// (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    await logMemberRoles(oldMember, newMember).catch((error) => logger.error('Server log failed (roles):', error));
    await logTimeout(oldMember, newMember).catch((error) => logger.error('Server log failed (timeout):', error));
  },
};
