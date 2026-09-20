import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { getGuildConfig } from '../services/config/guildConfig.js';

const WINDOW_MS = 10_000;
const counters = new Map();

const ACTIONS = Object.freeze({
  channelDelete: { audit: AuditLogEvent.ChannelDelete, threshold: 3 },
  roleDelete: { audit: AuditLogEvent.RoleDelete, threshold: 3 },
  memberBan: { audit: AuditLogEvent.MemberBanAdd, threshold: 4 },
  memberKick: { audit: AuditLogEvent.MemberKick, threshold: 4 },
  bulkDelete: { audit: AuditLogEvent.MessageBulkDelete, threshold: 3 },
  permissionUpdate: { audit: [AuditLogEvent.RoleUpdate, AuditLogEvent.ChannelOverwriteUpdate], threshold: 2 },
});

function key(guildId, executorId, action) {
  return `${guildId}:${executorId}:${action}`;
}

function trusted(config, guild, executorId) {
  return executorId === guild.ownerId
    || executorId === guild.client.user?.id
    || (Array.isArray(config?.antiNukeTrustedUsers) && config.antiNukeTrustedUsers.includes(executorId));
}

async function getEntry(guild, auditType, targetId) {
  const types = Array.isArray(auditType) ? auditType : [auditType];
  for (const type of types) {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
    const entry = logs?.entries.find((item) =>
      (!targetId || item.target?.id === targetId) && Date.now() - item.createdTimestamp < 15_000,
    );
    if (entry) return entry;
  }
  return null;
}

function record(guildId, executorId, action) {
  const id = key(guildId, executorId, action);
  const now = Date.now();
  const history = (counters.get(id) || []).filter((time) => now - time < WINDOW_MS);
  history.push(now);
  counters.set(id, history);
  return history.length;
}

async function stripDangerousPermissions(member) {
  if (!member?.manageable) return false;
  const dangerous = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
  ];
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
  const channelId = config?.antiNukeLogChannelId || config?.logging?.channels?.audit;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder()
    .setColor(response === 'ban' ? 0xed4245 : 0xfee75c)
    .setTitle('Anti-Nuke Detection')
    .setDescription(`**Action:** ${action}\n**Executor:** <@${entry.executor?.id}>\n**Count:** ${count}\n**Response:** ${response}`)
    .addFields({ name: 'Audit Log ID', value: `\`${entry.id}\`` })
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function inspectAuditAction(guild, action, targetId = null) {
  const rule = ACTIONS[action];
  if (!guild || !rule) return false;
  const entry = await getEntry(guild, rule.audit, targetId);
  if (!entry?.executor?.id) return false;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if (trusted(config, guild, entry.executor.id)) return false;

  const count = record(guild.id, entry.executor.id, action);
  if (count < rule.threshold) {
    await notify(guild, action, entry, count, 'log');
    return false;
  }

  const executor = await guild.members.fetch(entry.executor.id).catch(() => null);
  const response = count >= rule.threshold + 2 ? 'ban' : 'strip_permissions';
  if (response === 'ban' && executor?.bannable) {
    await executor.ban({ reason: `Anti-Nuke: ${count} ${action} actions in ${WINDOW_MS / 1000}s` }).catch(() => {});
  } else {
    await stripDangerousPermissions(executor);
  }
  await notify(guild, action, entry, count, response);
  return true;
}

export async function findRecentAuditEntry(guild, auditType, targetId) {
  return getEntry(guild, auditType, targetId);
}

export async function sendAntiNukeLog(guild, data) {
  logger.warn(`[Anti-Nuke] ${data.action}: ${data.target || 'unknown'}`, data);
  await notify(guild, data.action, { id: data.auditLogId || 'manual', executor: data.executor }, 1, 'log');
}

export { AuditLogEvent };
