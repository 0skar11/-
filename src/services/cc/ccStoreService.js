// ccStoreService.js — buying from the CC store. The catalog is src/config/store/ccStoreItems.js.
// Used by the `store` command (src/commands/Games/store.js) and the store room panel
// (src/services/cc/storeChannel.js). While the store is in trial mode a purchase is only a preview:
// the balance is checked but no CC is taken and nothing is given.
// Custom roles (type 'custom_role') are bought through a form instead: customRoleService.js.

import { ccStoreItems, ccStoreSettings, luckBoxPrizes } from '../../config/store/ccStoreItems.js';
import { getProfile, updateCCState } from './ccService.js';
import { logger } from '../../utils/logger.js';
import { normalizeName } from '../../config/store/bourse.js';
import { addXpBoost, BOOST_SOURCES } from '../leveling/xpBoostService.js';
import { forecastMarket } from './bourseService.js';
import { getTraderRole } from './traderRoleService.js';

const ITEM_TYPES = new Set(['role', 'item', 'luckbox', 'boost', 'forecast', 'custom_role']);
// Bought one at a time.
const SINGLE_TYPES = new Set(['role', 'forecast', 'custom_role', 'luckbox']);

/** Returns the problems with a catalog item (empty when it is valid). */
export function validateStoreItem(item) {
    const problems = [];
    if (!item || typeof item !== 'object') return ['item is not an object'];
    if (typeof item.id !== 'string' || !/^[a-z0-9_-]{1,40}$/u.test(item.id)) problems.push('id must be lowercase letters, numbers, _ or -');
    if (typeof item.name !== 'string' || !item.name.trim()) problems.push('name is required');
    if (!Number.isSafeInteger(item.price) || item.price <= 0) problems.push('price must be a positive whole number');
    if (!ITEM_TYPES.has(item.type)) problems.push(`type must be one of ${[...ITEM_TYPES].join(', ')}`);
    if (item.type === 'role' && !/^\d{17,20}$/u.test(String(item.roleId || '')) && item.roleKey !== 'trader') problems.push('roleId (or roleKey: trader) is required for role items');
    if (item.type === 'boost' && (!Array.isArray(item.sources) || !item.sources.length || !item.sources.every((source) => BOOST_SOURCES.includes(source)))) problems.push(`sources must be some of ${BOOST_SOURCES.join(', ')}`);
    if (item.type === 'boost' && (!Number.isSafeInteger(item.minutes) || item.minutes <= 0)) problems.push('minutes must be a positive whole number');
    if (item.type === 'custom_role' && !['personal', 'friends'].includes(item.kind)) problems.push('kind must be personal or friends');
    if (item.maxOwned !== undefined && (!Number.isSafeInteger(item.maxOwned) || item.maxOwned <= 0)) problems.push('maxOwned must be a positive whole number');
    return problems;
}

export function listStoreItems(items = ccStoreItems) {
    return items.filter((item) => {
        const problems = validateStoreItem(item);
        if (problems.length) logger.warn(`[CC_STORE] Skipping item ${item?.id}: ${problems.join('; ')}`);
        return problems.length === 0;
    });
}

/** 'open' (real buying), 'trial' (demo items, preview only) or 'closed'. */
export function storeMode(settings = ccStoreSettings) {
    if (settings.open) return 'open';
    return settings.trial ? 'trial' : 'closed';
}

/** The items the store shows right now: the catalog (open or trial), or none when it is closed. */
export function storeCatalog(settings = ccStoreSettings, { items = ccStoreItems } = {}) {
    return storeMode(settings) === 'closed' ? [] : listStoreItems(items);
}

/** How many of `item` can be bought at once. */
export function maxQuantityOf(item, settings = ccStoreSettings) {
    return SINGLE_TYPES.has(item.type) ? 1 : settings.maxQuantity;
}

/** Draws a luck box prize by weight: `{ cc }` or `{ boost }` (see luckBoxPrizes). */
export function drawLuckBoxPrize(prizes = luckBoxPrizes, rng = Math.random) {
    const total = prizes.reduce((sum, prize) => sum + prize.weight, 0);
    let pick = rng() * total;
    for (const prize of prizes) {
        pick -= prize.weight;
        if (pick < 0) return prize;
    }
    return prizes[prizes.length - 1];
}

/** The role a 'role' item gives: its `roleId`, or the trader role for `roleKey: 'trader'`. */
async function itemRoleId(client, guild, item) {
    if (item.roleId) return item.roleId;
    return item.roleKey === 'trader' ? (await getTraderRole(client, guild).catch(() => null))?.id || null : null;
}

export function getStoreItem(itemId, items = ccStoreItems) {
    return listStoreItems(items).find((item) => item.id === String(itemId || '').toLowerCase()) || null;
}

