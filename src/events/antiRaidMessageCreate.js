import { Events } from 'discord.js';
import { handleSecurityShortcut } from '../utils/securityShortcuts.js';

export default {
  name: Events.MessageCreate,
  async execute() {
    // Security shortcuts are handled centrally by messageCreate.js.
    // This file is intentionally kept as a compatibility stub so the
    // legacy duplicate MessageCreate listener cannot consume the message first.
  },
};
