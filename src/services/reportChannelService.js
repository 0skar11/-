import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

// Any message posted in this channel is turned into a report; no command needed.
// `/report file` sends its reports here as well.
export const REPORT_CHANNEL_ID = '1552304815713943602';

const REPORT_COLOR = 0xe74c3c;
const MAX_DESCRIPTION_LENGTH = 4000;

function buildReportEmbed({ reporter, content, reportedUser, sourceChannel }) {
  const lines = [
    `**المُبلِّغ:** ${reporter} (${reporter.tag} - ${reporter.id})`,
  ];
  if (reportedUser) lines.push(`**المُبلَّغ عنه:** ${reportedUser} (${reportedUser.tag} - ${reportedUser.id})`);
  if (sourceChannel) lines.push(`**الروم:** ${sourceChannel}`);
  lines.push(`**الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`);

  const body = content?.trim() || '*(بدون نص)*';
  return {
    color: REPORT_COLOR,
    title: '📩 بلاغ جديد',
    author: { name: reporter.tag, icon_url: reporter.displayAvatarURL() },
    description: `${lines.join('\n')}\n\n**المشكلة:**\n${body}`.slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

async function fetchReportChannel(guild) {
  const channel = guild.channels.cache.get(REPORT_CHANNEL_ID)
    || await guild.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

function ownerPing(guild) {
  return guild.ownerId
    ? { content: `<@${guild.ownerId}> بلاغ جديد!`, allowedMentions: { users: [guild.ownerId] } }
    : { content: 'بلاغ جديد!', allowedMentions: { parse: [] } };
}

// `/report file`: posts the report in the report channel. Returns false if the channel is unavailable.
export async function sendReport(guild, { reporter, reportedUser, reason, sourceChannel }) {
  const channel = await fetchReportChannel(guild);
  if (!channel) {
    logger.warn(`Report channel ${REPORT_CHANNEL_ID} was not found in guild ${guild.id}.`);
    return false;
  }
  await channel.send({
    ...ownerPing(guild),
    embeds: [buildReportEmbed({ reporter, content: reason, reportedUser, sourceChannel })],
  });
  return true;
}

// Turns a plain message in the report channel into a report embed and removes the original.
// Replies are left alone so staff and the reporter can talk under a report.
// Returns true when the message belonged to the report channel (handled), false otherwise.
export async function handleReportChannelMessage(message) {
  if (message.channelId !== REPORT_CHANNEL_ID) return false;
  if (message.reference?.messageId) return true;

  const permissions = message.guild.members.me ? message.channel.permissionsFor(message.guild.members.me) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    logger.warn(`Bot lacks View Channel, Send Messages or Embed Links in report channel ${REPORT_CHANNEL_ID}.`);
    return true;
  }

  const embed = buildReportEmbed({ reporter: message.author, content: message.content });
  const files = [...message.attachments.values()].map((attachment) => ({ attachment: attachment.url, name: attachment.name }));

  let posted = null;
  try {
    posted = await message.channel.send({ ...ownerPing(message.guild), embeds: [embed], files });
  } catch (error) {
    // Attachments can exceed the bot's upload limit: post the report without them and keep the original.
    logger.error(`Failed to post report from ${message.author.tag} with attachments:`, error);
    await message.channel.send({ ...ownerPing(message.guild), embeds: [embed] }).catch((fallbackError) => {
      logger.error(`Failed to post report from ${message.author.tag}:`, fallbackError);
    });
    return true;
  }

  if (posted && permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.delete().catch(() => null);
  }
  logger.info(`Report registered from ${message.author.tag} (${message.author.id}) in guild ${message.guild.id}.`);
  return true;
}
