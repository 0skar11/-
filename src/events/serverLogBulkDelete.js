import { Events } from 'discord.js';
import { logBulkDelete } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A purge goes to the message-deleted log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    await logBulkDelete(messages, channel).catch((error) => logger.error('Server log failed (MessageBulkDelete):', error));
  },
};
