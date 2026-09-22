import { Events } from 'discord.js';
import { handleArabicModerationShortcut } from '../utils/arabicModerationShortcuts.js';

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (!message?.guild || message.author?.bot) return;
    await handleArabicModerationShortcut(message);
  },
};
