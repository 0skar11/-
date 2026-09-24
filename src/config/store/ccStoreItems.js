// ccStoreItems.js — the CC store catalog. The store isn't open yet: add items here and build the
// store command on top of src/services/cc/ccStoreService.js, which already handles buying.
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

export const ccStoreSettings = {
    // Flip to true once the store command exists and there are items to sell.
    open: false,
    maxQuantity: 10,
};
