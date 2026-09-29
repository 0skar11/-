import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ccStoreItems, luckBoxPrizes, traderRoleSettings, customRoleSettings } from '../src/config/store/ccStoreItems.js';
import { bourseAssets } from '../src/config/store/bourse.js';
import { buyItem, drawLuckBoxPrize, listStoreItems, maxQuantityOf, storeMode } from '../src/services/cc/ccStoreService.js';
import { getProfile } from '../src/services/cc/ccService.js';
import { addXpBoost, clearXpBoostCache, extendBoost, pruneBoosts, xpBoostMultiplier } from '../src/services/leveling/xpBoostService.js';
import { normalizeMarket, tickAsset, forecastAsset, getMarket } from '../src/services/cc/bourseService.js';
import { addXp } from '../src/services/leveling/xpSystem.js';
import { forecastLine } from '../src/services/cc/bourseUi.js';
import { ensureTraderRole } from '../src/services/cc/traderRoleService.js';
import { validateRoleName, parseRoleColor, renewalStep, buyCustomRole, listCustomRoles, sweepGuildCustomRoles, checkInvite, acceptInvite } from '../src/services/cc/customRoleService.js';
import { customRoleModal, myRolesEmbed, myRolesComponents, myRolesPayload } from '../src/services/cc/customRoleUi.js';
import myRoleButtons from '../src/interactions/buttons/store/myRole.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';
import myrole from '../src/commands/Games/myrole.js';
import { LEVEL_TIERS } from '../src/services/leveling/levelTierRoles.js';
import { HOME_GUILD_ID, isHomeGuild } from '../src/config/homeGuild.js';
import { ccStoreDemoItems } from '../src/config/store/ccStoreItems.js';
import { storeCatalog } from '../src/services/cc/ccStoreService.js';

const GUILD_ID = HOME_GUILD_ID;
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
        // By price, cheapest first, with the two custom roles at the bottom (the owner's order).
        assert.deepEqual(ccStoreItems.map((item) => [item.id, item.price]), [
            ['xp_boost', 1000], ['luck_box', 1500], ['level_boost', 1500], ['trader_role', 2500],
            ['bourse_forecast', 6500], ['custom_role', 7500], ['friends_role', 25000],
        ]);
        assert.equal(listStoreItems().length, ccStoreItems.length);
        assert.equal(byId('friends_role').maxMembers, 16);
        assert.deepEqual(byId('xp_boost').sources, ['chat']);
        assert.deepEqual(byId('level_boost').sources, ['chat', 'voice']);
    });

    test('is open in our server, and stays trial in other servers', () => {
        assert.equal(storeMode(undefined, HOME_GUILD_ID), 'open');
        assert.equal(storeMode(undefined, '100000000000000099'), 'trial');
    });

    test('roles, the luck box and the forecast are bought one at a time; boosts stack', () => {
        assert.equal(maxQuantityOf(byId('trader_role')), 1);
        assert.equal(maxQuantityOf(byId('luck_box')), 1);
        assert.equal(maxQuantityOf(byId('bourse_forecast')), 1);
        assert.equal(maxQuantityOf(byId('xp_boost')), 10);
    });
});

describe('our server only', () => {
    const OTHER = '100000000000000099';

    test('our only server is 1155236281706627173', () => {
        assert.equal(HOME_GUILD_ID, '1155236281706627173');
        assert.ok(isHomeGuild('1155236281706627173'));
        assert.ok(!isHomeGuild(OTHER));
    });

    test('other servers keep the old sample store, and buying there is only ever a preview', async () => {
        assert.deepEqual(storeCatalog(undefined, { guildId: OTHER }).map((item) => item.id), ccStoreDemoItems.map((item) => item.id));
        assert.deepEqual(storeCatalog(undefined, { guildId: HOME_GUILD_ID }).map((item) => item.id), ccStoreItems.map((item) => item.id));
        const client = fakeClient();
        client.store.set(`guild:${OTHER}:economy:${MEMBER}`, { cc: 50_000 });
        const member = { ...fakeMember(), guild: { id: OTHER, roles: { cache: new Map() } } };
        assert.equal((await buyItem(client, member, 'luck_box', 1, { settings: OPEN })).reason, 'not_found');
        const demo = await buyItem(client, member, 'demo_box', 1, { settings: OPEN });
        assert.equal(demo.trial, true);
        assert.equal((await getProfile(client, OTHER, MEMBER)).cc, 50_000);
    });
});

