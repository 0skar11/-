// bourse.js — the CC bourse (البورصة): 8 things members buy with CC and sell back later at the
// price of the hour. Run by src/services/cc/bourseService.js, commands in src/commands/Games/bourse.js
// (`اسعار`، `استثمار 3`، `بيع 3`، `ممتلكاتي`).
//
// Prices change at the start of every hour (5:00, 6:00, 7:00...). The owner wanted big, unpredictable
// moves (report #130), so each hour the price is drawn at random anywhere between `min` and `max`,
// whatever it was the hour before: 1,300 can become 820 or 1,950 the next hour. A price never lands
// on a limit itself, so prices always look random (1,325, not 2,000).
//
// Demand: every member who bought an asset during the hour (more than they sold) nudges its next
// draw up by `demand.perBuyerPercent` of the range, every net seller nudges it down, together at most
// `demand.maxPercent`. Buying also lifts the asset's ceiling above `max` (by the same percent, up to
// `demand.maxRaisePercent`); an hour with no buying demand lowers it again by
// `demand.raiseDecayPercent`, so the price comes back to its normal range by itself.
//
// Asset fields: id (lowercase, stays the same forever: it is the key in members' holdings), name,
// emoji, min, max, start and volatility (the very first price is random around `start`, up to
// `volatility` away; after that every hour is fully random between min and max).

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

function normalizeName(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u0652\u0640]/gu, '') // tashkeel and tatweel
        .replace(/[أإآ]/gu, 'ا')
        .replace(/ة/gu, 'ه')
        .replace(/ى/gu, 'ي')
        .replace(/^ال/u, '')
        .replace(/\s+/gu, ' ');
}

/** Finds an asset by its number in the list (`1` is the first), its id or its name (`عربية`، `العربيه`). */
export function findAsset(query, assets = bourseAssets) {
    const text = String(query || '').trim();
    if (/^\d{1,2}$/u.test(text)) return assets[Number(text) - 1] || null;
    const wanted = normalizeName(text);
    if (!wanted) return null;
    return assets.find((asset) => asset.id === text.toLowerCase())
        || assets.find((asset) => normalizeName(asset.name) === wanted)
        || assets.find((asset) => normalizeName(asset.name).split(/[\s()]+/u).includes(wanted))
        || null;
}
