import { Events } from 'discord.js';
import { scheduleKeepGameRolesAtBottom } from '../services/gameRolesService.js';

// Someone dragged a role below the game roles: move them back to the bottom.
export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    if (newRole.guild && oldRole.position !== newRole.position) scheduleKeepGameRolesAtBottom(newRole.guild);
  },
};
