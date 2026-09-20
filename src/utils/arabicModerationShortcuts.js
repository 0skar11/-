import { PermissionFlagsBits } from 'discord.js';
import { getCommandPrefix } from '../config/bot.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { ModerationService } from '../services/moderation/moderationService.js';
import { WarningService } from '../services/moderation/warningService.js';

const COMMANDS = new Set([
  'وارن', 'تايم', 'انتايم', 'بان', 'انبان', 'كلير', 'ان', 'شيل', 'ر', 'رول', 'ب', 'رتبة', 'ازالةرتبة', 'purge', 'تراست',
  'warn', 'timeout', 'untimeout', 'ban', 'unban', 'clear', 'remove', 'role', 'roll', 'lock', 'unlock',
].map((value) => value.toLowerCase()));

const ADD_ROLE_COMMANDS = new Set(['ر', 'رول', 'ان', 'رتبة', 'role', 'roll', 'addrole']);
const REMOVE_ROLE_COMMANDS = new Set(['ب', 'شيل', 'ازالةرتبة', 'remove', 'unrole', 'removerole']);
const OWNER_ID = '1159601661392715906';
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function parseDuration(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const durationMs = Number(match[1]) * multipliers[match[2]];
  return durationMs > 0 && durationMs <= MAX_TIMEOUT_MS ? durationMs : null;
}

function stripPrefix(content, prefixes) {
  const value = String(content || '').trim();
  const prefix = prefixes.filter(Boolean).sort((a, b) => b.length - a.length)
    .find(candidate => value.toLowerCase().startsWith(candidate.toLowerCase()));
  return prefix ? value.slice(prefix.length).trim() : value;
}

function tokenize(content, prefixes = []) {
  const value = stripPrefix(content, prefixes);
  const parts = value.split(/\s+/u).filter(Boolean);
  if (!parts.length) return null;

  let command = parts[0].toLowerCase();
  let body = parts.slice(1).join(' ');
  if (!COMMANDS.has(command)) {
    const last = parts.at(-1)?.toLowerCase();
    if (!COMMANDS.has(last)) return null;
    command = last;
    body = parts.slice(0, -1).join(' ');
  }

  const mention = body.match(/<@!?(\d+)>/u);
  const id = body.match(/(?:^|\s)(\d{17,20})(?:\s|$)/u);
  const targetId = mention?.[1] || id?.[1] || null;
  const tail = body
    .replace(/<@!?\d+>/u, '')
    .replace(/(?:^|\s)\d{17,20}(?=\s|$)/u, '')
    .trim();

  return { command, targetId, tail };
}

function roleFor(guild, roleName) {
  const normalized = roleName.trim().toLowerCase();
  if (!normalized) return null;
  const roles = guild.roles.cache.filter(role => !role.managed && role.id !== guild.id);
  return roles.find(role => role.name.toLowerCase() === normalized)
    || roles.find(role => role.name.toLowerCase().startsWith(normalized))
    || roles.find(role => role.name.toLowerCase().includes(normalized));
}

function hasPermission(member, permission) {
  return member.permissions.has(permission) || member.guild.ownerId === member.id;
}

async function reply(message, content) {
  await message.channel.send(content).catch(() => {});
}

async function getReplyTargetId(message) {
  if (!message.reference?.messageId) return null;
  const referencedMessage = await message.fetchReference().catch(() => null);
  return referencedMessage?.author?.bot ? null : referencedMessage?.author?.id || null;
}

