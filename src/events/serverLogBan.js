import { Events } from 'discord.js';
import { logBan } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A ban goes to the ban log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    await logBan(ban).catch((error) => logger.error('Server log failed (GuildBanAdd):', error));
  },
};
