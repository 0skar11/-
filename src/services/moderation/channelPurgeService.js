import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { isServerOwner } from '../../config/serverOwners.js';

// `purge` wipes the whole channel. Only the server owners can run it, and only after pressing Confirm.
const CONFIRM_WINDOW_MS = 60_000;
const RESULT_DELETE_DELAY_MS = 5_000;

export function isPurgeOwner(userId) {
  return isServerOwner(userId);
}

export function canPurgeChannel(channel) {
  return Boolean(channel?.isTextBased?.() && typeof channel.bulkDelete === 'function');
}

/** Confirm/Cancel buttons for a purge of `channelId`; they expire after one minute. */
export function buildPurgeConfirmation(channelId) {
  const expiresAt = Date.now() + CONFIRM_WINDOW_MS;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`purge_confirm:${channelId}:${expiresAt}`)
      .setLabel('Confirm')
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`purge_cancel:${channelId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    content: `⚠️ **Purge** — سيتم حذف كل رسائل هذه الروم. اضغط Confirm خلال ${CONFIRM_WINDOW_MS / 1000} ثانية.`,
    components: [row],
    allowedMentions: { parse: [] },
  };
}

export function isPurgeConfirmationExpired(expiresAt) {
  return !Number.isFinite(Number(expiresAt)) || Date.now() > Number(expiresAt);
}

/** Bulk-deletes every message Discord allows (messages older than 14 days can't be bulk deleted). */
export async function purgeChannel(channel) {
  let deletedCount = 0;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100 });
    if (!batch.size) break;
    const deleted = await channel.bulkDelete(batch, true);
    deletedCount += deleted.size;
    if (!deleted.size || batch.size < 100) break;
  }
  return deletedCount;
}

export async function sendPurgeResult(channel, deletedCount) {
  const result = await channel.send({
    content: `🧹 تم تنظيف الروم بالكامل. عدد الرسائل المحذوفة: **${deletedCount}**`,
    allowedMentions: { parse: [] },
  }).catch((error) => {
    logger.debug('Failed to send purge result:', error);
    return null;
  });
  if (result) setTimeout(() => result.delete().catch(() => {}), RESULT_DELETE_DELAY_MS);
}

/** Prefix/no-prefix `purge`: owner only, and it asks for confirmation first. */
export async function handlePurgeMessage(message) {
  if (!isPurgeOwner(message.author.id)) {
    const denied = await message.channel.send('🚫 Owner Only').catch(() => null);
    if (denied) setTimeout(() => denied.delete().catch(() => {}), RESULT_DELETE_DELAY_MS);
    return;
  }
  if (!canPurgeChannel(message.channel)) {
    await message.channel.send('❌ Text Channels Only').catch(() => {});
    return;
  }
  await message.channel.send(buildPurgeConfirmation(message.channel.id)).catch((error) => {
    logger.error('Failed to send purge confirmation:', error);
  });
}
