import { Events } from 'discord.js';
import { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent } from '../utils/antiNukeLogging.js';

export default {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    const entry = await findRecentAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (!entry) return;
    await sendAntiNukeLog(channel.guild, {
      action: 'Channel Deleted',
      executor: entry.executor,
      target: `${channel.name || 'Unknown'} (${channel.id})`,
      details: [['Type', channel.type], ['Audit Log ID', entry.id], ['Reason', entry.reason || 'No reason provided']],
      severity: 'CRITICAL',
    });
  },
};
