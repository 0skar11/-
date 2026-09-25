// cc.js — Chaos Credits (CC), the server's only currency.
//
// CC is earned from games only: wins in the games bot (Clover), and this bot's own games when they
// are switched back on (config/games.js). There is no `daily` any more; work, crime, rob, beg, fish,
// mine and gamble were removed on purpose too. Members can send CC to each other with `give`, which
// takes a tax that grows when someone sends a lot in a week (`transfer` below).

import { getColor } from './bot.js';

export const CC = {
    name: 'Chaos Credits',
    short: 'CC',
    emoji: '🌀',

    group: {
        // The pool grows by this much for every player, up to `maxCountedPlayers` players.
        perPlayer: 10,
        maxCountedPlayers: 30,
        // How the pool is split between 1st, 2nd and 3rd place.
        split: [0.5, 0.3, 0.2],
    },

    solo: {
        // CC for winning a solo game (rps, xo, solo question, solo number, slots).
        win: 5,
        // Most CC a member can earn from solo games per day (UTC).
        dailyCap: 50,
    },

    // A win announced by the games bot (Clover), read from its "👑 | @winner" message
    // (services/cc/gamesBotWins.js). Its message doesn't say how many played, so a win pays a fixed
    // amount, with a daily cap so a game with a friend over and over can't be farmed.
    gamesBot: {
        win: 10,
        // Most CC a member can get from games bot wins per day (UTC).
        dailyCap: 200,
    },

    // Leveling up (chat or voice XP) pays `perLevel × the new level`: level 1 = 10 CC, level 10 = 100,
    // level 50 = 500. Gaining several levels at once pays each of them. Staff changing levels by
    // command (leveladd / levelset) pays nothing.
    levelUp: {
        perLevel: 10,
    },

    // A limited-time event: every CC earned from games (group, solo, Clover wins and the games bot's
    // API rewards), level-ups, and the daily caps are multiplied until `until`, then it stops by itself. Transfers
    // and staff changes are never multiplied. Set `multiplier: 1` to end it early.
    boost: {
        multiplier: 5,
        until: '2026-09-30T08:15:00Z',
    },

    // `give` / `تحويل`: sending CC to another member. The receiver gets the amount minus the tax.
    // The first `cheapPerWeek` transfers of the last 7 days pay `taxPercent`; each one after that pays
    // `extraPercentPerTransfer` more, up to `maxTaxPercent`. With these numbers: 5%, 5%, 5%, 10%, 15%, ... 50%.
    transfer: {
        minAmount: 10,
        taxPercent: 5,
        cheapPerWeek: 3,
        extraPercentPerTransfer: 5,
        maxTaxPercent: 50,
    },
};

/** The CC multiplier right now: CC.boost.multiplier while the event runs, otherwise 1. */
export function ccBoost(now = Date.now()) {
    const { multiplier, until } = CC.boost || {};
    const end = Date.parse(until);
    return Number.isInteger(multiplier) && multiplier > 1 && Number.isFinite(end) && now < end ? multiplier : 1;
}

/** `🔥 CC ×5 — بيخلص in 4 days (date)` while the event runs, otherwise ''. Discord shows the time in each member's timezone. */
export function ccBoostLine(now = Date.now()) {
    const multiplier = ccBoost(now);
    if (multiplier === 1) return '';
    const end = Math.floor(Date.parse(CC.boost.until) / 1000);
    return `🔥 **CC ×${multiplier}** — بيخلص <t:${end}:R> (<t:${end}:f>)`;
}

/**
 * Embed for CC and game messages. A plain object (not an EmbedBuilder) so the emojis stay: the
 * EmbedBuilder helpers strip emojis, but the games need them (slot reels, medals, roles).
 */
export function ccEmbed(title, description = '', { fields = [], thumbnail = null, color = 'economy' } = {}) {
    return {
        color: getColor(color),
        title: String(title).slice(0, 256),
        ...(description ? { description: String(description).slice(0, 4096) } : {}),
        ...(fields.length ? { fields: fields.slice(0, 25) } : {}),
        ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
    };
}

export function formatCC(amount) {
    return `**${Number(amount || 0).toLocaleString('en-US')}** ${CC.emoji} ${CC.short}`;
}
