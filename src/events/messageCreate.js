import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';

const OWNER_ID = '1159601661392715906';
const TRUST_COMMANDS = new Set(['تراست', 'انتراست', 'trust', 'untrust']);

function parseTrustCommand(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  if (parts.length < 2) return null;
  const command = parts[0].toLowerCase();
  if (!TRUST_COMMANDS.has(command)) return null;

  const targetText = parts.slice(1).join(' ');
  const roleMatch = targetText.match(/<@&(\d+)>/u);
  const userMatch = targetText.match(/<@!?(\d+)>/u) || targetText.match(/\b(\d{17,20})\b/u);
  if (roleMatch) return { command, type: 'role', id: roleMatch[1] };
  if (userMatch) return { command, type: 'user', id: userMatch[1] };
  return null;
}

async function handleTrustCommand(message, client) {
  const target = parseTrustCommand(message.content);
  if (!target) return false;

  message.content = '';
  if (message.author.id !== OWNER_ID) return true;

  const config = await getGuildConfig(client, message.guild.id);
  const key = target.type === 'role' ? 'antiNukeTrustedRoles' : 'antiNukeTrustedUsers';
  const current = new Set(Array.isArray(config?.[key]) ? config[key] : []);
  const adding = target.command === 'تراست' || target.command === 'trust';

  if (adding && target.type === 'role') {
    const role = await message.guild.roles.fetch(target.id).catch(() => null);
    if (!role || role.managed || role.id === message.guild.id) return true;
  }
  if (adding && target.type === 'user') {
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (!member) return true;
  }

  if (adding) current.add(target.id);
  else current.delete(target.id);

  await updateGuildConfig(client, message.guild.id, { [key]: [...current] });
  await message.channel.send(
    `${adding ? '🛡️ تمت إضافة' : '✅ تمت إزالة'} ${target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`} ${adding ? 'إلى' : 'من'} قائمة Trust.`
  ).catch(() => {});
  return true;
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (!message?.guild || message.author?.bot) return;

      // Keep only Trust / Anti-Nuke related message commands active.
      // Everything else is intentionally disabled.
      if (await handleTrustCommand(message, client)) return;

      // Explicitly block all other command processing.
      message.content = '';
      return;
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};
