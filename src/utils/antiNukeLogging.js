import { ChannelType } from 'discord.js';
import { logger } from './logger.js';

export const ANTI_NUKE_LOG_CHANNEL_ID = '1550564287129456810';
const EVERYONE_MENTION = '@everyone';

async function getLogChannel(guild) {
  const channel = guild.channels.cache.get(ANTI_NUKE_LOG_CHANNEL_ID)
    || await guild.channels.fetch(ANTI_NUKE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const permissions = channel.permissionsFor(guild.members.me);
  if (!permissions?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return null;
  return channel;
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
    `**وقت العملية:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ];

  return channel.send({
    // Keep the mention outside the embed so Discord can notify everyone.
    content: mentionEveryone ? EVERYONE_MENTION : undefined,
    embeds: [{
      title: '🛡️ Anti-Nuke | تنبيه أمني',
      description: detailLines.join('\n\n'),
      color: severity === 'CRITICAL' ? 0xED4245 : 0xFEE75C,
      timestamp: new Date().toISOString(),
      footer: { text: `TitanBot • Anti-Nuke Security Log • ${guild.name}` },
    }],
    allowedMentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
  }).catch(error => {
    logger.warn(`Failed to send anti-nuke log in ${ANTI_NUKE_LOG_CHANNEL_ID}: ${error.message}`);
    return null;
  });
}
