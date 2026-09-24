import { Events } from 'discord.js';
import { scheduleKeepGameRolesAtBottom } from '../services/gameRolesService.js';

// A new role lands at the bottom of the list, above the game roles, so they are moved back down.
export default {
  name: Events.GuildRoleCreate,
  async execute(role) {
    if (role.guild) scheduleKeepGameRolesAtBottom(role.guild);
  },
};
