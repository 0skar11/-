import { Events } from 'discord.js';
import { logLeave } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A member leaving (or kicked) goes to the leave log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await logLeave(member).catch((error) => logger.error('Server log failed (GuildMemberRemove):', error));
  },
};
