import { Events } from 'discord.js';
import { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent } from '../utils/antiNukeLogging.js';

export default {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild) return;
    const entry = await findRecentAuditEntry(message.guild, AuditLogEvent.MessageBulkDelete, message.channelId);
    if (!entry) return;
    const count = Number(entry.extra?.count || 1);
    if (count < 2) return;
    await sendAntiNukeLog(message.guild, {
      action: 'Bulk Message Delete',
      executor: entry.executor,
      target: `<#${message.channelId}>`,
      details: [['Messages Deleted', count], ['Audit Log ID', entry.id], ['Reason', entry.reason || 'No reason provided']],
      severity: count >= 20 ? 'CRITICAL' : 'HIGH',
    });
  },
};
