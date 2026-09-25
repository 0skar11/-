// bourse.js — the CC bourse (البورصة): 8 things members buy with CC and sell back later at the
// price of the hour. Run by src/services/cc/bourseService.js, commands in src/commands/Games/bourse.js
// (`اسعار`، `استثمار 3`، `بيع 3`، `ممتلكاتي`).
//
// Prices change at the start of every hour (5:00, 6:00, 7:00...). Each hour an asset moves up or down
// by a random amount of at most `volatility` (0.05 = 5%), and never leaves [min, max]. Near a limit
// the move leans back towards the middle so the price doesn't stick to it, and a price never lands
// on a limit itself, so prices always look random (1,325, not 2,000).
//
// Demand: every member who bought an asset during the hour (more than they sold) pushes its next
// move up by `demand.perBuyerPercent`, every net seller pushes it down, together at most
// `demand.maxPercent`. Buying also lifts the asset's ceiling above `max` (by the same percent, up to
// `demand.maxRaisePercent`); an hour with no buying demand lowers it again by
// `demand.raiseDecayPercent`, so the price comes back to its normal range by itself.
//
// Asset fields: id (lowercase, stays the same forever: it is the key in members' holdings), name,
// emoji, min, max, start (the first price is random around it), volatility.

export const bourseAssets = [
    { id: 'motorcycle', name: 'موتوسيكل', emoji: '🏍️', min: 200, max: 600, start: 400, volatility: 0.08 },
    { id: 'gold', name: 'سبيكة دهب', emoji: '🥇', min: 300, max: 900, start: 600, volatility: 0.03 },
    { id: 'car', name: 'عربية', emoji: '🚗', min: 800, max: 2000, start: 1300, volatility: 0.05 },
    { id: 'apartment', name: 'شقة', emoji: '🏠', min: 1500, max: 3500, start: 2400, volatility: 0.03 },
    { id: 'shop', name: 'محل تجاري', emoji: '🏪', min: 2500, max: 5500, start: 4000, volatility: 0.05 },
    { id: 'building', name: 'عقار (عمارة)', emoji: '🏢', min: 4000, max: 9000, start: 6000, volatility: 0.03 },
    { id: 'ship', name: 'سفينة', emoji: '🚢', min: 6000, max: 13000, start: 9000, volatility: 0.08 },
    { id: 'plane', name: 'طيارة', emoji: '✈️', min: 8000, max: 18000, start: 12000, volatility: 0.1 },
];

export const bourseSettings = {
    // Taken from what a member gets when selling (rounded up, at least 1 CC).
    sellFeePercent: 1.5,
    // Most pieces of one asset a member can own.
    maxOwnedPerAsset: 10,
    demand: {
        perBuyerPercent: 1,
        maxPercent: 15,
        maxRaisePercent: 50,
        raiseDecayPercent: 5,
    },
    // After the bot was off, at most this many missed hours are replayed.
    maxCatchUpHours: 168,
};
