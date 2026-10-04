import { Events } from 'discord.js';
import { logMessageDelete } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// A deleted message goes to the message-deleted log channel (services/logging/serverLogs.js, our server only).
export default {
  name: Events.MessageDelete,
  async execute(message) {
    await logMessageDelete(message).catch((error) => logger.error('Server log failed (MessageDelete):', error));
  },
};
