import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';

// Only owners and trusted members may mention @everyone / @here.
// Anyone else has the message deleted and gets a short notice (gone after 3 seconds).
const EVERYONE_MENTION = /@(?:everyone|here)\b/u;
const BLOCKED_NOTICE_DELETE_MS = 3_000;

async function canMentionEveryone(message) {
  if (isServerOwner(message.author.id)) return true;
  return canLiftHardBan(message.guild, message.author.id);
}

/** Returns true when the message was deleted for mentioning @everyone / @here. */
export async function handleEveryoneMention(message) {
  if (!message.mentions?.everyone && !EVERYONE_MENTION.test(message.content || '')) return false;
  if (await canMentionEveryone(message)) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> منشن everyone للـ trusted بس.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}
