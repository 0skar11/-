// Player messages keep their buttons after the music stops or the bot restarts; those buttons no longer work.

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { MUSIC_BUTTON_IDS } from './musicEmbeds.js';
import { getGuildMusicData } from './playerStore.js';

const PLAYER_BUTTON_IDS = new Set([MUSIC_BUTTON_IDS.PAUSE, MUSIC_BUTTON_IDS.RESUME, MUSIC_BUTTON_IDS.SKIP, MUSIC_BUTTON_IDS.STOP]);
const SCAN_LIMIT = 30;

export function isPlayerMessage(message, botId) {
    return message?.author?.id === botId
        && (message.components || []).some((row) => (row.components || []).some((component) => PLAYER_BUTTON_IDS.has(component.customId)));
}

/** Deletes the bot's player messages in a channel, except the live one (keepId). */
export async function deleteStalePlayerMessages(channel, botId, keepId = null) {
    const messages = await channel.messages.fetch({ limit: SCAN_LIMIT }).catch(() => null);
    let deleted = 0;
    for (const message of messages?.values() || []) {
        if (message.id === keepId || !isPlayerMessage(message, botId)) continue;
        if (await message.delete().then(() => true).catch(() => false)) deleted++;
    }
    return deleted;
}

/** On startup no player is running, so every earlier player message left in any channel is dead. */
export async function purgeStalePlayerMessages(client) {
    let deleted = 0;
    for (const guild of client.guilds.cache.values()) {
        const me = guild.members.me;
        if (!me) continue;
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isTextBased?.() || channel.isThread?.() || !channel.messages?.fetch) continue;
            if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) continue;
            // A session may start while the scan runs; never delete its message.
            deleted += await deleteStalePlayerMessages(channel, client.user.id, getGuildMusicData(guild.id).playerMessageId);
        }
    }
    if (deleted) logger.info(`Deleted ${deleted} stale music player message(s)`);
    return deleted;
}