async function handleTrust(message, targetId) {
  if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) && message.guild.ownerId !== message.author.id) {
    await reply(message, '❌ ليس لديك صلاحية **Manage Server**.');
    return true;
  }

  const resolvedTargetId = targetId || await getReplyTargetId(message);
  if (!resolvedTargetId) {
    await reply(message, '❌ استخدم الأمر هكذا: `تراست @العضو` أو اعمل Reply على رسالة العضو.');
    return true;
  }

  const member = await message.guild.members.fetch(resolvedTargetId).catch(() => null);
  if (!member) {
    await reply(message, '❌ العضو غير موجود في السيرفر.');
    return true;
  }

  const config = await getGuildConfig(message.client, message.guild.id);
  const trustedUsers = new Set(Array.isArray(config?.antiRaidTrustedUsers) ? config.antiRaidTrustedUsers : []);
  const alreadyTrusted = trustedUsers.has(member.id);
  trustedUsers.add(member.id);

  await updateGuildConfig(message.client, message.guild.id, {
    antiRaidTrustedUsers: [...trustedUsers],
  });

  await reply(message, alreadyTrusted
    ? `ℹ️ ${member} محمي بالفعل من نظام Anti-Raid.`
    : `🛡️ تم إعطاء ${member} حماية من نظام Anti-Raid.`);
  return true;
}

async function purgeEntireChannel(message) {
  if (message.author.id !== OWNER_ID) {
    await reply(message, '❌ هذا الأمر متاح لصاحب البوت فقط.');
    return true;
  }
  if (!message.channel?.isTextBased?.() || typeof message.channel.bulkDelete !== 'function') {
    await reply(message, '❌ هذا الأمر يعمل داخل روم نصية فقط.');
    return true;
  }

  let deletedCount = 0;
  while (true) {
    const batch = await message.channel.messages.fetch({ limit: 100 });
    if (!batch.size) break;
    const deleted = await message.channel.bulkDelete(batch, true);
    deletedCount += deleted.size;
    if (!deleted.size || batch.size < 100) break;
  }
  await reply(message, `🧹 تم تنظيف الروم بالكامل. عدد الرسائل المحذوفة: **${deletedCount}**`);
  return true;
}

async function changeRole(message, targetMember, roleName, add) {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageRoles)) {
    await reply(message, '❌ ليس لديك صلاحية إدارة الرتب.');
    return true;
  }
  if (!targetMember || !roleName) {
    await reply(message, `❌ استخدم: \`${add ? 'ر / رول' : 'ب / شيل'} @user اسم الرتبة\` أو اعمل Reply واكتب اسم الرتبة.`);
    return true;
  }

  const role = roleFor(message.guild, roleName);
  const botRole = message.guild.members.me?.roles.highest;
  const actor = message.member;
  if (!role) {
    await reply(message, `❌ لم أجد رتبة قريبة من **${roleName}**.`);
    return true;
  }
  if (role.managed || !botRole || role.position >= botRole.position) {
    await reply(message, '❌ لا أستطيع إدارة هذه الرتبة لأنها أعلى من رتبة البوت أو Managed.');
    return true;
  }
  if (role.position >= actor.roles.highest.position && message.guild.ownerId !== actor.id) {
    await reply(message, '❌ لا يمكنك إدارة رتبة مساوية أو أعلى من رتبتك.');
    return true;
  }

  if (add) {
    await targetMember.roles.add(role, `Role shortcut by ${message.author.tag}`);
    await reply(message, `✅ تمت إضافة **${role.name}** إلى ${targetMember}.`);
  } else {
    await targetMember.roles.remove(role, `Role shortcut by ${message.author.tag}`);
    await reply(message, `✅ تم سحب **${role.name}** من ${targetMember}.`);
  }
  return true;
}

