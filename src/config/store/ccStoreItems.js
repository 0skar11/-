// ccStoreItems.js — the CC store catalog and the store room.
// The store room (a channel in STORE_CATEGORY_ID) is run by src/services/cc/storeChannel.js and the
// commands by src/commands/Games/store.js; buying is src/services/cc/ccStoreService.js.
//
// Item fields:
//   id           unique, lowercase, no spaces (used in commands and in the member's inventory)
//   name         shown in the store
//   emoji        optional
//   description  shown in the store
//   price        CC, a positive whole number
//   type         'role'  gives `roleId` to the buyer (bought once)
//                'item'  goes to the member's inventory (`ccInventory`), can stack up to `maxOwned`
//   roleId       for type 'role'
//   maxOwned     for type 'item', optional (default: no limit)
//
// Example:
//   { id: 'vip', name: 'رتبة VIP', emoji: '💎', description: 'رتبة مميزة بلون خاص', price: 2000, type: 'role', roleId: '123456789012345678' },
//   { id: 'name_color', name: 'تغيير لون الاسم', emoji: '🎨', description: 'مرة واحدة', price: 500, type: 'item', maxOwned: 5 },

export const ccStoreItems = [];

// Shown while the store is in trial mode: they only show what the store will look like. Buying one
// checks the balance and shows the receipt, but takes no CC and gives nothing.
export const ccStoreDemoItems = [
    { id: 'demo_vip', name: 'رتبة VIP', emoji: '💎', description: 'رتبة مميزة بلون خاص فوق الأعضاء', price: 5000, type: 'item', maxOwned: 1 },
    { id: 'demo_color', name: 'لون مميز للاسم', emoji: '🎨', description: 'تختار لون اسمك في السيرفر', price: 1500, type: 'item', maxOwned: 1 },
    { id: 'demo_xp_boost', name: 'بوست XP ×2', emoji: '⚡', description: 'ضعف الـ XP لمدة ساعة', price: 800, type: 'item', maxOwned: 5 },
    { id: 'demo_box', name: 'صندوق حظ', emoji: '🎁', description: 'جواه CC أو XP بشكل عشوائي', price: 300, type: 'item', maxOwned: 10 },
];

export const ccStoreSettings = {
    // Real buying (takes CC, gives the item). Flip to true once ccStoreItems has the real items.
    open: false,
    // Trial mode (while `open` is false): the store shows ccStoreDemoItems and buying is only a preview.
    trial: true,
    maxQuantity: 10,
};

// The store room: the bot creates a text channel in this category (and reuses it after restarts).
// Only store commands can be written there, and the store panel is sent again (and pinned) every
// `repostEvery` messages so it is always near the bottom.
export const STORE_CATEGORY_ID = '1547310323994853438';
export const STORE_CHANNEL_NAME = '🛒・المتجر';
export const storeRoomSettings = {
    repostEvery: 5,
    // Seconds between two messages of the same member in the store room.
    slowmodeSeconds: 3,
};
