import { PermissionFlagsBits } from 'discord.js';

const COMMANDS = new Set(['ق', 'ف', 'نك', 'font']);
const BOLD_UPPER_START = 0x1d400;
const BOLD_LOWER_START = 0x1d41a;
const BOLD_DIGIT_START = 0x1d7ce;

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission) || member?.guild?.ownerId === member?.id);
}

async function reply(message, content) {
  await message.channel.send(content).catch(() => {});
  return true;
}

function parseCommand(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return null;

  const command = parts[0].toLowerCase();
  if (!COMMANDS.has(command)) return null;
  return { command, tail: parts.slice(1).join(' ') };
}

function toBoldFont(value) {
  return [...String(value)].map((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x41 && codePoint <= 0x5a) return String.fromCodePoint(BOLD_UPPER_START + codePoint - 0x41);
    if (codePoint >= 0x61 && codePoint <= 0x7a) return String.fromCodePoint(BOLD_LOWER_START + codePoint - 0x61);
    if (codePoint >= 0x30 && codePoint <= 0x39) return String.fromCodePoint(BOLD_DIGIT_START + codePoint - 0x30);
    return character;
  }).join('');
}

async function lockChannel(message, locked) {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) return reply(message, '❌ ليس لديك صلاحية إدارة الشانيل.');

  const channel = message.channel;
  if (!channel?.isTextBased?.() || !channel.permissionOverwrites?.edit) return reply(message, '❌ هذا الأمر يعمل داخل روم نصية فقط.');

  try {
    const everyoneRole = message.guild.roles.everyone;
    const currentPermissions = channel.permissionsFor(everyoneRole);
    const alreadyLocked = currentPermissions?.has(PermissionFlagsBits.SendMessages) === false;
    if (locked === alreadyLocked) return reply(message, locked ? 'ℹ️ الشانيل مقفولة بالفعل.' : 'ℹ️ الشانيل مفتوحة بالفعل.');

    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: !locked }, { reason: `${locked ? 'Channel locked' : 'Channel unlocked'} by ${message.author.tag}` });
    return reply(message, locked ? '🔒 تم قفل الشانيل.' : '🔓 تم فتح الشانيل.');
  } catch (error) {
    return reply(message, `❌ تعذر ${locked ? 'قفل' : 'فتح'} الشانيل: ${error.message}`);
  }
}

async function getReplyMember(message) {
  if (!message.reference?.messageId) return null;
  const referencedMessage = await message.fetchReference().catch(() => null);
  if (!referencedMessage?.author?.id) return null;
  return message.guild.members.fetch(referencedMessage.author.id).catch(() => null);
}

async function changeNickname(message, tail) {
  // The nickname shortcut requires Manage Nicknames explicitly.
  if (!message.member?.permissions?.has(PermissionFlagsBits.ManageNicknames)) {
    return reply(message, '❌ ليس لديك صلاحية Manage Nicknames لت使用 أمر نك.');
  }

  const mention = tail.match(/^<@!?(\d+)>\s*/u);
  const targetId = mention?.[1] || null;
  const nickname = (mention ? tail.slice(mention[0].length) : tail).trim();
  const targetMember = targetId
    ? await message.guild.members.fetch(targetId).catch(() => null)
    : await getReplyMember(message) || message.member;

  if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');

  const restoreOriginalName = !nickname;
  if (nickname.length > 32) return reply(message, '❌ الاسم يجب ألا يتجاوز 32 حرفاً.');

  const botMember = message.guild.members.me;
  if (targetMember.id !== message.member.id && message.guild.ownerId !== message.member.id
    && targetMember.roles.highest.position >= message.member.roles.highest.position) {
    return reply(message, '❌ لا يمكنك تغيير اسم عضو أعلى منك أو مساوي لك.');
  }
  if (targetMember.id !== message.member.id && botMember
    && targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return reply(message, '❌ لا أستطيع تغيير اسم هذا العضو بسبب ترتيب الرتب.');
  }

  try {
    await targetMember.setNickname(restoreOriginalName ? null : nickname, `Nickname ${restoreOriginalName ? 'restored' : 'changed'} by ${message.author.tag}`);
    return reply(message, restoreOriginalName
      ? `✅ تم إرجاع الاسم الأصلي لـ ${targetMember}.`
      : `✅ تم تغيير اسم ${targetMember} إلى **${nickname}**.`);
  } catch (error) {
    return reply(message, `❌ تعذر تغيير الاسم: ${error.message}`);
  }
}

export async function handleArabicUtilityShortcuts(message) {
  const parsed = parseCommand(message.content);
  if (!parsed) return false;

  if (parsed.command === 'ق') return lockChannel(message, true);
  if (parsed.command === 'ف') return lockChannel(message, false);
  if (parsed.command === 'نك') return changeNickname(message, parsed.tail);

  if (!parsed.tail) return reply(message, '❌ اكتب النص بعد الأمر، مثال: `font CHAOS`');
  return reply(message, toBoldFont(parsed.tail));
}

export { toBoldFont };
