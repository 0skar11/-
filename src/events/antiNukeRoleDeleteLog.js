import { Events } from 'discord.js';
import { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent } from '../utils/antiNukeLogging.js';

export default {
  name: Events.GuildRoleDelete,
  async execute(role) {
    if (!role.guild) return;
    const entry = await findRecentAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (!entry) return;
    await sendAntiNukeLog(role.guild, {
      action: 'Role Deleted',
      executor: entry.executor,
      target: `${role.name} (${role.id})`,
      details: [['Position', role.position], ['Managed', role.managed], ['Audit Log ID', entry.id], ['Reason', entry.reason || 'No reason provided']],
      severity: 'CRITICAL',
    });
  },
};
