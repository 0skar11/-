import { Events } from 'discord.js';
import { inspectMessageDelete } from '../utils/antiRaid.js';

export default {
  name: Events.MessageDelete,
  async execute(message) {
    if (message.guild) await inspectMessageDelete(message);
  },
};
