import { PermissionFlagsBits } from 'discord.js';
import { getCommandPrefix } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { updateAntiRaidTrust } from './antiRaid.js';

const OWNER_ID = '1159601661392715906';
const COMMAND_PATTERN = /^(قفل|ق|فتح|ف|تراست|انتراست|trust|untrust|انترايد)(?:\s+|$)(.*)$/iu;

function removePrefix(content, prefixes) {
  const value = String(content || '').trim();
  const prefix = prefixes
    .filter(Boolean)
    .map(String)
    .sort((a, b) => b.length - a.length)
    .find(candidate => value.toLowerCase().startsWith(candidate.toLowerCase()));
  return prefix ? value.slice(prefix.length).trim() : value;
}

function parseTarget(value) {
  const text = String(value || '').trim();
  const mention = text.match(/^<@!?(\d+)>$/u);
  const roleMention = text.match(/^<@&(\d+)>$/u);
  const id = text.match(/^(\d{17,20})$/u);
  return mention?.[1] || roleMention?.[1] || id?.[1] || null;
}

function isAdministrator(message) {
  return message.author.id === OWNER_ID
    || message.guild.ownerId === message.author.id
    || message.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function canManageChannels(message) {
  return message.guild.ownerId === message.author.id
    || message.member?.permissions?.has(PermissionFlagsBits.ManageChannels);
}

async function reply(message, content) {
  await message.channel.send(content).catch(() => {});
}

export async function handleSecurityShortcut(message) {
  if (!message?.guild || message.author?.bot || message.__securityShortcutHandled) return false;

  const config = await getGuildConfig(message.client, message.guild.id).catch(() => null);
  const commandText = removePrefix(message.content, [config?.prefix, getCommandPrefix()]);
  const match = commandText.match(COMMAND_PATTERN);
  if (!match) return false;

  message.__securityShortcutHandled = true;
  const command = match[1].toLowerCase();
  const argument = match[2].trim();

  try {
    if ((command === 'قفل' || command === 'ق') && canManageChannels(message)) {
      if (!message.channel.permissionOverwrites?.edit) {
        await reply(message, '❌ لا يمكن قفل هذه القناة.');
        return true;
      }
      const everyone = message.guild.roles.everyone;
      await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false }, {
        reason: `Channel locked by ${message.author.tag}`,
      });
      await reply(message, `🔒 تم قفل ${message.channel} بنجاح.`);
      return true;
    }

    if (command === 'قفل' || command === 'ق') {
      await reply(message, '❌ تحتاج إلى صلاحية Manage Channels.');
      return true;
    }

    if ((command === 'فتح' || command === 'ف') && canManageChannels(message)) {
      if (!message.channel.permissionOverwrites?.edit) {
        await reply(message, '❌ لا يمكن فتح هذه القناة.');
        return true;
      }
      const everyone = message.guild.roles.everyone;
      // Explicitly allow sending; null would inherit a possible category deny.
      await message.channel.permissionOverwrites.edit(everyone, { SendMessages: true }, {
        reason: `Channel unlocked by ${message.author.tag}`,
      });
      await reply(message, `🔓 تم فتح ${message.channel} بنجاح.`);
      return true;
    }

    if (command === 'فتح' || command === 'ف') {
      await reply(message, '❌ تحتاج إلى صلاحية Manage Channels.');
      return true;
    }

    if (command === 'انترايد') {
      if (!isAdministrator(message)) {
        await reply(message, '❌ هذا الأمر متاح للإدارة فقط.');
        return true;
      }
      await reply(message, '🛡️ نظام الحماية يعمل.');
      return true;
    }

    if (!isAdministrator(message)) {
      await reply(message, '❌ هذا الأمر متاح للإدارة فقط.');
      return true;
    }

    const targetId = parseTarget(argument);
    if (!targetId) {
      await reply(message, `❌ الاستخدام: \`${match[1]} @user\` أو \`${match[1]} @role\`.`);
      return true;
    }

    const role = message.guild.roles.cache.get(targetId);
    const user = role ? null : await message.client.users.fetch(targetId).catch(() => null);
    if (!role && !user) {
      await reply(message, '❌ لم أجد المستخدم أو الرتبة.');
      return true;
    }

    const remove = command === 'انتراست' || command === 'untrust';
    await updateAntiRaidTrust(message.guild, {
      userId: user?.id,
      roleId: role?.id,
      remove,
    });

    await reply(message, remove
      ? `✅ تمت إزالة الثقة من ${role || user}.`
      : `✅ تمت إضافة ${role || user} إلى قائمة الثقة.`);
    return true;
  } catch (error) {
    await reply(message, `❌ فشل تنفيذ الأمر: ${error.userMessage || error.message || 'خطأ غير معروف'}`);
    return true;
  }
}
