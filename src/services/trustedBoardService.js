import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './config/guildConfig.js';

export const TRUSTED_BOARD_CHANNEL_ID = '1155236383464628325';
// Only the owner and this bot may write in the board channel.
const OWNER_ID = '1159601661392715906';
const BLOCKED_NOTICE_DELETE_MS = 3_000;
const TRUSTED_BOARD_TITLE = '🛡️ قائمة الـ Trusted';
// An embed field value is capped at 1024 characters by Discord.
const FIELD_LIMIT = 1024;

const PERMISSION_NAMES = [
  [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
  [PermissionFlagsBits.SendMessages, 'SendMessages'],
  [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
  [PermissionFlagsBits.ReadMessageHistory, 'ReadMessageHistory'],
];

let boardMessageId = null;
let queue = Promise.resolve();

/** Splits lines into field values that stay under Discord's field limit. */
function chunkLines(lines) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > FIELD_LIMIT && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function addSection(embed, title, lines) {
  const chunks = lines.length ? chunkLines(lines) : ['> *لا يوجد*'];
  chunks.forEach((value, index) => {
    embed.addFields({ name: index === 0 ? `${title} — ${lines.length}` : '\u200b', value });
  });
}

async function buildEmbed(guild) {
  const config = await getGuildConfig(guild.client, guild.id);
  const userIds = [...new Set(Array.isArray(config?.antiNukeTrustedUsers) ? config.antiNukeTrustedUsers : [])];
  const roleIds = [...new Set(Array.isArray(config?.antiNukeTrustedRoles) ? config.antiNukeTrustedRoles : [])];

  const members = [];
  const bots = [];
  for (const userId of userIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await guild.client.users.fetch(userId).catch(() => null);
    const line = `> <@${userId}> ・ \`${user?.username || userId}\``;
    (user?.bot ? bots : members).push(line);
  }

  const roles = [];
  for (const roleId of roleIds) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    roles.push(role
      ? `> <@&${role.id}>`
      : `> \`${roleId}\` ・ *رتبة محذوفة*`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(TRUSTED_BOARD_TITLE)
    .setDescription([
      'الأشخاص والبوتات والرتب دي مستثناة من نظام **Anti-Nuke / Anti-Raid**.',
      `👑 **صاحب السيرفر:** <@${guild.ownerId}>`,
    ].join('\n'))
    .setThumbnail(guild.iconURL({ size: 256 }) || null)
    .setFooter({ text: `الإجمالي: ${members.length + bots.length + roles.length} • آخر تحديث` })
    .setTimestamp();

  addSection(embed, '👤 الأعضاء', members);
  addSection(embed, '🤖 البوتات', bots);
  addSection(embed, '🎭 الرتب', roles);
  return embed;
}

async function fetchBoardChannel(client) {
  const channel = await client.channels.fetch(TRUSTED_BOARD_CHANNEL_ID).catch((error) => {
    throw new Error(`Channel ${TRUSTED_BOARD_CHANNEL_ID} could not be fetched (is the bot in that server?): ${error.message}`);
  });
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !channel.guild) {
    throw new Error(`Channel ${TRUSTED_BOARD_CHANNEL_ID} is not a server text channel`);
  }

  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = PERMISSION_NAMES.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
  if (missing.length) {
    throw new Error(`Missing permissions in channel ${TRUSTED_BOARD_CHANNEL_ID}: ${missing.join(', ')}`);
  }
  return channel;
}

async function findBoardMessage(channel) {
  if (boardMessageId) {
    const cached = await channel.messages.fetch(boardMessageId).catch(() => null);
    if (cached) return cached;
  }
  const recentMessages = await channel.messages.fetch({ limit: 100 });
  return recentMessages.find((message) => (
    message.author?.id === channel.client.user.id && message.embeds[0]?.title === TRUSTED_BOARD_TITLE
  )) || null;
}

async function publish(client) {
  const channel = await fetchBoardChannel(client);
  const embed = await buildEmbed(channel.guild);
  const existing = await findBoardMessage(channel);
  if (existing) {
    await existing.edit({ content: '', embeds: [embed], allowedMentions: { parse: [] } });
    boardMessageId = existing.id;
    return { status: 'updated', channelId: channel.id };
  }
  const sent = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  boardMessageId = sent.id;
  logger.info(`Published trusted board in channel ${TRUSTED_BOARD_CHANNEL_ID}`);
  return { status: 'sent', channelId: channel.id };
}

/**
 * Posts the trusted list in its channel, or edits the existing post to match the current config.
 * Calls run one after another so quick trust/untrust changes never produce two posts.
 * Returns { status, channelId } where status is 'sent' or 'updated'; throws on failure.
 */
export function publishTrustedBoard(client) {
  const run = queue.then(() => publish(client));
  queue = run.catch(() => {});
  return run;
}

/** Refreshes the board after a trust change in `guildId`; failures are logged, never thrown. */
export async function refreshTrustedBoard(client, guildId) {
  const channel = client.channels.cache.get(TRUSTED_BOARD_CHANNEL_ID);
  if (channel?.guild && channel.guild.id !== guildId) return;
  await publishTrustedBoard(client).catch((error) => logger.error('Failed to refresh trusted board:', error));
}

/**
 * Deletes anything posted in the board channel by someone other than the owner or this bot,
 * and tells human authors that writing there is not allowed (the notice goes away after 3 seconds).
 * Returns true when the message was blocked.
 */
export async function handleTrustedBoardMessage(message) {
  if (message.channelId !== TRUSTED_BOARD_CHANNEL_ID || !message.guild) return false;
  if (message.author?.id === OWNER_ID || message.author?.id === message.client.user?.id) return false;

  await message.delete().catch(() => {});
  if (message.author?.bot || message.webhookId) return true;
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> ممنوع الكتابة هنا.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}
