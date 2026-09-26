import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ccStoreItems, luckBoxPrizes, traderRoleSettings, customRoleSettings } from '../src/config/store/ccStoreItems.js';
import { bourseAssets } from '../src/config/store/bourse.js';
import { buyItem, drawLuckBoxPrize, listStoreItems, maxQuantityOf, storeMode } from '../src/services/cc/ccStoreService.js';
import { getProfile } from '../src/services/cc/ccService.js';
import { addXpBoost, clearXpBoostCache, extendBoost, pruneBoosts, xpBoostMultiplier } from '../src/services/leveling/xpBoostService.js';
import { normalizeMarket, tickAsset, forecastAsset } from '../src/services/cc/bourseService.js';
import { forecastLine } from '../src/services/cc/bourseUi.js';
import { ensureTraderRole } from '../src/services/cc/traderRoleService.js';
import { validateRoleName, parseRoleColor, renewalStep } from '../src/services/cc/customRoleService.js';
import { customRoleModal, myRolesEmbed } from '../src/services/cc/customRoleUi.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';
import myrole from '../src/commands/Games/myrole.js';
import { LEVEL_TIERS } from '../src/services/leveling/levelTierRoles.js';

const GUILD_ID = '100000000000000077';
const MEMBER = '200000000000000077';
const OPEN = { open: true, trial: false, maxQuantity: 10 };
const DAY = 24 * 60 * 60 * 1000;
const byId = (id) => ccStoreItems.find((item) => item.id === id);

function fakeClient() {
    const store = new Map();
    return { store, db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } };
}

function fakeMember(roles = new Map()) {
    const given = [];
    return {
        id: MEMBER,
        given,
        guild: { id: GUILD_ID, roles: { cache: roles, fetch: async (id) => roles.get(id) || null } },
        roles: { cache: new Map(), add: async (roleId) => { given.push(roleId); } },
    };
}

describe('store catalog', () => {
    test('has the owner\'s seven items at their prices, and all of them are valid', () => {
        assert.deepEqual(ccStoreItems.map((item) => [item.id, item.price]), [
            ['luck_box', 1500], ['xp_boost', 1000], ['custom_role', 7500], ['friends_role', 25000],
            ['level_boost', 1500], ['trader_role', 2500], ['bourse_forecast', 6500],
        ]);
        assert.equal(listStoreItems().length, ccStoreItems.length);
        assert.equal(byId('friends_role').maxMembers, 16);
        assert.deepEqual(byId('xp_boost').sources, ['chat']);
        assert.deepEqual(byId('level_boost').sources, ['chat', 'voice']);
    });

    test('is still in trial mode', () => {
        assert.equal(storeMode(), 'trial');
    });

    test('roles, the luck box and the forecast are bought one at a time; boosts stack', () => {
        assert.equal(maxQuantityOf(byId('trader_role')), 1);
        assert.equal(maxQuantityOf(byId('luck_box')), 1);
        assert.equal(maxQuantityOf(byId('bourse_forecast')), 1);
        assert.equal(maxQuantityOf(byId('xp_boost')), 10);
    });
});

describe('luck box', () => {
    test('gives back less CC than it costs on average', () => {
        const total = luckBoxPrizes.reduce((sum, prize) => sum + prize.weight, 0);
        const averageCC = luckBoxPrizes.reduce((sum, prize) => sum + (prize.cc || 0) * prize.weight, 0) / total;
        assert.ok(averageCC < byId('luck_box').price, String(averageCC));
        assert.ok(luckBoxPrizes.every((prize) => prize.cc || byId(prize.boost)?.type === 'boost'));
    });

    test('draws prizes by weight', () => {
        assert.deepEqual(drawLuckBoxPrize(luckBoxPrizes, () => 0), luckBoxPrizes[0]);
        assert.deepEqual(drawLuckBoxPrize(luckBoxPrizes, () => 0.999), luckBoxPrizes[luckBoxPrizes.length - 1]);
        assert.deepEqual(drawLuckBoxPrize(luckBoxPrizes, () => 0.87), { cc: 7500, weight: 2 });
    });

    test('an open store takes the price and pays the prize', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 2000 });
        const result = await buyItem(client, fakeMember(), 'luck_box', 1, { settings: OPEN, rng: () => 0.87 });
        assert.equal(result.ok, true);
        assert.equal(result.prize.cc, 7500);
        assert.equal((await getProfile(client, GUILD_ID, MEMBER)).cc, 2000 - 1500 + 7500);
    });
});

