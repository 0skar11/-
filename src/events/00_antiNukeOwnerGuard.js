import { Events } from 'discord.js';

const OWNER_ID = '1159601661392715906';
const TRUST_COMMANDS = new Set(['تراست', 'انتراست', 'trusted', 'trust', 'untrust']);

function isTrustCommand(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return false;

  const first = parts[0].toLowerCase();
  const last = parts.at(-1)?.toLowerCase();
  return TRUST_COMMANDS.has(first) || TRUST_COMMANDS.has(last);
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message) {
    if (!message.guild || message.author?.bot || !isTrustCommand(message.content)) return;

    if (message.author.id === OWNER_ID) return;

    // Stop every later message-based Anti-Raid/Anti-Nuke handler from processing it.
    message.content = '';
    await message.channel.send('❌ أوامر Anti-Raid و Anti-Nuke، خصوصًا Trust، متاحة للمالك فقط.').catch(() => {});
  },
};
