import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { gamesEnabled, isDisabledGameCommand, GAMES_MOVED_NOTICE } from '../src/config/games.js';
import { GAMES_CHANNEL_ID, handleGamesChannelMessage, isGamesOnlyFor, isBlockedSlashCommand } from '../src/services/games/gamesChannel.js';
import gamesPanelButton from '../src/interactions/buttons/games/gamesPanel.js';
import { createCCApiRouter, isAuthorized } from '../src/services/cc/ccApi.js';
import { getProfile } from '../src/services/cc/ccService.js';

const GUILD = '100000000000000001';
const A = '200000000000000001';
const B = '200000000000000002';
const C = '200000000000000003';
const TOKEN = 'test-token-0123456789abcdef';

function memoryDb() {
    const data = new Map();
    return {
        data,
        get: async (key, fallback) => (data.has(key) ? structuredClone(data.get(key)) : fallback),
        set: async (key, value) => { data.set(key, structuredClone(value)); return true; },
        list: async (prefix) => [...data.keys()].filter((key) => key.startsWith(prefix)),
    };
}

describe('games are off by default', () => {
    const previous = process.env.GAMES_ENABLED;
    before(() => { delete process.env.GAMES_ENABLED; });
    after(() => { if (previous !== undefined) process.env.GAMES_ENABLED = previous; });

    test('the switch', () => {
        assert.equal(gamesEnabled(), false);
        assert.equal(isDisabledGameCommand('game'), true);
        assert.equal(isDisabledGameCommand('cc'), false);
        process.env.GAMES_ENABLED = 'true';
        assert.equal(isDisabledGameCommand('game'), false);
        delete process.env.GAMES_ENABLED;
    });

    test('game commands are not loaded, the CC commands are', async () => {
        const { loadCommands } = await import('../src/handlers/loaders/commandLoader.js');
        const loaded = {};
        await loadCommands(loaded);
        for (const name of ['game', 'solo', 'rps', 'xo', 'fight']) assert.equal(loaded.commands.has(name), false, name);
        for (const name of ['daily', 'cc', 'cctop']) assert.equal(loaded.commands.get(name).category, 'Games', name);
    });

    test('the games channel is left alone for the games bot', async () => {
        let deleted = false;
        const message = {
            content: 'انا جاي العب',
            channelId: GAMES_CHANNEL_ID,
            guild: { id: GUILD },
            author: { id: A, bot: false },
            client: { user: { id: '999999999999999999' } },
            delete: async () => { deleted = true; },
            channel: { send: async () => ({ delete: async () => {} }) },
        };
        assert.equal(await handleGamesChannelMessage(message, { db: memoryDb() }), false);
        assert.equal(deleted, false);
        assert.equal(isGamesOnlyFor(message), false);
        assert.equal(isBlockedSlashCommand(GAMES_CHANNEL_ID, 'ban', A), false);
    });

    test('old panel game buttons say the games moved', async () => {
        const replies = [];
        const interaction = {
            inGuild: () => true,
            user: { id: A },
            reply: async (payload) => { replies.push(payload); },
        };
        await gamesPanelButton.execute(interaction, {}, ['roulette']);
        await gamesPanelButton.execute(interaction, {}, ['stop']);
        assert.equal(replies.length, 2);
        assert.equal(replies[0].content, GAMES_MOVED_NOTICE);
    });
});

describe('CC API for the games bot', () => {
    let server;
    let base;
    let db;
    let token = TOKEN;

    before(async () => {
        db = memoryDb();
        const client = { db, guilds: { cache: new Map([[GUILD, {}]]) } };
        const app = express();
        app.use('/api/cc', createCCApiRouter(client, { token: () => token }));
        await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
        base = `http://127.0.0.1:${server.address().port}/api/cc`;
    });
    after(() => new Promise((resolve) => server.close(resolve)));

    const call = async (method, path, body, auth = `Bearer ${TOKEN}`) => {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
            ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
        });
        return { status: res.status, body: await res.json() };
    };

    test('token checks', async () => {
        assert.equal(isAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
        assert.equal(isAuthorized('Bearer nope', TOKEN), false);
        assert.equal(isAuthorized(`Bearer short`, 'short'), false);
        assert.equal((await call('GET', `/${GUILD}/users/${A}`, undefined, null)).status, 401);
        assert.equal((await call('GET', `/${GUILD}/users/${A}`, undefined, 'Bearer wrong-token-xxxxxxxx')).status, 401);
        token = '';
        assert.equal((await call('GET', `/${GUILD}/users/${A}`)).status, 503);
        token = TOKEN;
    });

    test('unknown guilds and bad input are refused', async () => {
        assert.equal((await call('GET', `/100000000000000999/users/${A}`)).status, 404);
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: 'abc', amount: 5 })).status, 400);
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: A, amount: 0 })).status, 400);
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: A, amount: 1_000_000 })).status, 400);
        assert.equal((await call('POST', `/${GUILD}/add`, '{broken')).status, 400);
        assert.equal((await call('POST', `/${GUILD}/group-game`, { players: [A, B], ranking: [C] })).status, 400);
    });

    test('group game pays the top places with our reward rules', async () => {
        const res = await call('POST', `/${GUILD}/group-game`, { game: 'roulette', players: [A, B, C], ranking: [B, A] });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.paid.map((p) => [p.userId, p.amount]), [[B, 15], [A, 9]]);
        const c = await getProfile({ db }, GUILD, C);
        assert.equal(c.cc, 0);
        assert.equal(c.stats.gamesPlayed, 1);
    });

    test('add, spend, solo win, profile and top', async () => {
        const before = (await call('GET', `/${GUILD}/users/${C}`)).body.cc;
        assert.equal((await call('POST', `/${GUILD}/add`, { userId: C, amount: 40, reason: 'event' })).body.balance, before + 40);
        const solo = await call('POST', `/${GUILD}/solo-win`, { userId: C, game: 'xo' });
        assert.equal(solo.body.amount, 5);
        assert.deepEqual((await call('POST', `/${GUILD}/spend`, { userId: C, amount: 1000 })).body, { ok: false, balance: before + 45 });
        assert.deepEqual((await call('POST', `/${GUILD}/spend`, { userId: C, amount: 45 })).body, { ok: true, balance: before });
        const top = await call('GET', `/${GUILD}/top?limit=2`);
        assert.equal(top.body.top.length, 2);
        assert.equal(top.body.top[0].userId, B);
    });

    test('a retried requestId never pays twice', async () => {
        const body = { userId: A, amount: 7, requestId: 'win-123' };
        const [first, second] = await Promise.all([call('POST', `/${GUILD}/add`, body), call('POST', `/${GUILD}/add`, body)]);
        assert.deepEqual(first.body, second.body);
        const third = await call('POST', `/${GUILD}/add`, body);
        assert.deepEqual(third.body, first.body);
        assert.equal((await getProfile({ db }, GUILD, A)).cc, 9 + 7);
    });
});
