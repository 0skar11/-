import { Events } from 'discord.js';
import { MODERATION_COMMANDS_CHANNEL_ID, isBoardMessage } from '../services/moderationCommandsBoardService.js';

// The moderation commands channel holds only the commands list; anything else posted there is deleted.
export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (message.channelId !== MODERATION_COMMANDS_CHANNEL_ID) return;
    if (isBoardMessage(message, message.client.user.id)) return;
    await message.delete().catch(() => {});
  },
};
