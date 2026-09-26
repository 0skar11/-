import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bourseAssets, bourseSettings } from '../src/config/store/bourse.js';
import {
    HOUR_MS, hourOf, nextChangeAt, assetCeiling, keepInside, normalizeMarket, demandMove, tickAsset, advanceMarket,
    findAsset, sellFee, getMarket, invest, sell, getHoldings,
} from '../src/services/cc/bourseService.js';
import { adjustCC, getProfile } from '../src/services/cc/ccService.js';
import { changeArrow, pricesEmbed } from '../src/services/cc/bourseUi.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';

const GUILD = '100000000000000009';
const A = '200000000000000001';
const B = '200000000000000002';
const NOW = Date.UTC(2026, 8, 25, 17, 20);

function fakeClient() {
    const store = new Map();
    return {
        store,
        db: {
            get: async (key, fallback = null) => (store.has(key) ? structuredClone(store.get(key)) : fallback),
            set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
            list: async (prefix) => [...store.keys()].filter((key) => key.startsWith(prefix)),
        },
    };
}

/** A repeatable random number generator. */
function seeded(seed = 1) {
    let value = seed;
    return () => {
        value = (value * 1664525 + 1013904223) % 4294967296;
        return value / 4294967296;
    };
}

const byId = (id) => bourseAssets.find((asset) => asset.id === id);

describe('bourse config', () => {
    test('has at most 8 valid assets', () => {
        assert.ok(bourseAssets.length <= 8);
        assert.equal(new Set(bourseAssets.map((asset) => asset.id)).size, bourseAssets.length);
        for (const asset of bourseAssets) {
            assert.ok(asset.min > 0 && asset.min < asset.start && asset.start < asset.max, asset.id);
            assert.ok(asset.volatility > 0 && asset.volatility < 0.5, asset.id);
        }
    });
});

