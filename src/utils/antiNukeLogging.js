import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { getGuildConfig } from '../services/config/guildConfig.js';

const TEN_SECONDS = 10_000;
const ONE_MINUTE = 60_000;
const counters = new Map();
const seenEntries = new Map();
// threshold = actions within windowMs that trigger stripping permissions; threshold + 2 triggers a ban.
const ACTIONS = Object.freeze({
  channelDelete: { audit: AuditLogEvent.ChannelDelete, threshold: 1, windowMs: TEN_SECONDS },
  roleDelete: { audit: AuditLogEvent.RoleDelete, threshold: 2, windowMs: TEN_SECONDS },
  memberBan: { audit: AuditLogEvent.MemberBanAdd, threshold: 5, windowMs: TEN_SECONDS },
  memberKick: { audit: AuditLogEvent.MemberKick, threshold: 5, windowMs: TEN_SECONDS },
  bulkDelete: { audit: AuditLogEvent.MessageBulkDelete, threshold: 10, windowMs: ONE_MINUTE },
  permissionUpdate: { audit: [AuditLogEvent.RoleUpdate, AuditLogEvent.ChannelOverwriteUpdate], threshold: 2, windowMs: ONE_MINUTE },
  memberRoleAdd: { audit: AuditLogEvent.MemberRoleUpdate, threshold: 3, windowMs: TEN_SECONDS },
});

async function getEntry(guild, auditType, targetId, filter = () => true) {
  for (const type of (Array.isArray(auditType) ? auditType : [auditType])) {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((item) => (!targetId || item.target?.id === targetId) && Date.now() - item.createdTimestamp < 15_000 && filter(item));
    if (entry) return entry;
  }
  return null;
}

// The same audit entry can surface through several gateway events; count it once.
function alreadySeen(entryId) {
  const now = Date.now();
  for (const [id, time] of seenEntries) if (now - time > ONE_MINUTE) seenEntries.delete(id);
  if (seenEntries.has(entryId)) return true;
  seenEntries.set(entryId, now);
  return false;
}

function record(guildId, executorId, action, windowMs) {
  const id = `${guildId}:${executorId}:${action}`;
  const now = Date.now();
  const history = (counters.get(id) || []).filter((time) => now - time < windowMs);
  history.push(now);
  counters.set(id, history);
  return history.length;
}

export async function isTrusted(guild, config, executorId) {
  if (executorId === guild.ownerId || executorId === guild.client.user?.id) return true;
  if (config?.antiNukeTrustedUsers?.includes(executorId)) return true;
  const trustedRoles = new Set(config?.antiNukeTrustedRoles || []);
  if (!trustedRoles.size) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  return Boolean(member?.roles?.cache?.some((role) => trustedRoles.has(role.id)));
}

async function stripDangerousPermissions(member) {
  if (!member?.manageable) return false;
  const dangerous = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers];
  let changed = false;
  for (const role of member.roles.cache.filter((role) => role.editable)) {
    const permissions = role.permissions.remove(dangerous);
    if (!permissions.equals(role.permissions)) {
      await role.setPermissions(permissions, 'Anti-Nuke: excessive destructive activity').catch(() => {});
      changed = true;
    }
  }
  return changed;
}

async function notify(guild, action, entry, count, response) {
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  const channel = config?.antiNukeLogChannelId ? guild.channels.cache.get(config.antiNukeLogChannelId) : null;
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder().setColor(response === 'ban' ? 0xed4245 : 0xfee75c).setTitle('Anti-Nuke Detection').setDescription(`**Action:** ${action}\n**Executor:** <@${entry.executor?.id}>\n**Count:** ${count}\n**Response:** ${response}`).addFields({ name: 'Audit Log ID', value: `\`${entry.id}\`` }).setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function inspectAuditAction(guild, action, targetId = null, filter) {
  const rule = ACTIONS[action];
  if (!guild || !rule) return false;
  const entry = await getEntry(guild, rule.audit, targetId, filter);
  if (!entry?.executor?.id || alreadySeen(entry.id)) return false;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if (await isTrusted(guild, config, entry.executor.id)) return false;
  const count = record(guild.id, entry.executor.id, action, rule.windowMs);
  if (count < rule.threshold) return notify(guild, action, entry, count, 'log');
  const executor = await guild.members.fetch(entry.executor.id).catch(() => null);
  const response = count >= rule.threshold + 2 ? 'ban' : 'strip_permissions';
  if (response === 'ban' && executor?.bannable) await executor.ban({ reason: `Anti-Nuke: ${count} ${action} actions in ${rule.windowMs / 1000}s` }).catch(() => {});
  else await stripDangerousPermissions(executor);
  await notify(guild, action, entry, count, response);
  return true;
}

export async function findRecentAuditEntry(guild, auditType, targetId) { return getEntry(guild, auditType, targetId); }
export async function sendAntiNukeLog(guild, data) { logger.warn(`[Anti-Nuke] ${data.action}: ${data.target || 'unknown'}`, data); await notify(guild, data.action, { id: data.auditLogId || 'manual', executor: data.executor }, 1, 'log'); }
export { AuditLogEvent };
