import { AuditLogEvent, ChannelType } from 'discord.js';

export const ANTI_NUKE_LOG_CHANNEL_ID = '1550564287129456810';
const EVERYONE_MENTION = '@everyone';

function formatExecutor(executor) {
  return executor ? `${executor} (${executor.tag || executor.username || executor.id})` : 'Unknown';
}

async function getLogChannel(guild) {
  const channel = guild.channels.cache.get(ANTI_NUKE_LOG_CHANNEL_ID)
    || await guild.channels.fetch(ANTI_NUKE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  const permissions = channel.permissionsFor(guild.members.me);
  if (!permissions?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return null;
  return channel;
}

export async function sendAntiNukeLog(guild, {
  action,
  executor = null,
  target = null,
  details = [],
  severity = 'HIGH',
  mentionEveryone = true,
}) {
  const channel = await getLogChannel(guild);
  if (!channel) return null;

  const lines = [
    `**Action:** ${action}`,
    `**Severity:** ${severity}`,
    `**Executor:** ${formatExecutor(executor)}`,
    target ? `**Target:** ${target}` : null,
    ...details.map(([name, value]) => `**${name}:** ${value}`),
    `**Guild:** ${guild.name} (${guild.id})`,
    `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ].filter(Boolean);

  return channel.send({
    content: mentionEveryone ? EVERYONE_MENTION : undefined,
    embeds: [{
      title: `🛡️ Anti-Nuke Alert — ${action}`,
      description: lines.join('\n'),
      color: severity === 'CRITICAL' ? 0xED4245 : 0xFEE75C,
      timestamp: new Date().toISOString(),
      footer: { text: 'TitanBot Anti-Nuke' },
    }],
    allowedMentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
  }).catch(() => null);
}

export async function findRecentAuditEntry(guild, types, targetId = null) {
  const typeList = Array.isArray(types) ? types : [types];
  for (const type of typeList) {
    const logs = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);
    const entry = logs?.entries.find(item => (
      (!targetId || item.target?.id === targetId)
      && Date.now() - item.createdTimestamp < 15_000
    ));
    if (entry) return entry;
  }
  return null;
}

export { AuditLogEvent };
