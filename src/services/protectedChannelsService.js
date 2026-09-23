import { TRUSTED_BOARD_CHANNEL_ID } from './trustedBoardService.js';
import { MODERATION_COMMANDS_CHANNEL_ID } from './moderationCommandsBoardService.js';

// Board channels where only the owner and this bot may write.
const PROTECTED_CHANNEL_IDS = new Set([TRUSTED_BOARD_CHANNEL_ID, MODERATION_COMMANDS_CHANNEL_ID]);
const OWNER_ID = '1159601661392715906';
const BLOCKED_NOTICE_DELETE_MS = 3_000;

/**
 * Deletes anything posted in a protected channel by someone other than the owner or this bot,
 * and tells human authors that writing there is not allowed (the notice goes away after 3 seconds).
 * Returns true when the message was blocked.
 */
export async function handleProtectedChannelMessage(message) {
  if (!PROTECTED_CHANNEL_IDS.has(message.channelId) || !message.guild) return false;
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
