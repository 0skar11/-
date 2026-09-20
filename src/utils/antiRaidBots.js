import { Events } from 'discord.js';
import { sendAntiNukeLog } from '../utils/antiNukeLogging.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    const match = message.content.trim().match(/^(تراست|انتراست)\s+(.+)$/u);
    if (!match) return;
    await sendAntiNukeLog(message.guild, {
      action: match[1] === 'تراست' ? 'Trust Added' : 'Trust Removed',
      executor: message.author,
      target: match[2],
      details: [['Command', message.content], ['Permission', 'Server owner only']],
      severity: 'HIGH',
      mentionEveryone: true,
    });
  },
};