/** Finds an item by its id or by its number in the list (`1` is the first item). */
/** Finds an item by its number (`1` is the first), its id or its name (`رتبة vip`, `vip`). */
export function findStoreItem(query, items) {
    const text = String(query || '').trim().toLowerCase();
    if (/^\d{1,3}$/u.test(text)) return items[Number(text) - 1] || null;
    const byId = items.find((item) => item.id === text);
    if (byId || !text) return byId || null;
    const name = normalizeName(text);
    const exact = items.find((item) => normalizeName(item.name) === name);
    if (exact) return exact;
    // Part of a name only counts when it points to a single item.
    const partial = items.filter((item) => normalizeName(item.name).includes(name));
    return partial.length === 1 ? partial[0] : null;
}

/**
 * Buys `quantity` of an item for `member`. Returns `{ ok: true, item, quantity, cost, balance, ... }` or
 * `{ ok: false, reason }` with reason one of: closed, not_found, bad_quantity, owned, max_owned, no_cc,
 * role_failed, role_missing, use_form (custom roles are bought through their form).
 * A luck box adds `prize` (and `boostUntil` for a boost prize), a boost `boostUntil`, a forecast `forecast`.
 */
export async function buyItem(client, member, itemId, quantity = 1, { items = ccStoreItems, settings = ccStoreSettings, rng = Math.random } = {}) {
    const mode = storeMode(settings);
    if (mode === 'closed') return { ok: false, reason: 'closed' };
    const item = getStoreItem(itemId, items);
    if (!item) return { ok: false, reason: 'not_found' };
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxQuantityOf(item, settings)) return { ok: false, reason: 'bad_quantity' };
    if (mode === 'trial') return previewPurchase(client, member, item, quantity);
    if (item.type === 'custom_role') return { ok: false, reason: 'use_form' };

    const guildId = member.guild.id;
    let roleId = null;
    if (item.type === 'role') {
        roleId = await itemRoleId(client, member.guild, item);
        if (!roleId) return { ok: false, reason: 'role_missing' };
        if (member.roles.cache.has(roleId)) return { ok: false, reason: 'owned' };
    }

    const cost = item.price * quantity;
    const prize = item.type === 'luckbox' ? drawLuckBoxPrize(luckBoxPrizes, rng) : null;
    const result = await updateCCState(client, guildId, member.id, (state) => {
        const owned = state.inventory[item.id] || 0;
        if (item.maxOwned && owned + quantity > item.maxOwned) return { ok: false, reason: 'max_owned', skipSave: true };
        if (state.cc < cost) return { ok: false, reason: 'no_cc', skipSave: true, balance: state.cc };
        state.cc -= cost;
        state.stats.spent += cost;
        if (item.type === 'item') state.inventory[item.id] = owned + quantity;
        if (prize?.cc) {
            state.cc += prize.cc;
            state.stats.earned += prize.cc;
        }
        return { ok: true };
    });
    if (!result.ok) return result;

    const refund = async (reason) => {
        await updateCCState(client, guildId, member.id, (state) => {
            state.cc += cost - (prize?.cc || 0);
            state.stats.spent -= cost;
            state.stats.earned -= prize?.cc || 0;
        }).catch((error) => logger.error(`[CC_STORE] Failed to refund ${member.id}`, error));
        return { ok: false, reason };
    };

    const extra = {};
    try {
        if (item.type === 'role') await member.roles.add(roleId, `CC store: ${item.name}`);
        if (item.type === 'boost') extra.boostUntil = await addXpBoost(client, guildId, member.id, item.sources, item.minutes * quantity);
        if (item.type === 'forecast') extra.forecast = await forecastMarket(client, guildId);
        if (prize) {
            extra.prize = prize;
            const boostItem = prize.boost && getStoreItem(prize.boost, items);
            if (boostItem) extra.boostUntil = await addXpBoost(client, guildId, member.id, boostItem.sources, boostItem.minutes);
        }
    } catch (error) {
        logger.error(`[CC_STORE] Could not deliver ${item.id} to ${member.id}, refunding`, error);
        return refund(item.type === 'role' ? 'role_failed' : 'deliver_failed');
    }

    logger.info('[CC_STORE] Purchase', { guildId, userId: member.id, itemId: item.id, quantity, cost, prize: prize ? JSON.stringify(prize) : undefined });
    const balance = result.balance;
    return { ok: true, item, quantity, cost, balance, ...extra };
}

/** Trial mode: the same checks as buyItem, but nothing is saved. Returns buyItem's result with `trial: true`. */
async function previewPurchase(client, member, item, quantity) {
    const { cc } = await getProfile(client, member.guild.id, member.id);
    const cost = item.price * quantity;
    if (cc < cost) return { ok: false, reason: 'no_cc', balance: cc, trial: true };
    return { ok: true, trial: true, item, quantity, cost, balance: cc };
}