describe('XP boosts', () => {
    beforeEach(() => clearXpBoostCache());

    test('buying more adds time on top of a running boost', () => {
        const now = 1_000_000;
        const first = extendBoost({}, ['chat'], 60, now);
        assert.equal(first.chat, now + 60 * 60_000);
        const second = extendBoost(first, ['chat', 'voice'], 60, now + 10 * 60_000);
        assert.equal(second.chat, now + 120 * 60_000);
        assert.equal(second.voice, now + 70 * 60_000);
        assert.deepEqual(pruneBoosts({ a: { chat: now - 1 }, b: { chat: now + 5, voice: now - 5 } }, now), { b: { chat: now + 5 } });
    });

    test('chat XP ×2 doubles chat only; لفل ×2 doubles chat and voice, for an hour', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 5000 });
        const now = Date.now();
        const chat = await buyItem(client, fakeMember(), 'xp_boost', 1, { settings: OPEN });
        assert.equal(chat.ok, true);
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, MEMBER, 'chat'), 2);
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, MEMBER, 'voice'), 1);
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, MEMBER, 'chat', now + 61 * 60_000), 1);

        await buyItem(client, fakeMember(), 'level_boost', 1, { settings: OPEN });
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, MEMBER, 'voice'), 2);
        assert.equal((await getProfile(client, GUILD_ID, MEMBER)).cc, 5000 - 1000 - 1500);

        // Saved, so a restart keeps it.
        clearXpBoostCache();
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, MEMBER, 'chat'), 2);
    });

    test('a boost is saved per member', async () => {
        const client = fakeClient();
        await addXpBoost(client, GUILD_ID, 'someone', ['voice'], 30);
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, MEMBER, 'voice'), 1);
        assert.equal(await xpBoostMultiplier(client, GUILD_ID, 'someone', 'voice'), 2);
    });
});

describe('bourse forecast', () => {
    test('tells where every asset goes at the next hour (the move is drawn in advance)', () => {
        const market = normalizeMarket(null, { hour: 5, rng: () => 0.3 });
        for (const asset of bourseAssets) {
            const entry = market.assets[asset.id];
            const forecast = forecastAsset(asset, entry);
            const next = tickAsset(asset, entry, { rng: Math.random });
            assert.equal(Math.sign(forecast.price - entry.price), Math.sign(next.price - entry.price), asset.id);
        }
    });

    test('buyers during the hour can still change it', () => {
        const car = bourseAssets.find((asset) => asset.id === 'car');
        const entry = { price: 1300, previous: 1300, raise: 0, roll: 0.45, flow: {} };
        assert.ok(forecastAsset(car, entry).changePercent < 0);
        const rush = { ...entry, flow: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`u${i}`, 1])) };
        assert.ok(forecastAsset(car, rush).changePercent > 0);
    });

    test('reads as up, down or flat', () => {
        assert.equal(forecastLine(4.2), '⬆️ هيطلع حوالي 4%');
        assert.equal(forecastLine(-2.6), '⬇️ هينزل حوالي 3%');
        assert.equal(forecastLine(0), '➖ تقريباً ثابت');
    });

    test('an open store sells it and returns the forecast of every asset', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 7000 });
        const result = await buyItem(client, fakeMember(), 'bourse_forecast', 1, { settings: OPEN });
        assert.equal(result.ok, true);
        assert.equal(result.forecast.forecasts.length, bourseAssets.length);
        assert.equal((await getProfile(client, GUILD_ID, MEMBER)).cc, 500);
    });
});

describe('trader role', () => {
    function roleGuild(initial) {
        const cache = new Map();
        const created = [];
        const add = ({ id, name, position }) => {
            const role = { id, name, position, managed: false, setPosition: async (value) => { role.position = value; return role; } };
            cache.set(id, role);
            return role;
        };
        initial.forEach(add);
        return {
            id: 'g-trader', name: 'test', created,
            roles: {
                cache,
                fetch: async (id) => (id ? cache.get(id) || null : cache),
                create: async (options) => {
                    created.push(options);
                    return add({ id: `30000000000000000${created.length}`, name: options.name, position: 1 });
                },
            },
        };
    }

    test('is made once, without permissions, just above the Level 100 role', async () => {
        const client = fakeClient();
        const level100 = LEVEL_TIERS.find((tier) => tier.level === 100);
        const guild = roleGuild([{ id: '100000000000000001', name: '@everyone', position: 0 }, { id: '100000000000000100', name: level100.name, position: 7 }]);
        const first = await ensureTraderRole(client, guild);
        assert.equal(first.status, 'created');
        assert.equal(guild.created.length, 1);
        assert.equal(guild.created[0].name, traderRoleSettings.name);
        assert.deepEqual(guild.created[0].permissions, []);
        assert.equal(guild.roles.cache.get(first.roleId).position, 8);

        // A restart finds it; after the owner deletes it, it is not made again.
        assert.equal((await ensureTraderRole(client, guild)).status, 'found');
        guild.roles.cache.delete(first.roleId);
        assert.equal((await ensureTraderRole(client, guild)).status, 'deleted');
        assert.equal(guild.created.length, 1);
    });

    test('is not made in a server without the Level 100 role', async () => {
        const guild = roleGuild([{ id: '100000000000000001', name: '@everyone', position: 0 }]);
        assert.equal((await ensureTraderRole(fakeClient(), guild)).status, 'no-level-role');
        assert.equal(guild.created.length, 0);
    });

    test('the store gives the trader role found by its name', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 3000 });
        const roles = new Map([['400000000000000001', { id: '400000000000000001', name: traderRoleSettings.name, managed: false }]]);
        const member = fakeMember(roles);
        const result = await buyItem(client, member, 'trader_role', 1, { settings: OPEN });
        assert.equal(result.ok, true);
        assert.deepEqual(member.given, ['400000000000000001']);

        const none = await buyItem(client, fakeMember(new Map()), 'trader_role', 1, { settings: OPEN });
        assert.equal(none.reason, 'role_missing');
    });
});

