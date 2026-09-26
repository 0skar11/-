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

    test('random prices stay between min and max without demand', () => {
        const rng = seeded(7);
        for (const asset of bourseAssets) {
            let entry = normalizeMarket(null, { rng }).assets[asset.id];
            for (let hour = 0; hour < 2000; hour += 1) {
                entry = tickAsset(asset, entry, { rng });
                assert.ok(entry.price > asset.min && entry.price < asset.max, `${asset.id} ${entry.price}`);
            }
        }
    });

    test('each hour the price is fully random between min and max, whatever it was (report #130)', () => {
        const car = byId('car');
        const middle = Math.round(car.min + 0.5 * (car.max - car.min));
        for (const price of [850, 1300, 1990]) {
            const entry = { price, previous: price, raise: 0, flow: {} };
            assert.equal(tickAsset(car, entry, { rng: () => 0.5 }).price, middle);
            assert.ok(tickAsset(car, entry, { rng: () => 0 }).price <= car.min + Math.round((car.max - car.min) * 0.02) + 1);
            assert.ok(tickAsset(car, entry, { rng: () => 0.9999 }).price >= car.max - Math.round((car.max - car.min) * 0.02) - 1);
        }
        // Over many hours the price visits the whole range, not just near the last price.
        const rng = seeded(11);
        let entry = { price: 1300, previous: 1300, raise: 0, flow: {} };
        let low = Infinity;
        let high = 0;
        for (let hour = 0; hour < 200; hour += 1) {
            entry = tickAsset(car, entry, { rng });
            low = Math.min(low, entry.price);
            high = Math.max(high, entry.price);
        }
        assert.ok(low < car.min + 150 && high > car.max - 150, `${low} ${high}`);
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

    test('selling pressure pushes the price down', () => {
        const car = byId('car');
        const entry = { price: 1300, previous: 1300, raise: 0, flow: { a: -1, b: -1, c: -1 } };
        assert.equal(tickAsset(car, entry, { rng: () => 0.5 }).price, Math.round(car.min + 0.47 * (car.max - car.min)));
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
        // A middle random draw, nudged up by the 2 buyers (1% of the range each), whose buying also
        // lifted the ceiling by 2%.
        const carAsset = byId('car');
        assert.equal(car.price, Math.round(carAsset.min + 0.52 * (assetCeiling(carAsset, 2) - carAsset.min)));
        assert.ok(car.changePercent > 0);
        const gold = quotes.find((entry) => entry.asset.id === 'gold');
        const goldAsset = byId('gold');
        assert.equal(gold.price, Math.round(goldAsset.min + 0.5 * (goldAsset.max - goldAsset.min)));

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