describe('bourse prices', () => {
    test('change at the start of each hour', () => {
        assert.equal(hourOf(NOW), hourOf(Date.UTC(2026, 8, 25, 17, 0)));
        assert.equal(nextChangeAt(NOW), Date.UTC(2026, 8, 25, 18, 0));
    });

    test('a new market starts at random prices around the start prices', () => {
        const market = normalizeMarket(null, { hour: 10, rng: seeded(5) });
        assert.equal(market.hour, 10);
        for (const asset of bourseAssets) {
            const { price } = market.assets[asset.id];
            assert.ok(Math.abs(price - asset.start) <= Math.ceil(asset.start * asset.volatility), asset.id);
        }
        assert.ok(bourseAssets.some((asset) => market.assets[asset.id].price !== asset.start));
        // A middle draw is the start price itself.
        assert.equal(normalizeMarket(null, { rng: () => 0.5 }).assets.car.price, 1300);
    });

    test('prices never land on a round limit', () => {
        assert.equal(keepInside(1500, 800, 2000), 1500);
        const top = keepInside(2400, 800, 2000, () => 0.99);
        assert.ok(top < 2000 && top >= 2000 - 1 - 24, String(top));
        const bottom = keepInside(700, 800, 2000, () => 0);
        assert.equal(bottom, 801);
        const rng = seeded(9);
        for (const asset of bourseAssets) {
            let entry = normalizeMarket(null, { rng }).assets[asset.id];
            for (let hour = 0; hour < 500; hour += 1) {
                entry = tickAsset(asset, entry, { rng });
                assert.ok(entry.price !== asset.min && entry.price !== asset.max, `${asset.id} ${entry.price}`);
            }
        }
    });

    test('random moves stay between min and max and never move more than 10% an hour', () => {
        const rng = seeded(7);
        for (const asset of bourseAssets) {
            let entry = normalizeMarket(null, { rng }).assets[asset.id];
            for (let hour = 0; hour < 2000; hour += 1) {
                const next = tickAsset(asset, entry, { rng });
                assert.ok(next.price > asset.min && next.price < asset.max, `${asset.id} ${next.price}`);
                assert.ok(Math.abs(next.price - entry.price) <= Math.ceil(entry.price * 0.1) + 1, `${asset.id} ${entry.price} -> ${next.price}`);
                entry = next;
            }
        }
    });

    test('an hour moves by at most 10%, whatever the demand (the owner\'s rule)', () => {
        assert.equal(bourseSettings.maxMovePercent, 10);
        const car = byId('car');
        const entry = { price: 1300, previous: 1300, raise: 0, flow: {} };
        assert.equal(tickAsset(car, entry, { rng: () => 1 }).price, Math.round(1300 * 1.1));
        assert.equal(tickAsset(car, entry, { rng: () => 0 }).price, Math.round(1300 * 0.9));
        const rush = { ...entry, flow: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`u${i}`, 1])) };
        assert.equal(tickAsset(car, rush, { rng: () => 1 }).price, Math.round(1300 * 1.1));
        // At the top the move leans down, at the bottom up.
        assert.ok(tickAsset(car, { ...entry, price: 1990 }, { rng: () => 0.5 }).price < 1990);
        assert.ok(tickAsset(car, { ...entry, price: 810 }, { rng: () => 0.5 }).price > 810);
    });

    test('demand pushes the price up and lifts the ceiling, which comes back down after', () => {
        const car = byId('car');
        const flow = { a: 2, b: 1, c: 5, d: -1 };
        assert.equal(demandMove(flow), (3 - 1) * bourseSettings.demand.perBuyerPercent / 100);
        assert.equal(demandMove({}), 0);

        let entry = { price: 2000, previous: 2000, raise: 0, flow: { a: 1, b: 1, c: 1, d: 1, e: 1 } };
        entry = tickAsset(car, entry, { rng: () => 1 });
        assert.equal(entry.raise, 5);
        assert.ok(entry.price > car.max && entry.price <= assetCeiling(car, 5));
        assert.deepEqual(entry.flow, {});

        for (let hour = 0; hour < 10; hour += 1) entry = tickAsset(car, entry, { rng: () => 1 });
        assert.equal(entry.raise, 0);
        assert.ok(entry.price <= car.max);
    });

    test('20+ pieces bought in the hour: the price is sure to rise, by the number of pieces', () => {
        const car = byId('car');
        const bought = (pieces) => ({ price: 1300, previous: 1300, raise: 0, flow: { a: pieces - 5, b: 5 } });
        // Below 20 pieces, a low random draw can still bring the price down.
        assert.ok(tickAsset(car, bought(19), { rng: () => 0 }).price < 1300);
        // 20 pieces: +5% whatever the random draw; 30: +7.5%; 40 or more: +10% (the hourly cap).
        for (const rng of [() => 0, () => 0.5, () => 0.99]) {
            assert.equal(tickAsset(car, bought(20), { rng }).price, Math.round(1300 * 1.05));
        }
        assert.equal(tickAsset(car, bought(30), { rng: () => 0 }).price, Math.round(1300 * 1.075));
        assert.equal(tickAsset(car, bought(80), { rng: () => 0 }).price, Math.round(1300 * 1.1));
        // Sales count against the purchases.
        assert.ok(tickAsset(car, { ...bought(20), flow: { a: 25, b: -6 } }, { rng: () => 0 }).price < 1300);
        // Near the top the ceiling rises with it, so the sure rise isn't cut off.
        const top = tickAsset(car, { ...bought(20), price: 1990 }, { rng: () => 0 });
        assert.ok(top.price > 1990 && top.raise > 0, `${top.price}`);
    });

    test('selling pressure pushes the price down', () => {
        const car = byId('car');
        const entry = { price: 1300, previous: 1300, raise: 0, flow: { a: -1, b: -1, c: -1 } };
        assert.equal(tickAsset(car, entry, { rng: () => 0.5 }).price, Math.round(1300 * 0.97));
    });

    test('missed hours are played when the market is read later, up to the cap', () => {
        const market = normalizeMarket(null, { hour: 100 });
        assert.equal(advanceMarket(market, 100), false);
        assert.equal(advanceMarket(market, 103, { rng: seeded(3) }), true);
        assert.equal(market.hour, 103);
        let calls = 0;
        advanceMarket(market, 103 + 10_000, { rng: () => { calls += 1; return 0.5; } });
        assert.equal(calls, bourseSettings.maxCatchUpHours * bourseAssets.length);
    });
});

