// ccService.js — every change to a member's Chaos Credits goes through here.
//
// CC lives in the member's economy record (`guild:<id>:economy:<user>`) next to the old, now unused
// wallet/bank fields:
//   cc          current balance
//   ccStats     { earned, spent, gamesPlayed, podiums, groupWins, soloWins }
//   ccLastDaily timestamp of the last `daily`
//   ccSolo      { day: 'YYYY-MM-DD', earned } — solo game CC earned today, for the daily cap
//   ccInventory { itemId: quantity } — reserved for the store (see ccStoreService.js)

import { CC } from '../../config/cc.js';
import { getEconomyKey, getEconomyPrefix } from '../../utils/database.js';
import { normalizeEconomyData } from '../../utils/schemas.js';
import { DEFAULT_ECONOMY_DATA } from '../../utils/constants.js';
import { Mutex } from '../../utils/mutex.js';
import { logger } from '../../utils/logger.js';

const EMPTY_STATS = { earned: 0, spent: 0, gamesPlayed: 0, podiums: 0, groupWins: 0, soloWins: 0 };

/** CC for 1st, 2nd and 3rd place in a group game with `playerCount` players. */
export function groupRewards(playerCount) {
    const players = Math.floor(Number(playerCount) || 0);
    if (players < 2) return [];
    const pool = Math.min(players, CC.group.maxCountedPlayers) * CC.group.perPlayer;
    // Fewer places than players, so a 2 player game can't pay both of them.
    const places = Math.min(CC.group.split.length, players - 1);
    return CC.group.split.slice(0, places).map((share) => Math.max(1, Math.round(pool * share)));
}

/** How much of a solo win is still allowed today, given what was already earned. */
export function soloRewardLeft(alreadyEarnedToday) {
    return Math.max(0, Math.min(CC.solo.win, CC.solo.dailyCap - (alreadyEarnedToday || 0)));
}

export function utcDay(now = Date.now()) {
    return new Date(now).toISOString().slice(0, 10);
}

export function readCC(record = {}) {
    return {
        cc: Number.isSafeInteger(record.cc) && record.cc > 0 ? record.cc : 0,
        stats: { ...EMPTY_STATS, ...(record.ccStats || {}) },
        lastDaily: record.ccLastDaily || 0,
        inventory: { ...(record.ccInventory || {}) },
    };
}

async function loadRecord(client, guildId, userId) {
    if (!client?.db?.get) throw new Error('Database not available');
    // Unlike getEconomyData this throws on a read error, so a failed read is never written back as an empty record.
    const raw = await client.db.get(getEconomyKey(guildId, userId), {});
    return normalizeEconomyData(raw, DEFAULT_ECONOMY_DATA);
}

async function saveRecord(client, guildId, userId, record) {
    const saved = await client.db.set(getEconomyKey(guildId, userId), record);
    if (saved === false) throw new Error('Failed to save CC');
}

/** Loads the member's record, lets `change` edit it and saves it, one change per member at a time. */
async function updateRecord(client, guildId, userId, change) {
    return Mutex.runExclusive(`cc:${guildId}:${userId}`, async () => {
        const record = await loadRecord(client, guildId, userId);
        const state = readCC(record);
        const result = change(state, record);
        if (result?.skipSave) return result;
        record.cc = state.cc;
        record.ccStats = state.stats;
        record.ccLastDaily = state.lastDaily;
        record.ccInventory = state.inventory;
        await saveRecord(client, guildId, userId, record);
        return { ...result, balance: state.cc, stats: state.stats };
    });
}

function credit(state, amount) {
    const next = state.cc + amount;
    if (!Number.isSafeInteger(next)) throw new Error('CC balance overflow');
    state.cc = next;
    state.stats.earned += amount;
}

export async function getProfile(client, guildId, userId) {
    return readCC(await loadRecord(client, guildId, userId));
}

/** `daily`: the only way to get CC outside games. */
export async function claimDaily(client, guildId, userId, { premium = false, now = Date.now() } = {}) {
    return updateRecord(client, guildId, userId, (state) => {
        const nextAt = state.lastDaily + CC.daily.cooldownMs;
        if (now < nextAt) return { ok: false, skipSave: true, remaining: nextAt - now };
        const bonus = premium ? Math.floor(CC.daily.amount * CC.daily.premiumBonus) : 0;
        credit(state, CC.daily.amount + bonus);
        state.lastDaily = now;
        logger.info('[CC] Daily claimed', { guildId, userId, amount: CC.daily.amount + bonus });
        return { ok: true, amount: CC.daily.amount, bonus, nextAt: now + CC.daily.cooldownMs };
    });
}

