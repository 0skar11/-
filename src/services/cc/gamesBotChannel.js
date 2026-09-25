// gamesBotChannel.js — games bots (Clover) only play in their own channel, so they don't flood the chat.
//
// A message from a games bot anywhere else is deleted, with a short notice (gone after 5 seconds)
// pointing to the games bots channel. Only one notice per channel every 30 seconds, since a game
// sends several messages. Threads inside the games bots channel count as the channel.

import { GAMES_BOTS_CHANNEL_ID, gamesBotIds } from '../../config/games.js';

const NOTICE_DELETE_MS = 5_000;
const NOTICE_EVERY_MS = 30_000;
const lastNotice = new Map(); // channelId -> timestamp

export function isGamesBotsChannel(channel, channelId = channel?.id) {
    return channelId === GAMES_BOTS_CHANNEL_ID || channel?.parentId === GAMES_BOTS_CHANNEL_ID;
}

/** Returns true when the message was a games bot message outside its channel (and was deleted). */
export async function handleGamesBotOutsideChannel(message, { now = Date.now() } = {}) {
    if (!message.guild || !message.author?.bot || !gamesBotIds().has(message.author.id)) return false;
    if (isGamesBotsChannel(message.channel, message.channelId)) return false;

    await message.delete().catch(() => {});
    if (now - (lastNotice.get(message.channelId) || 0) < NOTICE_EVERY_MS) return true;
    lastNotice.set(message.channelId, now);

    // The member who started the game (Clover answers slash commands) is told where to play.
    const userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id || null;
    const notice = await message.channel.send({
        content: `🎮 ${userId ? `<@${userId}> ` : ''}ألعاب البوتات في <#${GAMES_BOTS_CHANNEL_ID}> بس.`,
        allowedMentions: { users: userId ? [userId] : [] },
    }).catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_DELETE_MS).unref?.();
    return true;
}
