// ccStoreService.js — buying from the CC store. The catalog is src/config/store/ccStoreItems.js.
// There is no store command yet; when it is added it only needs listStoreItems() and buyItem().

import { ccStoreItems, ccStoreSettings } from '../../config/store/ccStoreItems.js';
import { updateCCState } from './ccService.js';
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

export function getStoreItem(itemId, items = ccStoreItems) {
    return listStoreItems(items).find((item) => item.id === String(itemId || '').toLowerCase()) || null;
}

/**
 * Buys `quantity` of an item for `member`. Returns `{ ok: true, item, quantity, cost, balance }` or
 * `{ ok: false, reason }` with reason one of: closed, not_found, bad_quantity, owned, max_owned, no_cc, role_failed.
 */
export async function buyItem(client, member, itemId, quantity = 1, { items = ccStoreItems, settings = ccStoreSettings } = {}) {
    if (!settings.open) return { ok: false, reason: 'closed' };
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
