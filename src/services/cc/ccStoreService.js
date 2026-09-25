// ccStoreService.js — buying from the CC store. The catalog is src/config/store/ccStoreItems.js.
// Used by the `store` command (src/commands/Games/store.js) and the store room panel
// (src/services/cc/storeChannel.js). While the store is in trial mode the demo items are shown and a
// purchase is only a preview: the balance is checked but no CC is taken and nothing is given.

import { ccStoreItems, ccStoreDemoItems, ccStoreSettings } from '../../config/store/ccStoreItems.js';
import { getProfile, updateCCState } from './ccService.js';
import { logger } from '../../utils/logger.js';

const ITEM_TYPES = new Set(['role', 'item']);

/** Returns the problems with a catalog item (empty when it is valid). */
export function validateStoreItem(item) {
    const problems = [];
    if (!item || typeof item !== 'object') return ['item is not an object'];
    if (typeof item.id !== 'string' || !/^[a-z0-9_-]{1,40}$/u.test(item.id)) problems.push('id must be lowercase letters, numbers, _ or -');
    if (typeof item.name !== 'string' || !item.name.trim()) problems.push('name is required');
    if (!Number.isSafeInteger(item.price) || item.price <= 0) problems.push('price must be a positive whole number');
    if (!ITEM_TYPES.has(item.type)) problems.push(`type must be one of ${[...ITEM_TYPES].join(', ')}`);
    if (item.type === 'role' && !/^\d{17,20}$/u.test(String(item.roleId || ''))) problems.push('roleId is required for role items');
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

/** The items the store shows right now: the real catalog, the demo items in trial mode, or none. */
export function storeCatalog(settings = ccStoreSettings, { items = ccStoreItems, demoItems = ccStoreDemoItems } = {}) {
    const mode = storeMode(settings);
    if (mode === 'open') return listStoreItems(items);
    return mode === 'trial' ? listStoreItems(demoItems) : [];
}

export function getStoreItem(itemId, items = ccStoreItems) {
    return listStoreItems(items).find((item) => item.id === String(itemId || '').toLowerCase()) || null;
}

/** Finds an item by its id or by its number in the list (`1` is the first item). */
export function findStoreItem(query, items) {
    const text = String(query || '').trim().toLowerCase();
    if (/^\d{1,3}$/u.test(text)) return items[Number(text) - 1] || null;
    return items.find((item) => item.id === text) || null;
}

/**
 * Buys `quantity` of an item for `member`. Returns `{ ok: true, item, quantity, cost, balance }` or
 * `{ ok: false, reason }` with reason one of: closed, not_found, bad_quantity, owned, max_owned, no_cc, role_failed.
 */
export async function buyItem(client, member, itemId, quantity = 1, { items = ccStoreItems, demoItems = ccStoreDemoItems, settings = ccStoreSettings } = {}) {
    const mode = storeMode(settings);
    if (mode === 'closed') return { ok: false, reason: 'closed' };
    if (mode === 'trial') return previewPurchase(client, member, itemId, quantity, { items: demoItems, settings });
    const item = getStoreItem(itemId, items);
    if (!item) return { ok: false, reason: 'not_found' };
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > settings.maxQuantity || (item.type === 'role' && quantity !== 1)) {
        return { ok: false, reason: 'bad_quantity' };
    }
    if (item.type === 'role' && member.roles.cache.has(item.roleId)) return { ok: false, reason: 'owned' };

    const guildId = member.guild.id;
    const cost = item.price * quantity;
    const result = await updateCCState(client, guildId, member.id, (state) => {
        const owned = state.inventory[item.id] || 0;
        if (item.maxOwned && owned + quantity > item.maxOwned) return { ok: false, reason: 'max_owned', skipSave: true };
        if (state.cc < cost) return { ok: false, reason: 'no_cc', skipSave: true, balance: state.cc };
        state.cc -= cost;
        state.stats.spent += cost;
        if (item.type === 'item') state.inventory[item.id] = owned + quantity;
        return { ok: true };
    });
    if (!result.ok) return result;

    if (item.type === 'role') {
        try {
            await member.roles.add(item.roleId, `CC store: ${item.name}`);
        } catch (error) {
            logger.error(`[CC_STORE] Could not give role ${item.roleId} to ${member.id}, refunding`, error);
            await updateCCState(client, guildId, member.id, (state) => {
                state.cc += cost;
                state.stats.spent -= cost;
            });
            return { ok: false, reason: 'role_failed' };
        }
    }

    logger.info('[CC_STORE] Purchase', { guildId, userId: member.id, itemId: item.id, quantity, cost });
    return { ok: true, item, quantity, cost, balance: result.balance };
}

/** Trial mode: the same checks as buyItem, but nothing is saved. Returns buyItem's result with `trial: true`. */
async function previewPurchase(client, member, itemId, quantity, { items, settings }) {
    const item = getStoreItem(itemId, items);
    if (!item) return { ok: false, reason: 'not_found' };
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > settings.maxQuantity || (item.type === 'role' && quantity !== 1)) {
        return { ok: false, reason: 'bad_quantity' };
    }
    const { cc } = await getProfile(client, member.guild.id, member.id);
    const cost = item.price * quantity;
    if (cc < cost) return { ok: false, reason: 'no_cc', balance: cc, trial: true };
    return { ok: true, trial: true, item, quantity, cost, balance: cc };
}