describe('our server only: shared code', () => {
    test('another server\'s bourse keeps no move drawn in advance; ours does', async () => {
        const client = fakeClient();
        await getMarket(client, '100000000000000099');
        await getMarket(client, HOME_GUILD_ID);
        const other = client.store.get('guild:100000000000000099:bourse');
        const ours = client.store.get(`guild:${HOME_GUILD_ID}:bourse`);
        assert.ok(Object.values(other.assets).every((entry) => !('roll' in entry)));
        assert.ok(Object.values(ours.assets).every((entry) => typeof entry.roll === 'number'));
    });

    test('an XP boost does nothing in another server', async () => {
        const client = fakeClient();
        await addXpBoost(client, '100000000000000099', MEMBER, ['chat'], 60);
        client.store.set('guild:100000000000000099:config', { leveling: { enabled: true, roleRewards: {} } });
        const guild = { id: '100000000000000099', name: 'other', channels: { cache: new Map(), fetch: async () => null } };
        const member = { user: { id: MEMBER, tag: 'm' }, id: MEMBER };
        const result = await addXp(client, guild, member, 10);
        // Not doubled: 10 XP given, 10 XP counted.
        assert.equal(result.totalXp, 10);
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

    test('reads as up, down or flat, with the exact percent', () => {
        assert.equal(forecastLine(4.2), '⬆️ هيطلع **4.2%**');
        assert.equal(forecastLine(-2.6), '⬇️ هينزل **2.6%**');
        assert.equal(forecastLine(0), '➖ ثابت');
    });

    test('a sold forecast locks the next hour: trading after it can\'t change the price (report #172)', async () => {
        const { forecastMarket, invest } = await import('../src/services/cc/bourseService.js');
        const { adjustCC } = await import('../src/services/cc/ccService.js');
        const client = fakeClient();
        const now = Date.UTC(2026, 8, 29, 20, 10);
        const hour = 60 * 60 * 1000;
        const { forecasts } = await forecastMarket(client, HOME_GUILD_ID, { now, rng: () => 0.3 });
        // Heavy buying and a second forecast in the same hour change nothing.
        await adjustCC(client, HOME_GUILD_ID, MEMBER, 10_000_000, 'staff');
        await invest(client, HOME_GUILD_ID, MEMBER, 'motorcycle', 25, { now: now + 60_000, rng: () => 0.3 });
        const again = await forecastMarket(client, HOME_GUILD_ID, { now: now + 120_000, rng: () => 0.9 });
        assert.deepEqual(again.forecasts.map((f) => f.next), forecasts.map((f) => f.next));
        const { quotes } = await getMarket(client, HOME_GUILD_ID, { now: now + hour, rng: () => 0.9 });
        assert.deepEqual(quotes.map((q) => q.price), forecasts.map((f) => f.next));
        // The hour after that is free again.
        const stored = client.store.get(`guild:${HOME_GUILD_ID}:bourse`);
        assert.ok(Object.values(stored.assets).every((entry) => !('locked' in entry)));
    });

    test('another server never locks prices', async () => {
        const { forecastMarket } = await import('../src/services/cc/bourseService.js');
        const client = fakeClient();
        await forecastMarket(client, '100000000000000099', { now: Date.UTC(2026, 8, 29, 20, 10) });
        const stored = client.store.get('guild:100000000000000099:bourse');
        assert.ok(Object.values(stored.assets).every((entry) => !('locked' in entry)));
    });

    test('the forecast goes to the buyer in DM, or stays private when DMs are closed', async () => {
        const { purchase } = await import('../src/services/cc/storeUi.js');
        for (const dmOpen of [true, false]) {
            const client = fakeClient();
            client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 7000 });
            const dms = [];
            const member = { ...fakeMember(), user: { id: MEMBER, toString: () => `<@${MEMBER}>`, send: async (payload) => { if (!dmOpen) throw new Error('closed'); dms.push(payload); } } };
            const { ok, payload, privatePayload } = await purchase(client, member, 'bourse_forecast', 1);
            assert.equal(ok, true);
            assert.equal(dms.length, dmOpen ? 1 : 0);
            assert.equal(Boolean(privatePayload), !dmOpen);
            assert.match(payload.embeds[0].description, dmOpen ? /في الخاص/u : /الخاص عندك مقفول/u);
        }
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
        const result = await buyItem(client, fakeMember(), 'custom_role', 1, { settings: { open: false, trial: true, maxQuantity: 10 } });
        assert.equal(result.trial, true);
        assert.equal((await buyItem(client, fakeMember(), 'custom_role', 1, { settings: OPEN })).reason, 'use_form');
    });

    test('buying one takes the first month, makes the role without permissions and renews it every 30 days', async () => {
        const client = fakeClient();
        client.users = { fetch: async () => ({ send: async () => {} }) };
        client.store.set(`guild:${GUILD_ID}:economy:${MEMBER}`, { cc: 30_000 });
        const cache = new Map();
        const created = [];
        const guild = {
            id: GUILD_ID, name: 'CHAOS', features: [],
            roles: {
                cache,
                fetch: async (id) => (id ? cache.get(id) || null : cache),
                create: async (options) => {
                    created.push(options);
                    const role = { id: `50000000000000000${created.length}`, name: options.name, position: 1, setPosition: async () => role, delete: async () => { cache.delete(role.id); } };
                    cache.set(role.id, role);
                    return role;
                },
            },
            members: { fetch: async (id) => ({ id, roles: { add: async () => {}, remove: async () => {} } }) },
        };
        const given = [];
        const member = { id: MEMBER, user: { tag: 'm' }, guild, roles: { add: async (role) => { given.push(role.id); } } };
        const item = byId('friends_role');

        assert.equal((await buyCustomRole(client, member, item, { name: 'Admins' })).reason, 'staff_name');
        assert.equal((await getProfile(client, GUILD_ID, MEMBER)).cc, 30_000);

        const now = Date.now();
        const bought = await buyCustomRole(client, member, item, { name: 'Legends', color: 'ذهبي' }, { now });
        assert.equal(bought.ok, true);
        assert.deepEqual(created[0].permissions, []);
        assert.deepEqual(given, [bought.role.id]);
        assert.equal((await getProfile(client, GUILD_ID, MEMBER)).cc, 5000);
        assert.equal((await buyCustomRole(client, member, item, { name: 'Other' })).reason, 'has_role');

        // The leader invites a friend, who accepts.
        const friend = { id: '200000000000000078', bot: false };
        assert.equal((await checkInvite(client, guild, MEMBER, friend)).ok, true);
        const friendMember = { id: friend.id, guild, roles: { add: async () => {} } };
        assert.equal((await acceptInvite(client, friendMember, bought.role.id, now, { now })).ok, true);
        assert.deepEqual((await listCustomRoles(client, GUILD_ID))[0].members, [MEMBER, friend.id]);

        // 30 days later: 5,000 CC isn't enough → grace; 3 more days → the role is deleted.
        const due = bought.record.paidUntil;
        assert.equal((await sweepGuildCustomRoles(client, guild, { now: due + 1000 })).grace, 1);
        assert.equal((await sweepGuildCustomRoles(client, guild, { now: due + 3 * DAY })).ended, 1);
        assert.equal(cache.size, 0);
        assert.deepEqual(await listCustomRoles(client, GUILD_ID), []);
    });

    test('رولي has a button for each thing the member can do', () => {
        const base = { maxMembers: 16, price: 25000, paidUntil: Date.now() + DAY, cancelled: false };
        const friends = { ...base, roleId: '11', kind: 'friends', name: 'Legends', leaderId: MEMBER, members: [MEMBER, '2'] };
        const personal = { ...base, roleId: '12', kind: 'personal', name: 'Me', leaderId: MEMBER, members: [MEMBER], cancelled: true };
        const joined = { ...base, roleId: '13', kind: 'friends', name: 'Others', leaderId: '3', members: ['3', MEMBER] };
        const ids = (rows) => rows.map((row) => row.toJSON().components.map((component) => component.custom_id));
        assert.deepEqual(ids(myRolesComponents(MEMBER, [friends, personal, joined])), [
            [`myrole:invite:${MEMBER}:11`, `myrole:kick:${MEMBER}:11`, `myrole:leader:${MEMBER}:11`, `myrole:cancel:${MEMBER}:11`],
            [`myrole:resume:${MEMBER}:12`],
            [`myrole:leave:${MEMBER}:13`],
        ]);
        // Alone in the role: nobody to remove or hand it to.
        const [alone] = myRolesComponents(MEMBER, [{ ...friends, members: [MEMBER] }]).map((row) => row.toJSON().components);
        assert.deepEqual(alone.map((component) => Boolean(component.disabled)), [false, true, true, false]);
        assert.deepEqual(ids(myRolesComponents(MEMBER, [])), [[`myrole:shop:${MEMBER}`]]);
        assert.equal(myRolesPayload({ id: MEMBER, toString: () => 'x' }, []).components.length, 1);
    });

    test('the buttons work only for the member who asked, and only in our server', async () => {
        const client = fakeClient();
        const paidUntil = Date.now() + DAY;
        client.store.set(`guild:${GUILD_ID}:customroles`, { 21: { roleId: '21', kind: 'personal', name: 'Me', leaderId: MEMBER, members: [MEMBER], maxMembers: 1, price: 7500, paidUntil, cancelled: false } });
        const replies = [];
        const edits = [];
        const press = (userId, guildId = GUILD_ID) => ({
            inGuild: () => true, guildId, guild: { id: guildId }, user: { id: userId, toString: () => `<@${userId}>` },
            message: { edit: async (payload) => { edits.push(payload); } },
            reply: async (payload) => { replies.push(payload); },
        });
        await myRoleButtons.execute(press('someone'), client, ['cancel', MEMBER, '21']);
        assert.match(replies.pop().content, /مش ليك/u);
        await myRoleButtons.execute(press(MEMBER, '100000000000000099'), client, ['cancel', MEMBER, '21']);
        assert.equal(replies.length, 0);

        await myRoleButtons.execute(press(MEMBER), client, ['cancel', MEMBER, '21']);
        assert.match(replies.pop().content, /وقفت تجديد/u);
        assert.equal((await listCustomRoles(client, GUILD_ID))[0].cancelled, true);
        // The رولي message now offers to restart the renewal.
        assert.equal(edits.pop().components[0].toJSON().components[0].custom_id, `myrole:resume:${MEMBER}:21`);
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

describe('store order', async () => {
    const { sortStoreItems, storeCatalog } = await import('../src/services/cc/ccStoreService.js');
    test('cheapest first, custom roles always last even when cheaper', () => {
        const items = [
            { id: 'b', price: 900, type: 'item' },
            { id: 'role', price: 100, type: 'custom_role' },
            { id: 'a', price: 50, type: 'item' },
            { id: 'c', price: 5000, type: 'boost' },
        ];
        assert.deepEqual(sortStoreItems(items).map((item) => item.id), ['a', 'b', 'c', 'role']);
        const catalog = storeCatalog(undefined, { guildId: HOME_GUILD_ID });
        assert.deepEqual(catalog.slice(-2).map((item) => item.type), ['custom_role', 'custom_role']);
        const prices = catalog.filter((item) => item.type !== 'custom_role').map((item) => item.price);
        assert.deepEqual(prices, [...prices].sort((x, y) => x - y));
    });
});
