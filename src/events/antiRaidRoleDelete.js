import { Events } from 'discord.js';
import { inspectRoleDelete } from '../utils/antiRaid.js';

export default {
  name: Events.GuildRoleDelete,
  async execute(role) {
    await inspectRoleDelete(role);
  },
};
