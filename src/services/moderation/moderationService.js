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

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botRole = getHighestRole(target?.guild?.members?.me);
      if (!botRole || !targetRole) return `Bot role hierarchy blocked ${action} for ${targetLabel}`;
      return `Bot role **${botRole.name}** is too low for **${targetRole.name}** — move the bot role higher`;
    }

    const modRole = getHighestRole(moderator);
    if (!modRole || !targetRole) return `Role hierarchy blocked ${action} for ${targetLabel}`;
    return `Your role **${modRole.name}** is too low for **${targetRole.name}** — move your role higher`;
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

  static async kickUser({ guild, member, moderator, reason = 'No reason provided' }) {
    if (!guild || !member || !moderator) throw new TitanBotError('Missing required parameters', ErrorTypes.VALIDATION, '❌ بيانات السيرفر أو العضو ناقصة.');
    this.assertModerationHierarchy(moderator, member, 'طرد');
    if (!member.kickable) throw new TitanBotError('Member not kickable', ErrorTypes.PERMISSION, '❌ لا أستطيع طرد هذا العضو. تحقق من صلاحية Kick Members وترتيب الرتب.');

    await member.kick(reason);
    const caseId = await logModerationAction({ client: guild.client, guild, event: {
      action: 'Member Kicked', target: `${member.user.tag} (${member.id})`, executor: `${moderator.user?.tag || moderator.id} (${moderator.id})`, reason,
      metadata: { userId: member.id, moderatorId: moderator.id },
    }});
    logger.info(`User kicked: ${member.user.tag} by ${moderator.user?.tag || moderator.id} in ${guild.name}`);
    return { caseId, user: member.user.tag, reason };
  }

  static async timeoutUser({ guild, member, moderator, durationMs, reason = 'No reason provided' }) {
    if (!guild || !member || !moderator || !durationMs) throw new TitanBotError('Missing required parameters', ErrorTypes.VALIDATION, '❌ بيانات العضو أو المدة ناقصة.');
    this.assertModerationHierarchy(moderator, member, 'إعطاء تايم أوت لـ');
    if (!member.moderatable) throw new TitanBotError('Member not moderatable', ErrorTypes.PERMISSION, '❌ لا أستطيع إعطاء تايم أوت لهذا العضو. تحقق من صلاحية Moderate Members وترتيب الرتب.');

    await member.timeout(durationMs, reason);
    const durationMinutes = Math.floor(durationMs / 60000);
    const caseId = await logModerationAction({ client: guild.client, guild, event: {
      action: 'Member Timed Out', target: `${member.user.tag} (${member.id})`, executor: `${moderator.user?.tag || moderator.id} (${moderator.id})`, reason,
      duration: `${durationMinutes} minutes`,
      metadata: { userId: member.id, moderatorId: moderator.id, durationMs },
    }});
    logger.info(`User timed out: ${member.user.tag} by ${moderator.user?.tag || moderator.id} in ${guild.name}`);
    return { caseId, user: member.user.tag, duration: durationMinutes, reason };
  }

  static async removeTimeoutUser({ guild, member, moderator, reason = 'Timeout removed by moderator' }) {
    if (!guild || !member || !moderator) throw new TitanBotError('Missing required parameters', ErrorTypes.VALIDATION, '❌ بيانات السيرفر أو العضو ناقصة.');
    this.assertModerationHierarchy(moderator, member, 'إزالة التايم أوت عن');
    if (!member.moderatable) throw new TitanBotError('Member not moderatable', ErrorTypes.PERMISSION, '❌ لا أستطيع تعديل هذا العضو. تحقق من صلاحية Moderate Members وترتيب الرتب.');
    if (!member.isCommunicationDisabled()) throw new TitanBotError('User not timed out', ErrorTypes.VALIDATION, `❌ ${member.user.tag} ليس عليه تايم أوت حالياً.`);

    await member.timeout(null, reason);
    await logModerationAction({ client: guild.client, guild, event: {
      action: 'Member Untimeouted', target: `${member.user.tag} (${member.id})`, executor: `${moderator.user?.tag || moderator.id} (${moderator.id})`, reason,
      metadata: { userId: member.id, moderatorId: moderator.id },
    }});
    logger.info(`Timeout removed: ${member.user.tag} by ${moderator.user?.tag || moderator.id} in ${guild.name}`);
    return { user: member.user.tag };
  }

  static async unbanUser({ guild, user, moderator, reason = 'No reason provided' }) {
    if (!guild || !user || !moderator) throw new TitanBotError('Missing required parameters', ErrorTypes.VALIDATION, '❌ بيانات السيرفر أو العضو ناقصة.');
    const banInfo = await guild.bans.fetch(user.id).catch(() => null);
    if (!banInfo) throw new TitanBotError('User not banned', ErrorTypes.VALIDATION, `❌ ${user.tag} غير محظور من هذا السيرفر.`);

    await guild.members.unban(user.id, reason);
    const caseId = await logModerationAction({ client: guild.client, guild, event: {
      action: 'Member Unbanned', target: `${user.tag} (${user.id})`, executor: `${moderator.user?.tag || moderator.id} (${moderator.id})`, reason,
      metadata: { userId: user.id, moderatorId: moderator.id },
    }});
    logger.info(`User unbanned: ${user.tag} by ${moderator.user?.tag || moderator.id} in ${guild.name}`);
    return { caseId, user: user.tag, reason };
  }
}
