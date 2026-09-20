import { Events } from 'discord.js';
import { inspectAuditAction, findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent } from './antiNukeLogging.js';

export async function inspectChannelDelete(channel) {
  return inspectAuditAction(channel?.guild, 'channelDelete', channel?.id);
}

export async function inspectRoleDelete(role) {
  return inspectAuditAction(role?.guild, 'roleDelete', role?.id);
}

export async function inspectRoleUpdate(role) {
  return inspectAuditAction(role?.guild, 'permissionUpdate', role?.id);
}

export async function inspectMessageDelete(message) {
  return inspectAuditAction(message?.guild, 'bulkDelete', message?.channelId);
}

export async function inspectMemberRemoval(member, event = Events.GuildMemberRemove) {
  const action = event === Events.GuildBanAdd ? 'memberBan' : 'memberKick';
  return inspectAuditAction(member?.guild, action, member?.id);
}

export async function handleAntiRaidCommand(message) {
  if (!message?.guild || message.author?.bot) return false;
  return false;
}

export { findRecentAuditEntry, sendAntiNukeLog, AuditLogEvent };

export default { name: Events.MessageCreate, async execute() {} };
