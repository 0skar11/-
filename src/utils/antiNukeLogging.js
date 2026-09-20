import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

export const ANTI_NUKE_LOG_CHANNEL_ID = '1550564287129456810';

function stringify(value) {
  return String(value ?? 'غير محدد').replace(/`/g, 'ˋ').slice(0, 1024);
}

export async function getAntiNukeLogChannel(guild) {
  const channel = guild.channels.cache.get(ANTI_NUKE_LOG_CHANNEL_ID)
    || await guild.channels.fetch(ANTI_NUKE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return null;

  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return null;
  return channel;
}

export async function sendAntiNukeLog(guild, {
  action,
  executor = null,
  target = null,
  details = [],
  severity = 'HIGH',
  mentionEveryone = false,
} = {}) {
  const channel = await getAntiNukeLogChannel(guild);
  if (!channel) return null;

  const color = severity === 'CRITICAL' ? 0xED4245 : severity === 'HIGH' ? 0xFEE75C : 0x5865F2;
  const fields = [
    { name: 'العملية', value: stringify(action), inline: true },
    { name: 'الخطورة', value: stringify(severity), inline: true },
    { name: 'المنفذ', value: executor ? `${executor} (${stringify(executor.tag || executor.username || executor.id)})` : 'غير معروف', inline: false },
    ...(target ? [{ name: 'الهدف', value: stringify(target), inline: false }] : []),
    ...details.slice(0, 20).map(([name, value]) => ({ name: stringify(name), value: stringify(value), inline: true })),
  ];

  return channel.send({
    content: mentionEveryone ? '@everyone' : undefined,
    embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle('🛡️ Anti-Nuke / Anti-Raid')
      .addFields(fields)
      .setDescription(`السيرفر: **${stringify(guild.name)}**\nالوقت: <t:${Math.floor(Date.now() / 1000)}:F>`)
      .setFooter({ text: 'TitanBot • Security Logs' })],
    allowedMentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
  }).catch(error => {
    logger.warn(`Could not send security log in ${guild.id}: ${error.message}`);
    return null;
  });
}
