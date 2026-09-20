import { Events } from 'discord.js';
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

function isAddCommand(command) {
  return command === 'تراست' || command === 'trust';
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message) {
    if (!message.guild || message.author?.bot) return;

    const target = parseTrustCommand(message.content);
    if (!target) return;

    // This listener is loaded first and owns all Trust commands. Blank the
    // message only after parsing so the other moderation shortcut listeners do
    // not execute the command a second time.
    message.content = '';

    if (message.author.id !== OWNER_ID) {
      await message.channel.send('❌ أوامر Trust متاحة للمالك فقط.').catch(() => {});
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
