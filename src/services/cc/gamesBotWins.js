// gamesBotWins.js — pays CC for wins in the games bot (Clover).
//
// When a Clover game ends it posts the winner as `👑 | @winner` (with a winner card image). This
// reads those messages and pays the winner CC.gamesBot.win, capped per day (config/cc.js). Only
// messages from the games bot IDs count (config/games.js), so members can't fake a win by typing
// the same text, and each message pays once.

import { gamesBotIds } from '../../config/games.js';
import { CC, formatCC, ccBoost } from '../../config/cc.js';
import { awardGamesBotWin } from './ccService.js';
import { logger } from '../../utils/logger.js';

// `👑 | <@id>`: the crown, an optional bar, one mention and nothing else.
const WIN_MESSAGE = /^\s*👑️?\s*\|?\s*<@!?(\d{17,20})>\s*$/u;
const NOTICE_DELETE_MS = 15_000;
const PAID_MEMORY = 500;
const paidMessages = new Set();

/** The winner's user ID when `content` is a games bot win message, otherwise null. */
export function parseWinner(content) {
    return WIN_MESSAGE.exec(String(content || ''))?.[1] || null;
}

function rememberPaid(messageId) {
    paidMessages.add(messageId);
    if (paidMessages.size > PAID_MEMORY) paidMessages.delete(paidMessages.values().next().value);
}

/**
 * Pays the winner of a games bot win message. Returns true when `message` was one (paid or not),
 * so the caller can stop handling it.
 */
export async function handleGamesBotWin(message, client) {
    if (!message.guild || !message.author?.bot || !gamesBotIds().has(message.author.id)) return false;
    const winnerId = parseWinner(message.content);
    if (!winnerId) return false;
    if (paidMessages.has(message.id)) return true;
    rememberPaid(message.id);

    const winner = message.mentions?.users?.get(winnerId);
    if (winner?.bot) return true;

    try {
        const { amount, balance, boost } = await awardGamesBotWin(client, message.guild.id, winnerId);
        logger.info('[CC] Games bot win paid', { guildId: message.guild.id, userId: winnerId, amount, boost, messageId: message.id });
        const text = amount > 0
            ? `🌀 <@${winnerId}> كسب +${formatCC(amount)}${boost > 1 ? ` 🔥 (×${boost})` : ''} • رصيدك: ${formatCC(balance)}`
            : `🌀 <@${winnerId}> وصلت لحد الـ CC من الألعاب النهارده (${CC.gamesBot.dailyCap * (boost || 1)} ${CC.short})، الفوز اتحسب في إحصائياتك.`;
        const notice = await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
        if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_DELETE_MS).unref?.();
    } catch (error) {
        logger.error(`[CC] Failed to pay games bot win for ${winnerId}`, error);
    }
    return true;
}
