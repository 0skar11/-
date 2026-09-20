import { Events } from 'discord.js';
import { handleSecurityShortcut } from '../utils/securityShortcuts.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    await handleSecurityShortcut(message);
  },
};
