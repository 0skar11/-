import { PermissionFlagsBits } from 'discord.js';
import { getCommandPrefix } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { updateAntiRaidTrust } from './antiRaid.js';

const OWNER_ID = '1159601661392715906';

function stripConfiguredPrefix(content, prefixes) {
  const value = String(content || '').trim();
  const prefix = prefixes.filter(Boolean).sort((a, b) => b.length - a.length)
    .find(candidate => value.toLowerCase().startsWith(String(candidate).toLowerCase()));
  return prefix ? value.slice(String(prefix).length).trim() : value;
}

function parseTarget(value) {
  const match = String(value || '').trim().match(/^<@!?(\d+)>$|^<@&(\d+)>$|^(\d{17,20})$/u);
  return match?.[1] || match?.[2] || match?.[3] || null;
}

function canManageSecurity(message) {
  return message.author.id === OWNER_ID
    || message.member?.permissions?.has(PermissionFlagsBits.Administrator)
    || message.guild?.ownerId === message.author.id;
}

async function send(message, content) {
  await message.channel.send(content).catch(() => {});
}

export async function handleSecurityShortcut(message) {
  if (message.__securityShortcutHandled || !message.guild || message.author?.bot) return false;

  const guildConfig = await getGuildConfig(message.client, message.guild.id).catch(() => null);
  const commandText = stripConfiguredPrefix(message.content, [guildConfig?.prefix, getCommandPrefix()]);
  const match = commandText.match(/^(قفل|ق|فتح|ف|تراست|انتراست|trust|untrust|انترايد)\s*(.*)$/iu);
  if (!match) return false;

  message.__securityShortcutHandled = true;
  const command = match[1].toLowerCase();
  const argument = match[2].trim();

  if (!canManageSecurity(message)) {
    await send(message, '❌ هذا الأمر متاح للإدارة فقط.');
    return true;
  }

  if (command === 'قفل' || command === 'ق') {
    if (!message.channel.permissionOverwrites?.edit) {
      await send(message, '❌ لا يمكن قفل هذه القناة.');
      return true;
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && message.guild.ownerId !== message.author.id) {
      await send(message, '❌ تحتاج إلى صلاحية Manage Channels.');
      return true;
    }
    const everyone = message.guild.roles.everyone;
    if (message.channel.permissionsFor(everyone)?.has(PermissionFlagsBits.SendMessages) === false) {
      await send(message, '⚠️ الشات مقفول بالفعل.');
      return true;
    }
    await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false }, {
      reason: `Channel locked by ${message.author.tag}`,
    });
    await send(message, `🔒 تم قفل ${message.channel} بنجاح.`);
    return true;
  }

  if (command === 'فتح' || command === 'ف') {
    if (!message.channel.permissionOverwrites?.edit) {
      await send(message, '❌ لا يمكن فتح هذه القناة.');
      return true;
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && message.guild.ownerId !== message.author.id) {
      await send(message, '❌ تحتاج إلى صلاحية Manage Channels.');
      return true;
    }
    const everyone = message.guild.roles.everyone;
    await message.channel.permissionOverwrites.edit(everyone, { SendMessages: null }, {
      reason: `Channel unlocked by ${message.author.tag}`,
    });
    await send(message, `🔓 تم فتح ${message.channel} بنجاح.`);
    return true;
  }

  if (command === 'انترايد') {
    await send(message, '🛡️ نظام الحماية يعمل.');
    return true;
  }

  const targetId = parseTarget(argument);
  if (!targetId) {
    await send(message, `❌ الاستخدام: \`${match[1]} @user\` أو \`${match[1]} @role\`.`);
    return true;
  }

  const role = message.guild.roles.cache.get(targetId);
  const user = role ? null : await message.client.users.fetch(targetId).catch(() => null);
  if (!role && !user) {
    await send(message, '❌ لم أجد المستخدم أو الرتبة.');
    return true;
  }

  const remove = command === 'انتراست' || command === 'untrust';
  await updateAntiRaidTrust(message.guild, {
    userId: user?.id,
    roleId: role?.id,
    remove,
  });

  await send(message, remove
    ? `✅ تمت إزالة الثقة من ${role || user}.`
    : `✅ تمت إضافة ${role || user} إلى قائمة الثقة.`);
  return true;
}
