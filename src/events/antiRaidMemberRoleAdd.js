import { Events } from 'discord.js';
import { inspectMemberRoleAdd } from '../utils/antiRaid.js';

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const added = newMember.roles.cache.some((role) => !oldMember.roles?.cache?.has(role.id));
    if (newMember.guild && added) await inspectMemberRoleAdd(newMember);
  },
};
