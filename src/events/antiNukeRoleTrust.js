import { Events, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';

const OWNER_ID = '1159601661392715906';
const TRUST_COMMANDS = new Set(['تراست', 'انتراست', 'trust', 'untrust', 'trusted', 'untrusted']);

function parseTarget(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;

  const parts = raw.split(/\s+/u).filter(Boolean);
  if (parts.length < 2) return null;

  const command = parts[0].toLowerCase();
  if (!TRUST_COMMANDS.has(command)) return null;

  const remainder = parts.slice(1).join(' ');
  const roleMatch = remainder.match(/<@&(\d+)>/u);
  const userMatch = remainder.match(/<@!?(\d+)>/u) || remainder.match(/\b(\d{17,20})\b/u);
  if (roleMatch) return { command, type: 'role', id: roleMatch[1] };
  if (userMatch) return { command, type: 'user', id: userMatch[1] };
  return null;
}

function isAddCommand(command) {
  return command === 'تراست' || command === 'trust';
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message) {
    if (!message.guild || message.author?.bot) return;

    const target = parseTarget(message.content);
    if (!target) return;

    if (message.author.id !== OWNER_ID) {
      message.content = '';
      await message.channel.send('❌ أوامر Anti-Raid و Anti-Nuke، خصوصًا Trust، متاحة للمالك فقط.').catch(() => {});
      return;
    }

    const config = await getGuildConfig(message.client, message.guild.id);
    const key = target.type === 'role' ? 'antiNukeTrustedRoles' : 'antiNukeTrustedUsers';
    const current = new Set(Array.isArray(config?.[key]) ? config[key] : []);

    if (isAddCommand(target.command)) {
      if (target.type === 'role') {
        const role = await message.guild.roles.fetch(target.id).catch(() => null);
        if (!role || role.managed || role.id === message.guild.id) {
          await message.channel.send('❌ الرتبة غير موجودة أو لا يمكن الوثوق بها.').catch(() => {});
          return;
        }
      } else {
        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (!member) {
          await message.channel.send('❌ العضو غير موجود في السيرفر.').catch(() => {});
          return;
        }
      }
      current.add(target.id);
    } else {
      current.delete(target.id);
    }

    await updateGuildConfig(message.client, message.guild.id, { [key]: [...current] });
    await message.channel.send(
      `${isAddCommand(target.command) ? '🛡️ تمت إضافة' : '✅ تمت إزالة'} ${target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`} ${isAddCommand(target.command) ? 'إلى' : 'من'} قائمة Trust.`,
    ).catch(() => {});
  },
};
