import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';

function getTargetLabel(target) {
  return target?.user?.tag ?? target?.displayName ?? target?.tag ?? 'this user';
}
function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

export class ModerationService {
  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }) {
    if (actor === 'moderator') {
      return `❌ لا يمكنك ${action} **${targetLabel}** لأن رتبته مساوية أو أعلى من رتبتك (**${actorRole.name}**).`;
    }
    return `❌ لا أستطيع ${action} **${targetLabel}** لأن رتبة البوت (**${actorRole.name}**) مساوية أو أقل من رتبته (**${targetRole.name}**). ارفع رتبة البوت.`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) return { valid: false, error: '❌ لم يتم العثور على العضو أو المشرف.' };
    if (moderator.guild?.ownerId === moderator.id || moderator.permissions?.has(PermissionFlagsBits.Administrator)) return { valid: true };
    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);
    if (!modRole || !targetRole) return { valid: false, error: '❌ تعذر معرفة ترتيب الرتب.' };
    if (modRole.position <= targetRole.position) {
      return { valid: false, error: this.buildHierarchyMessage({ actor: 'moderator', actorRole: modRole, targetRole, targetLabel: getTargetLabel(target), action }) };
    }
    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    const botMember = target?.guild?.members?.me;
    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);
    if (!botMember || !botRole || !targetRole) return { valid: false, error: '❌ لم أستطع العثور على رتبة البوت.' };
    if (botRole.position <= targetRole.position) {
      return { valid: false, error: this.buildHierarchyMessage({ actor: 'bot', actorRole: botRole, targetRole, targetLabel: getTargetLabel(target), action }) };
    }
    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);
    if (!botCheck.valid) throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
    const modCheck = this.validateHierarchy(moderator, target, action);
    if (!modCheck.valid) throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
  }

  static async banUser({ guild, user, moderator, reason = 'No reason provided', deleteDays = 0 }) {
    if (!guild || !user || !moderator) throw new TitanBotError('Missing required parameters', ErrorTypes.VALIDATION, '❌ بيانات السيرفر أو العضو ناقصة.');
    const targetMember = await guild.members.fetch(user.id).catch(() => null);
    if (targetMember) {
      this.assertModerationHierarchy(moderator, targetMember, 'حظر');
      if (!targetMember.bannable) throw new TitanBotError('Member not bannable', ErrorTypes.PERMISSION, '❌ لا أستطيع حظر هذا العضو. تحقق من صلاحية Ban Members وترتيب الرتب.');
    } else if (guild.ownerId !== moderator.id && !moderator.permissions?.has([PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator])) {
      throw new TitanBotError('Missing ban permission', ErrorTypes.PERMISSION, '❌ تحتاج إلى صلاحية Ban Members لحظر عضو خارج السيرفر.');
    }

    await guild.members.ban(user.id, {
      reason,
      deleteMessageSeconds: Math.min(Math.max(Number(deleteDays) || 0, 0) * 86400, 7 * 86400),
    });
    const caseId = await logModerationAction({ client: guild.client, guild, event: {
      action: 'Member Banned', target: `${user.tag} (${user.id})`, executor: `${moderator.user?.tag || moderator.id} (${moderator.id})`, reason,
      metadata: { userId: user.id, moderatorId: moderator.id, permanent: true, deleteDays },
    }});
    logger.info(`User banned: ${user.tag} by ${moderator.user?.tag || moderator.id} in ${guild.name}`);
    return { caseId, user: user.tag, reason };
  }
}
