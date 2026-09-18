import { AuditLogEvent, ChannelType, PermissionFlagsBits } from 'discord.js';

const EVERYONE_MENTION = '@everyone';
const ANTI_NUKE_LOG_CHANNEL_ID = process.env.ANTI_NUKE_LOG_CHANNEL_ID;
const DEFAULT_AUDIT_WINDOW_MS = 12_000;

export { AuditLogEvent };

async function getLogChannel(guild) {
  if (!ANTI_NUKE_LOG_CHANNEL_ID) return null;

  const channel = guild.channels.cache.get(ANTI_NUKE_LOG_CHANNEL_ID)
    || await guild.channels.fetch(ANTI_NUKE_LOG_CHANNEL_ID).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const permissions = channel.permissionsFor(guild.members.me);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    return null;
  }

  return channel;
}

function entryTargetId(entry) {
  return entry?.target?.id
    || entry?.extra?.channel?.id
    || null;
}

export async function findRecentAuditEntry(guild, eventType, targetId = null, {
  windowMs = DEFAULT_AUDIT_WINDOW_MS,
  limit = 10,
  skipSelf = true,
  skipBotExecutors = false,
} = {}) {
  const types = Array.isArray(eventType) ? eventType : [eventType];
  const now = Date.now();
  let latestEntry = null;

  for (const type of types) {
    const logs = await guild.fetchAuditLogs({ type, limit }).catch(() => null);
    if (!logs?.entries?.size) continue;

    for (const entry of logs.entries.values()) {
      if (!entry?.executor || !entry?.createdTimestamp) continue;
      if (now - entry.createdTimestamp > windowMs) continue;
      if (targetId && entryTargetId(entry) !== targetId) continue;
      if (skipSelf && entry.executor.id === guild.members.me?.id) continue;
      if (skipBotExecutors && entry.executor.bot) continue;

      if (!latestEntry || entry.createdTimestamp > latestEntry.createdTimestamp) {
        latestEntry = entry;
      }
    }
  }

  return latestEntry;
}

export async function sendAntiNukeLog(
  guild,
  {
    action,
    executor = null,
    target = null,
    details = [],
    severity = 'HIGH',
    mentionEveryone = true,
  },
) {
  const channel = await getLogChannel(guild);
  if (!channel) return null;

  const detailLines = [
    `**العملية التي حدثت:** ${action}`,
    `**مستوى الخطورة:** ${severity}`,
    `**المنفذ:** ${executor ? `${executor} — ${executor.tag || executor.username || executor.id}` : 'غير معروف'}`,
    `**الهدف:** ${target || 'غير محدد'}`,
    ...details.map(([name, value]) => `**${name}:** ${value}`),
    `**السيرفر:** ${guild.name} (${guild.id})`,
    `**الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ];

  return channel.send({
    content: mentionEveryone ? EVERYONE_MENTION : undefined,
    embeds: [{
      title: `🛡️ Anti-Nuke | ${action}`,
      description: detailLines.join('\n\n'),
      color: severity === 'CRITICAL' ? 0xED4245 : 0xFEE75C,
      timestamp: new Date().toISOString(),
      footer: { text: `TitanBot • Anti-Nuke Security Log • ${guild.name}` },
    }],
    allowedMentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
  }).catch(() => null);
}
