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
