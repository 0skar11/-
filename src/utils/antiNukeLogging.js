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

export async function sendAntiNukeLog(guild, { action, executor = null, target = null, details = [], severity = 'HIGH', mentionEveryone = true }) {
  const channel = await getLogChannel(guild);
  if (!channel) return null;

  const lines = [
    `**العملية:** ${action}`,
    `**الخطورة:** ${severity}`,
    `**المنفذ:** ${executor ? `${executor} — ${executor.tag || executor.username || executor.id}` : 'غير معروف'}`,
    target ? `**الهدف:** ${target}` : null,
    ...details.map(([name, value]) => `**${name}:** ${value}`),
    `**السيرفر:** ${guild.name} (${guild.id})`,
    `**الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ].filter(Boolean);

  return channel.send({
    content: mentionEveryone ? EVERYONE_MENTION : undefined,
    embeds: [{
      title: `🛡️ Anti-Nuke | ${action}`,
      description: lines.join('\n'),
      color: severity === 'CRITICAL' ? 0xED4245 : 0xFEE75C,
      timestamp: new Date().toISOString(),
      footer: { text: 'TitanBot • Anti-Nuke Security Log' },
    }],
    allowedMentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
  }).catch(error => {
    logger.warn(`Failed to send anti-nuke log in ${ANTI_NUKE_LOG_CHANNEL_ID}: ${error.message}`);
    return null;
  });
}