export async function handleArabicModerationShortcut(message) {
  const guildConfig = await getGuildConfig(message.client, message.guild.id).catch(() => null);
  const prefixes = [guildConfig?.prefix, getCommandPrefix()];
  const parsed = tokenize(message.content, prefixes);
  if (!parsed) return false;
  if (parsed.command === 'purge' || parsed.command === 'clear') return purgeEntireChannel(message);
  if (parsed.command === 'تراست') return handleTrust(message, parsed.targetId);

  const { command } = parsed;
  const targetId = parsed.targetId || await getReplyTargetId(message);
  const tail = parsed.tail;
  if (!targetId) {
    await reply(message, '❌ اعمل Reply على رسالة الشخص أو اعمل له منشن أو اكتب User ID.');
    return true;
  }

  const guild = message.guild;
  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  const targetUser = targetMember?.user || await message.client.users.fetch(targetId).catch(() => null);

  try {
    if (ADD_ROLE_COMMANDS.has(command) || REMOVE_ROLE_COMMANDS.has(command)) {
      return changeRole(message, targetMember, tail, ADD_ROLE_COMMANDS.has(command));
    }

    if (command === 'وارن' || command === 'warn') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية التحذير.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      ModerationService.assertModerationHierarchy(message.member, targetMember, 'warn');
      const reason = tail || 'لم يتم تحديد سبب';
      const result = await WarningService.addWarning({ guildId: guild.id, userId: targetId, moderatorId: message.member.id, reason });
      return reply(message, `⚠️ ${targetMember} Has Been Warned, Reason: ${reason}\nTotal Warns: ${result.totalCount}`);
    }

    if (command === 'كلير' || command === 'clear') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية مسح التحذيرات.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      const result = await WarningService.clearWarnings(guild.id, targetId);
      return reply(message, `🧹 تم مسح كل تحذيرات ${targetMember}. Reason: ${tail || 'لم يتم تحديد سبب'}\nعدد التحذيرات المحذوفة: ${result.count}`);
    }

    if (command === 'تايم' || command === 'timeout') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية التايم.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      const [durationText, ...reasonParts] = tail.split(/\s+/u);
      const durationMs = parseDuration(durationText);
      const reason = reasonParts.join(' ') || 'لم يتم تحديد سبب';
      if (!durationMs) return reply(message, '❌ اكتب المدة هكذا: `تايم 5m السبب`.');
      ModerationService.assertModerationHierarchy(message.member, targetMember, 'timeout');
      await ModerationService.timeoutUser({ guild, member: targetMember, moderator: message.member, durationMs, reason });
      return reply(message, `⏳ ${targetMember} Has Been Timed Out for ${durationText}, Reason: ${reason}`);
    }

    if (command === 'انتايم' || command === 'untimeout') {
      if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية إزالة التايم.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      await ModerationService.removeTimeoutUser({ guild, member: targetMember, moderator: message.member, reason: tail || 'لم يتم تحديد سبب' });
      return reply(message, `🔓 تم إلغاء التايم عن ${targetMember}, Reason: ${tail || 'لم يتم تحديد سبب'}`);
    }

    if (command === 'بان' || command === 'ban') {
      if (!hasPermission(message.member, PermissionFlagsBits.BanMembers)) return reply(message, '❌ ليس لديك صلاحية البان.');
      if (!targetUser) return reply(message, '❌ لم يتم العثور على المستخدم.');
      await ModerationService.banUser({ guild, user: targetUser, moderator: message.member, reason: tail || 'لم يتم تحديد سبب' });
      return reply(message, `🚫 ${targetUser} Has Been Banned, Reason: ${tail || 'لم يتم تحديد سبب'}`);
    }

    if (command === 'انبان' || command === 'unban') {
      if (!hasPermission(message.member, PermissionFlagsBits.BanMembers)) return reply(message, '❌ ليس لديك صلاحية إلغاء البان.');
      if (!targetUser) return reply(message, '❌ اكتب User ID صحيح أو اعمل Reply على رسالة الشخص.');
      await ModerationService.unbanUser({ guild, user: targetUser, moderator: message.member, reason: tail || 'لم يتم تحديد سبب' });
      return reply(message, `✅ تم إلغاء البان عن ${targetUser}, Reason: ${tail || 'لم يتم تحديد سبب'}`);
    }
  } catch (error) {
    await reply(message, `❌ ${error.userMessage || error.message || 'حدث خطأ أثناء تنفيذ الأمر.'}`);
  }

  return true;
}
