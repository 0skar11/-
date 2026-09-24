// cc.js — Chaos Credits (CC), the server's only currency.
//
// CC can only be earned two ways:
//   1. `daily` once every 24 hours.
//   2. Games: group games pay the top 3 (more players = bigger rewards), solo games pay a little
//      and have a daily cap so they can't be farmed.
// Work, crime, rob, beg, fish, mine, gamble and pay were removed on purpose.

import { getColor } from './bot.js';

export const CC = {
    name: 'Chaos Credits',
    short: 'CC',
    emoji: '🌀',

    daily: {
        amount: 100,
        cooldownMs: 24 * 60 * 60 * 1000,
        // Extra share of the daily for members with the premium role (guild config `premiumRoleId`).
        premiumBonus: 0.1,
    },

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
        win: 20,
        // Most CC a member can get from games bot wins per day (UTC).
        dailyCap: 200,
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
