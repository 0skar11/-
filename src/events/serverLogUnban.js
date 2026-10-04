import { Events } from 'discord.js';
import { logUnban } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// An unban goes to the ban log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    await logUnban(ban).catch((error) => logger.error('Server log failed (GuildBanRemove):', error));
  },
};
