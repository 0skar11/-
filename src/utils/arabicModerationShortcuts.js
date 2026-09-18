import { PermissionFlagsBits } from 'discord.js';
import { ModerationService } from '../services/moderation/moderationService.js';
import { WarningService } from '../services/moderation/warningService.js';

const COMMANDS = new Set(['وارن', 'تايم', 'انتايم', 'بان', 'انبان', 'كلير', 'رتبة', 'ازالةرتبة']);
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function parseDuration(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const durationMs = Number(match[1]) * multipliers[match[2]];
  return durationMs > 0 && durationMs <= MAX_TIMEOUT_MS ? durationMs : null;
}

function tokenize(content) {
  const commandMatch = String(content || '').trim().match(/^([^\s<@]+)\s*/u);
  if (!commandMatch) return null;
  const command = commandMatch[1].toLowerCase();
  if (!COMMANDS.has(command)) return null;
  const rest = content.slice(commandMatch[0].length).trim();
  const mentionMatch = rest.match(/^<@!?(\d+)>\s*(.*)$/u);
  const idMatch = rest.match(/^(\d{17,20})\s*(.*)$/u);
  const targetId = mentionMatch?.[1] || idMatch?.[1];
  const tail = mentionMatch?.[2] ?? idMatch?.[2] ?? '';
  return { command, targetId, tail: tail.trim() };
}

function roleFor(guild, roleName) {
  const normalized = roleName.trim().toLowerCase();
  return guild.roles.cache.find(role => role.name.toLowerCase() === normalized)
    || guild.roles.cache.find(role => role.name.toLowerCase().includes(normalized));
}

function hasPermission(member, permission) {
  return member.permissions.has(permission) || member.guild.ownerId === member.id;
}

async function reply(message, content) {
  await message.channel.send(content).catch(() => {});
}

export async function handleArabicModerationShortcut(message) {
  const parsed = tokenize(message.content);
  if (!parsed) return false;

  const { command, targetId, tail } = parsed;
  if (!targetId) {
    await reply(message, '❌ لازم تعمل منشن للشخص أو تكتب User ID.');
    return true;
  }

  const actor = message.member;
  const guild = message.guild;
  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  const targetUser = targetMember?.user || await message.client.users.fetch(targetId).catch(() => null);

  try {
    if (command === 'وارن') {
      if (!hasPermission(actor, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية التحذير.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      ModerationService.assertModerationHierarchy(actor, targetMember, 'warn');
      const reason = tail || 'لم يتم تحديد سبب';
      const result = await WarningService.addWarning({ guildId: guild.id, userId: targetId, moderatorId: actor.id, reason });
      return reply(message, `⚠️ ${targetMember} Has Been Warned, Reason: ${reason}\nTotal Warns: ${result.totalCount}`);
    }

    if (command === 'تايم') {
      if (!hasPermission(actor, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية التايم.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      const [durationText, ...reasonParts] = tail.split(/\s+/u);
      const durationMs = parseDuration(durationText);
      const reason = reasonParts.join(' ') || 'لم يتم تحديد سبب';
      if (!durationMs) return reply(message, '❌ اكتب المدة هكذا: `5m` أو `1h` أو `1d` (حتى 28 يوم).');
      ModerationService.assertModerationHierarchy(actor, targetMember, 'timeout');
      await ModerationService.timeoutUser({ guild, member: targetMember, moderator: actor, durationMs, reason });
      return reply(message, `⏳ ${targetMember} Has Been Timed Out for ${durationText}, Reason: ${reason}`);
    }

    if (command === 'انتايم') {
      if (!hasPermission(actor, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية إزالة التايم.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      const reason = tail || 'لم يتم تحديد سبب';
      await ModerationService.removeTimeoutUser({ guild, member: targetMember, moderator: actor, reason });
      return reply(message, `🔓 تم إلغاء التايم عن ${targetMember}, Reason: ${reason}`);
    }

    if (command === 'بان') {
      if (!hasPermission(actor, PermissionFlagsBits.BanMembers)) return reply(message, '❌ ليس لديك صلاحية البان.');
      if (!targetUser) return reply(message, '❌ لم يتم العثور على المستخدم.');
      const reason = tail || 'لم يتم تحديد سبب';
      await ModerationService.banUser({ guild, user: targetUser, moderator: actor, reason });
      return reply(message, `🚫 ${targetUser} Has Been Banned, Reason: ${reason}`);
    }

    if (command === 'انبان') {
      if (!hasPermission(actor, PermissionFlagsBits.BanMembers)) return reply(message, '❌ ليس لديك صلاحية إلغاء البان.');
      if (!targetUser) return reply(message, '❌ اكتب User ID صحيح.');
      const reason = tail || 'لم يتم تحديد سبب';
      await ModerationService.unbanUser({ guild, user: targetUser, moderator: actor, reason });
      return reply(message, `✅ تم إلغاء البان عن ${targetUser}, Reason: ${reason}`);
    }

    if (command === 'كلير') {
      if (!hasPermission(actor, PermissionFlagsBits.ModerateMembers)) return reply(message, '❌ ليس لديك صلاحية مسح التحذيرات.');
      if (!targetMember) return reply(message, '❌ العضو غير موجود في السيرفر.');
      ModerationService.assertModerationHierarchy(actor, targetMember, 'clear warnings for');
      const reason = tail || 'لم يتم تحديد سبب';
      const result = await WarningService.clearWarnings(guild.id, targetId);
      return reply(message, `🧹 تم مسح كل تحذيرات ${targetMember}. Reason: ${reason}\nعدد التحذيرات المحذوفة: ${result.count}`);
    }

    if (command === 'رتبة' || command === 'ازالةرتبة') {
      if (!hasPermission(actor, PermissionFlagsBits.ManageRoles)) return reply(message, '❌ ليس لديك صلاحية إدارة الرتب.');
      if (!targetMember || !tail) return reply(message, '❌ استخدم: `رتبة @user اسم الرتبة`');
      const role = roleFor(guild, tail);
      const botRole = guild.members.me?.roles.highest;
      if (!role) return reply(message, '❌ لم أجد هذه الرتبة.');
      if (role.managed || !botRole || role.position >= botRole.position) return reply(message, '❌ رتبة البوت يجب أن تكون أعلى من الرتبة المطلوبة.');
      if (role.position >= actor.roles.highest.position && guild.ownerId !== actor.id) return reply(message, '❌ لا يمكنك إدارة رتبة مساوية أو أعلى من رتبتك.');
      if (command === 'رتبة') {
        await targetMember.roles.add(role, `Arabic shortcut by ${message.author.tag}`);
        return reply(message, `✅ تمت إضافة رتبة **${role.name}** إلى ${targetMember}.`);
      }
      await targetMember.roles.remove(role, `Arabic shortcut by ${message.author.tag}`);
      return reply(message, `✅ تمت إزالة رتبة **${role.name}** من ${targetMember}.`);
    }
  } catch (error) {
    await reply(message, `❌ ${error.userMessage || error.message || 'حدث خطأ أثناء تنفيذ الأمر.'}`);
  }

  return true;
}
