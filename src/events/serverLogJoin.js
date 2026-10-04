import { Events } from 'discord.js';
import { logJoin } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A member joining goes to the join log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await logJoin(member).catch((error) => logger.error('Server log failed (GuildMemberAdd):', error));
  },
};