describe('bourse trading', () => {
    test('finds assets by number or name', () => {
        assert.equal(findAsset('1'), bourseAssets[0]);
        assert.equal(findAsset('9'), null);
        assert.equal(findAsset('عربيه').id, 'car');
        assert.equal(findAsset('العربية').id, 'car');
        assert.equal(findAsset('طياره').id, 'plane');
        assert.equal(findAsset('عقار').id, 'building');
        assert.equal(findAsset('plane').id, 'plane');
        assert.equal(findAsset('حاجة'), null);
    });

    test('the sell fee is 1.5%, rounded up', () => {
        assert.equal(bourseSettings.sellFeePercent, 1.5);
        assert.equal(sellFee(1000), 15);
        assert.equal(sellFee(1001), 16);
        assert.equal(sellFee(10), 1);
        assert.equal(sellFee(0), 0);
    });

    test('buys and sells at the price of the hour', async () => {
        const client = fakeClient();
        const options = { now: NOW, rng: seeded(11) };
        await adjustCC(client, GUILD, A, 5000, 'staff');

        const { quotes } = await getMarket(client, GUILD, options);
        const car = quotes.find((entry) => entry.asset.id === 'car');
        assert.ok(car.price > byId('car').min && car.price < byId('car').max);

        assert.equal((await invest(client, GUILD, A, 'nothing', 1, options)).reason, 'not_found');
        assert.equal((await invest(client, GUILD, A, 'car', 0, options)).reason, 'bad_quantity');
        assert.equal((await invest(client, GUILD, A, 'car', 11, options)).reason, 'bad_quantity');
        assert.equal((await invest(client, GUILD, A, 'car', 1, { ...options, expectedPrice: 1 })).reason, 'price_changed');
        assert.equal((await invest(client, GUILD, A, 'plane', 1, options)).reason, 'no_cc');

        const bought = await invest(client, GUILD, A, '3', 2, { ...options, expectedPrice: car.price });
        assert.deepEqual([bought.ok, bought.cost, bought.owned, bought.before, bought.balance], [true, car.price * 2, 2, 5000, 5000 - car.price * 2]);
        assert.equal((await getProfile(client, GUILD, A)).cc, 5000 - car.price * 2);

        // The purchase counts as demand for the next hour.
        const saved = client.store.get(`guild:${GUILD}:bourse`);
        assert.equal(saved.assets.car.flow[A], 2);

        assert.equal((await sell(client, GUILD, A, 'car', 3, options)).reason, 'not_owned');
        assert.equal((await sell(client, GUILD, B, 'car', 1, options)).reason, 'not_owned');
        const sold = await sell(client, GUILD, A, 'car', 1, options);
        const fee = sellFee(car.price);
        assert.deepEqual([sold.ok, sold.fee, sold.received, sold.paid, sold.profit, sold.owned], [true, fee, car.price - fee, car.price, -fee, 1]);
        assert.equal((await getProfile(client, GUILD, A)).cc, 5000 - car.price - fee);
        assert.deepEqual([sold.before, sold.balance], [5000 - car.price * 2, 5000 - car.price - fee]);
        assert.equal(client.store.get(`guild:${GUILD}:bourse`).assets.car.flow[A], 1);

        const holdings = await getHoldings(client, GUILD, A, options);
        assert.equal(holdings.rows.length, 1);
        assert.deepEqual([holdings.rows[0].qty, holdings.rows[0].paid, holdings.rows[0].value], [1, car.price, car.price]);
    });

    test('a new hour changes the prices and the demand of the last hour counts', async () => {
        const client = fakeClient();
        await adjustCC(client, GUILD, A, 100_000, 'staff');
        await adjustCC(client, GUILD, B, 100_000, 'staff');
        const hold = { now: NOW, rng: () => 0.5 };
        await invest(client, GUILD, A, 'car', 1, hold);
        await invest(client, GUILD, B, 'car', 1, hold);

        const later = { now: NOW + HOUR_MS, rng: () => 0.5 };
        const { quotes } = await getMarket(client, GUILD, later);
        const car = quotes.find((entry) => entry.asset.id === 'car');
        // A middle random draw: only the 2 buyers moved it (1% each).
        assert.equal(car.price, Math.round(byId('car').start * 1.02));
        assert.equal(car.changePercent, 2);
        const gold = quotes.find((entry) => entry.asset.id === 'gold');
        assert.equal(gold.price, byId('gold').start);

        // Buying a piece they already had at the old price: the old price is refused.
        assert.equal((await invest(client, GUILD, A, 'car', 1, { ...later, expectedPrice: byId('car').start })).reason, 'price_changed');
    });

    test('never owns more than 10 of one asset', async () => {
        const client = fakeClient();
        const options = { now: NOW, rng: () => 0.5 };
        await adjustCC(client, GUILD, A, 100_000, 'staff');
        assert.equal((await invest(client, GUILD, A, 'motorcycle', 10, options)).ok, true);
        const refused = await invest(client, GUILD, A, 'motorcycle', 1, options);
        assert.deepEqual([refused.reason, refused.owned], ['max_owned', 10]);
    });
});

