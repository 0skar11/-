// ccStoreItems.js — the CC store catalog and the store room.
// The store room (a channel in STORE_CATEGORY_ID) is run by src/services/cc/storeChannel.js and the
// commands by src/commands/Games/store.js; buying is src/services/cc/ccStoreService.js.
//
// Item fields:
//   id           unique, lowercase, no spaces (used in commands and in the member's inventory)
//   name         shown in the store
//   emoji        optional
//   description  shown in the store
//   price        CC, a positive whole number (for a custom role: the price of one month)
//   type         'role'        gives a role to the buyer (bought once): `roleId`, or `roleKey: 'trader'`
//                              for the trader role the bot made (src/services/cc/traderRoleService.js)
//                'item'        goes to the member's inventory (`ccInventory`), can stack up to `maxOwned`
//                'luckbox'     opened right away: a random prize from `luckBoxPrizes` below
//                'boost'       XP ×2 for `minutes` on `sources` ('chat', 'voice'); buying more adds time
//                'forecast'    shows privately which way every bourse asset moves at the next hour
//                'custom_role' a role the buyer names (with a colour and an icon), paid every month:
//                              `kind` 'personal' (the buyer only) or 'friends' (the buyer, the leader,
//                              invites up to `maxMembers - 1` others with `رولي انفايت @member`)
//   maxOwned     for type 'item', optional (default: no limit)

export const ccStoreItems = [
    { id: 'luck_box', name: 'صندوق حظ', emoji: '🎁', description: 'جواه جايزة عشوائية: CC (لحد 7,500) أو بوست XP', price: 1500, type: 'luckbox' },
    { id: 'xp_boost', name: 'بوست XP ×2', emoji: '⚡', description: 'ضعف XP الشات لمدة ساعة', price: 1000, type: 'boost', sources: ['chat'], minutes: 60 },
    { id: 'custom_role', name: 'رول مميزة باسمك', emoji: '🎨', description: 'رول ليك لوحدك، بتختار اسمها ولونها وأيقونتها ・ في الشهر', price: 7500, type: 'custom_role', kind: 'personal', maxMembers: 1 },
    { id: 'friends_role', name: 'رول ليك ولصحابك', emoji: '👥', description: 'رول ليك و15 من صحابك وإنت المسؤول، بتبعتلهم `رولي انفايت` ・ في الشهر', price: 25000, type: 'custom_role', kind: 'friends', maxMembers: 16 },
    { id: 'level_boost', name: 'لفل ×2', emoji: '🚀', description: 'ضعف XP الشات والفويس لمدة ساعة', price: 1500, type: 'boost', sources: ['chat', 'voice'], minutes: 60 },
    { id: 'trader_role', name: 'رول تاجر', emoji: '💼', description: 'رول التاجر، فوق رول Level 100', price: 2500, type: 'role', roleKey: 'trader' },
    { id: 'bourse_forecast', name: 'تنبؤ البورصة', emoji: '🔮', description: 'تعرف كل أصل في البورصة هيطلع ولا هينزل الساعة الجاية', price: 6500, type: 'forecast' },
];

// The luck box: one prize is drawn by `weight` (the chance is weight / total). On average it gives back
// a little less than its price (about 1,235 CC, plus an XP boost 11% of the time, for 1,500), so buying
// boxes doesn't create CC.
// A prize is `{ cc }` or `{ boost: <id of a 'boost' item> }`.
export const luckBoxPrizes = [
    { cc: 500, weight: 25 },
    { cc: 1000, weight: 25 },
    { cc: 1500, weight: 20 },
    { cc: 2000, weight: 10 },
    { cc: 3000, weight: 7 },
    { cc: 7500, weight: 2 },
    { boost: 'xp_boost', weight: 11 },
];

// Custom roles (type 'custom_role'): paid every `days` days from the leader's CC. When the leader can't
// pay, the role stays `graceDays` more days; then the bot deletes it. `رولي الغي` stops the renewal and
// the role goes at the end of the paid month. The bot creates these roles (and only these) with no
// permissions, just above the trader role, and deletes them when they end.
export const customRoleSettings = {
    days: 30,
    graceDays: 3,
    // A DM to the leader this many days before the renewal.
    remindDaysBefore: 3,
    // How long an invite (`رولي انفايت`) can be accepted.
    inviteHours: 24,
    maxNameLength: 32,
    // Names that look like staff roles are refused (lowercase, compared inside the name).
    blockedNameWords: ['admin', 'mod', 'owner', 'staff', 'manager', 'support', 'helper', 'dev', 'bot',
        'ادمن', 'أدمن', 'اداره', 'إدارة', 'ادارة', 'مشرف', 'مالك', 'اونر', 'أونر', 'ستاف', 'مدير', 'سبورت', 'هيلبر', 'بوت'],
    checkEveryMinutes: 30,
};

// The trader role (item `trader_role`). The owner asked the bot to make it once, just above the
// Level 100 role (src/services/cc/traderRoleService.js); if it is deleted later it is not made again.
export const traderRoleSettings = {
    name: '💼 تاجر',
    color: '#c9a227',
    aboveLevel: 100,
};

export const ccStoreSettings = {
    // Real buying (takes CC, gives the item). Flip to true to open the store.
    open: false,
    // Trial mode (while `open` is false): the store shows its items, but buying one only checks the
    // balance and shows the receipt: no CC is taken and nothing is given.
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
