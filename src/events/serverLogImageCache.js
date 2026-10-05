import { Events } from 'discord.js';
import { rememberImages } from '../services/logging/serverLogs.js';
import { logger } from '../utils/logger.js';

// Keeps a copy of images sent in our server for a while, so a deleted message's images can be posted
// in the message-deleted log (services/logging/serverLogs.js).
export default {
  name: Events.MessageCreate,
  async execute(message) {
    await rememberImages(message).catch((error) => logger.warn(`Could not keep the images of ${message.id}: ${error.message}`));
  },
};
