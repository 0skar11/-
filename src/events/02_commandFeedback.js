import { Events, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix } from '../config/bot.js';

const TRUST_COMMANDS = new Set(['trust', 'untrust', 'تراست', 'انتراست']);
const OWNER_ID = '1159601661392715906';
const TRUST_MARKER = '__titanbot_trust_handled__';

function parseTrust(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  if (!TRUST_COMMANDS.has(parts[0]?.toLowerCase())) return null;
  const rest = parts.slice(1).join(' ');
  const role = rest.match(/<@&(\d+)>/u);
  const user = rest.match(/<@!?(\d+)>/u) || rest.match(/\b(\d{17,20})\b/u);
  return {
    command: parts[0].toLowerCase(),
    roleId: role?.[1] || null,
    userId: user?.[1] || null,
  };
}

async function send(message, text) {
  await message.channel.send(`❌ ${text}`).catch(() => {});
}

async function handleTrust(message, client) {
  const parsed = parseTrust(message.content);
  if (!parsed) return false;
  message.content = TRUST_MARKER;

  if (message.author.id !== OWNER_ID) {
    await send(message, 'أمر Trust متاح لمالك البوت فقط.');
    return true;
  }

  if (!parsed.roleId && !parsed.userId) {
    await send(message, 'الناقص هو منشن عضو أو رتبة. مثال: `trust @member` أو `trust @role`.');
    return true;
  }
  if (parsed.roleId && parsed.userId) {
    await send(message, 'استخدم منشن عضو أو رتبة واحدة فقط، وليس الاثنين معًا.');
    return true;
  }

  const config = await getGuildConfig(client, message.guild.id).catch(() => null);
  const adding = parsed.command === 'trust' || parsed.command === 'تراست';
  const key = parsed.roleId ? 'antiNukeTrustedRoles' : 'antiNukeTrustedUsers';
  const id = parsed.roleId || parsed.userId;

  if (parsed.roleId) {
    const role = await message.guild.roles.fetch(id).catch(() => null);
    if (!role) return send(message, 'الرتبة غير موجودة في هذا السيرفر.');
    if (role.managed || role.id === message.guild.id) return send(message, 'لا يمكن Trust لرتبة managed أو رتبة Everyone.');
  } else {
    const member = await message.guild.members.fetch(id).catch(() => null);
    if (!member) return send(message, 'العضو غير موجود في هذا السيرفر. استخدم منشن أو ID صحيح.');
  }

  const current = new Set(Array.isArray(config?.[key]) ? config[key] : []);
  if (adding) current.add(id);
  else current.delete(id);
  await updateGuildConfig(client, message.guild.id, { [key]: [...current] });
  await message.channel.send(`${adding ? '🛡️ تمت إضافة' : '✅ تمت إزالة'} ${parsed.roleId ? `<@&${id}>` : `<@${id}>`} ${adding ? 'إلى' : 'من'} قائمة Trust.`).catch(() => {});
  return true;
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message, client) {
    if (!message?.guild || message.author?.bot) return;
    if (message.content === TRUST_MARKER) return;
    await handleTrust(message, client);
  },
};