describe('bourse messages', () => {
    test('show the move with an arrow', () => {
        assert.equal(changeArrow(6.1), '🟢 ▲ 6.1%');
        assert.equal(changeArrow(-1.2), '🔴 ▼ 1.2%');
        assert.equal(changeArrow(0), '');
    });

    test('the prices embed lists every asset', async () => {
        const market = await getMarket(fakeClient(), GUILD, { now: NOW });
        const embed = pricesEmbed(market);
        for (const asset of bourseAssets) assert.ok(embed.fields.some((field) => field.name.includes(asset.name) && field.inline), asset.id);
        assert.ok(embed.fields.length <= 25);
        assert.ok(embed.footer.text.includes('1.5%'));
    });
});

describe('bourse balance', () => {
    test('buying takes exactly the price from the balance', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD}:economy:${A}`, { wallet: 999, bank: 5, cc: 710 });
        const result = await invest(client, GUILD, A, 'gold', 1, { now: NOW, rng: () => 0.5 });
        assert.deepEqual([result.price, result.before, result.balance], [600, 710, 110]);
        assert.equal((await getProfile(client, GUILD, A)).cc, 110);
    });
});

describe('bourse words', () => {
    test('run with an asset name without the prefix, but not in a normal sentence', () => {
        assert.deepEqual(applyWordAliases('استثمار', ['عربية'], false), { commandName: 'bourse', args: ['invest', 'عربية'] });
        assert.deepEqual(applyWordAliases('بيع', ['سبيكة', 'دهب', '2'], false), { commandName: 'bourse', args: ['sell', 'سبيكة', 'دهب', '2'] });
        assert.deepEqual(applyWordAliases('بيع', ['3'], false), { commandName: 'bourse', args: ['sell', '3'] });
        assert.equal(applyWordAliases('بيع', ['العربية', 'دي'], false), null);
        assert.equal(applyWordAliases('استثمار', ['في', 'الدهب', 'حلو'], false), null);
        assert.equal(applyWordAliases('اسعار', ['الدهب'], false), null);
    });
});
