import { Events } from 'discord.js';
import { sendAntiNukeLog } from '../utils/antiNukeLogging.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (!member.guild || !member.user?.bot) return;
    await sendAntiNukeLog(member.guild, {
      action: 'Bot Joined',
      executor: null,
      target: `${member.user.tag} (${member.id})`,
      details: [
        ['Bot', 'Yes'],
        ['Roles At Join', member.roles.cache.map(role => `${role.name} (${role.id})`).join(', ') || 'None'],
        ['Trust Status', 'Checked by Anti-Raid'],
        ['Expected Action', 'Untrusted bots are stripped and banned'],
      ],
      severity: 'CRITICAL',
    });
  },
};