describe('custom roles', () => {
    test('names that look like staff, links and taken names are refused', () => {
        assert.deepEqual(validateRoleName('  🔥 الأساطير  '), { ok: true, name: '🔥 الأساطير' });
        assert.equal(validateRoleName('').reason, 'empty');
        assert.equal(validateRoleName('x'.repeat(customRoleSettings.maxNameLength + 1)).reason, 'too_long');
        assert.equal(validateRoleName('Super Admin').reason, 'staff_name');
        assert.equal(validateRoleName('مشرف الشات').reason, 'staff_name');
        assert.equal(validateRoleName('discord.gg/abc').reason, 'link');
        assert.equal(validateRoleName('Legends', ['legends']).reason, 'taken');
    });

    test('colours can be hex or a name', () => {
        assert.deepEqual(parseRoleColor('#ff0000'), { ok: true, color: 0xff0000 });
        assert.deepEqual(parseRoleColor('0f0'), { ok: true, color: 0x00ff00 });
        assert.equal(parseRoleColor('احمر').color, 0xe74c3c);
        assert.equal(parseRoleColor('').ok, true);
        assert.equal(parseRoleColor('مش لون').ok, false);
    });

    test('renewal: reminder 3 days before, renew when the leader can pay, 3 days of grace, then the end', () => {
        const paidUntil = 100 * DAY;
        const record = { paidUntil, cancelled: false, graceUntil: null, remindedFor: null };
        assert.equal(renewalStep(record, paidUntil - 4 * DAY, false), 'keep');
        assert.equal(renewalStep(record, paidUntil - 2 * DAY, false), 'remind');
        assert.equal(renewalStep({ ...record, remindedFor: paidUntil }, paidUntil - 2 * DAY, false), 'keep');
        assert.equal(renewalStep(record, paidUntil, true), 'renew');
        assert.equal(renewalStep(record, paidUntil + DAY, false), 'grace');
        assert.equal(renewalStep(record, paidUntil + 3 * DAY, false), 'end');
        assert.equal(renewalStep({ ...record, cancelled: true }, paidUntil, true), 'end');
        assert.equal(renewalStep({ ...record, cancelled: true }, paidUntil - 2 * DAY, true), 'keep');
    });

    test('the form asks for the name and colour, and an icon only on servers with role icons', () => {
        const item = byId('friends_role');
        const plain = customRoleModal(item, { features: [] }).toJSON();
        assert.equal(plain.custom_id, 'customrole:create:friends_role');
        assert.equal(plain.components.filter((component) => component.type === 18).length, 2);
        const boosted = customRoleModal(item, { features: ['ROLE_ICONS'] }).toJSON();
        assert.equal(boosted.components.filter((component) => component.type === 18).length, 3);
    });

    test('a trial purchase opens the form instead of buying (buyItem only previews it)', async () => {
        const client = fakeClient();
        client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 8000 });
        const result = await buyItem(client, fakeMember(), 'custom_role', 1);
        assert.equal(result.trial, true);
        assert.equal((await buyItem(client, fakeMember(), 'custom_role', 1, { settings: OPEN })).reason, 'use_form');
    });

    test('رولي shows the member\'s roles', () => {
        const user = { id: MEMBER, toString: () => `<@${MEMBER}>` };
        assert.match(myRolesEmbed(user, []).description, /معندكش/u);
        const record = { roleId: '5', kind: 'friends', name: 'Legends', leaderId: MEMBER, members: [MEMBER, '2'], maxMembers: 16, price: 25000, paidUntil: Date.now() + DAY, cancelled: false };
        const embed = myRolesEmbed(user, [record]);
        assert.match(embed.fields[0].value, /2\/16/u);
    });

    test('`رولي` words: alone or with its words only, so chat is left alone', () => {
        assert.deepEqual(myrole.normalizePrefixArgs([]), ['info']);
        assert.deepEqual(myrole.normalizePrefixArgs(['انفايت', '<@1>']), ['invite', '<@1>']);
        assert.deepEqual(myrole.normalizePrefixArgs(['الغي', 'صحاب']), ['cancel', 'friends']);
        assert.deepEqual(myrole.normalizePrefixArgs(['اخرج']), ['leave']);
        assert.ok(applyWordAliases('رولي', [], false));
        assert.ok(applyWordAliases('رولي', ['انفايت', '<@1>'], false));
        assert.equal(applyWordAliases('رولي', ['اتمسحت'], false), null);
    });
});