/**
 * Pays a finished group game. `ranking` is the finishing order (user IDs, 1st first); only the top
 * places get CC. Every player in `playerIds` gets a game counted in their stats.
 */
export async function awardGroupGame(client, guildId, { game, ranking, playerIds }) {
    const rewards = groupRewards(playerIds.length);
    const winners = ranking.slice(0, rewards.length).map((userId, index) => ({ userId, place: index + 1, amount: rewards[index] }));
    const winnerIds = new Set(winners.map((w) => w.userId));

    const paid = [];
    for (const winner of winners) {
        try {
            const result = await updateRecord(client, guildId, winner.userId, (state) => {
                credit(state, winner.amount);
                state.stats.gamesPlayed += 1;
                state.stats.podiums += 1;
                if (winner.place === 1) state.stats.groupWins += 1;
            });
            paid.push({ ...winner, balance: result.balance });
        } catch (error) {
            logger.error(`[CC] Failed to pay ${winner.userId} for ${game}`, error);
        }
    }
    await Promise.all(playerIds.filter((id) => !winnerIds.has(id)).map((userId) => updateRecord(client, guildId, userId, (state) => {
        state.stats.gamesPlayed += 1;
    }).catch((error) => logger.warn(`[CC] Failed to count ${game} for ${userId}: ${error.message}`))));

    logger.info('[CC] Group game paid', { guildId, game, players: playerIds.length, winners: paid.map((w) => `${w.userId}:${w.amount}`) });
    return paid;
}

/** Pays a solo game win, up to the daily solo cap. Returns `{ amount, capped }`. */
export async function awardSoloWin(client, guildId, userId, game, { now = Date.now() } = {}) {
    try {
        return await updateRecord(client, guildId, userId, (state, record) => {
            const today = utcDay(now);
            const solo = record.ccSolo?.day === today ? record.ccSolo : { day: today, earned: 0 };
            const amount = soloRewardLeft(solo.earned);
            state.stats.soloWins += 1;
            if (amount > 0) credit(state, amount);
            record.ccSolo = { day: today, earned: solo.earned + amount };
            return { amount, capped: amount < CC.solo.win, game };
        });
    } catch (error) {
        logger.error(`[CC] Failed to pay solo ${game} win for ${userId}`, error);
        return { amount: 0, capped: false, failed: true };
    }
}

/** Takes CC away (store purchases). Returns `{ ok: false, balance }` when the member can't afford it. */
export async function spendCC(client, guildId, userId, amount, reason = 'unknown') {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid CC amount');
    return updateRecord(client, guildId, userId, (state) => {
        if (state.cc < amount) return { ok: false, skipSave: true, balance: state.cc };
        state.cc -= amount;
        state.stats.spent += amount;
        logger.info('[CC] Spent', { guildId, userId, amount, reason });
        return { ok: true };
    });
}

/** Staff correction from the economy dashboard: adds (positive) or removes (negative) CC. */
export async function adjustCC(client, guildId, userId, delta, staffId) {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Invalid CC amount');
    return updateRecord(client, guildId, userId, (state) => {
        state.cc = Math.max(0, state.cc + delta);
        logger.info('[CC] Staff adjustment', { guildId, userId, delta, staffId });
        return { ok: true };
    });
}

/** Store helper: runs `change(state)` on the member's CC state inside the same lock as payments. */
export async function updateCCState(client, guildId, userId, change) {
    return updateRecord(client, guildId, userId, (state, record) => change(state, record));
}

/** Everyone in the guild with CC, richest first. */
export async function getLeaderboard(client, guildId) {
    const prefix = getEconomyPrefix(guildId);
    const keys = await client.db.list(prefix);
    const rows = [];
    for (const key of Array.isArray(keys) ? keys : []) {
        const record = await client.db.get(key, null);
        const { cc, stats } = readCC(record || {});
        if (cc > 0) rows.push({ userId: key.slice(prefix.length), cc, earned: stats.earned });
    }
    return rows.sort((a, b) => b.cc - a.cc || b.earned - a.earned);
}
