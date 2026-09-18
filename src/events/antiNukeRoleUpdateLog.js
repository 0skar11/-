import { Events } from 'discord.js';
import { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent } from '../utils/antiNukeLogging.js';

export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    const entry = await findRecentAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    if (!entry) return;
    const changes = entry.changes?.map(change => change.key).join(', ') || 'Unknown changes';
    await sendAntiNukeLog(newRole.guild, {
      action: 'Role/Permission Updated',
      executor: entry.executor,
      target: `${newRole.name} (${newRole.id})`,
      details: [['Changes', changes], ['Audit Log ID', entry.id], ['Reason', entry.reason || 'No reason provided']],
      severity: 'CRITICAL',
    });
  },
};
