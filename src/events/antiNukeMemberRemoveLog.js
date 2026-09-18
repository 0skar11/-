import { Events } from 'discord.js';
import { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent } from '../utils/antiNukeLogging.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (!member.guild) return;
    const entry = await findRecentAuditEntry(member.guild, [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd], member.id);
    if (!entry) return;
    await sendAntiNukeLog(member.guild, {
      action: entry.action === AuditLogEvent.MemberBanAdd ? 'Member Banned' : 'Member Kicked',
      executor: entry.executor,
      target: `${member.user?.tag || member.id} (${member.id})`,
      details: [['Audit Log ID', entry.id], ['Reason', entry.reason || 'No reason provided']],
      severity: 'HIGH',
    });
  },
};
