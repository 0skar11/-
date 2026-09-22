import { Events } from 'discord.js';

// Trust commands are handled exclusively by messageCreate.js.
// Keep this compatibility listener inert to prevent duplicate replies.
export default {
  name: Events.MessageCreate,
  once: false,
  async execute() {},
};
