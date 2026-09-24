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
        assert.equal(loaded.commands.has('daily'), false);
        for (const name of ['cc', 'cctop']) assert.equal(loaded.commands.get(name).category, 'Games', name);
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

describe('games bot (Clover) wins', async () => {
    const { handleGamesBotWin, parseWinner } = await import('../src/services/cc/gamesBotWins.js');
    const { CLOVER_BOT_ID } = await import('../src/config/games.js');
    const { CC } = await import('../src/config/cc.js');
    let nextId = 1;

    function winMessage(content, { authorId = CLOVER_BOT_ID, bot = true, winnerBot = false, id = String(nextId++) } = {}) {
        const replies = [];
        const winnerId = parseWinner(content);
        return {
            id,
            content,
            guild: { id: GUILD },
            author: { id: authorId, bot },
            mentions: { users: new Map(winnerId ? [[winnerId, { id: winnerId, bot: winnerBot }]] : []) },
            reply: async (payload) => { replies.push(payload); return { delete: async () => {} }; },
            replies,
        };
    }

    test('reads the winner from the crown message', () => {
        assert.equal(parseWinner(`👑 | <@${A}>`), A);
        assert.equal(parseWinner(`👑 | <@!${A}>`), A);
        assert.equal(parseWinner(`👑 | <@${A}> <@${B}>`), null);
        assert.equal(parseWinner(`<@${A}> طلّع <@${B}>`), null);
        assert.equal(parseWinner('👑 | Zatona'), null);
    });

    test('pays the winner once, only for the games bot', async () => {
        const client = { db: memoryDb() };
        const win = winMessage(`👑 | <@${A}>`);
        assert.equal(await handleGamesBotWin(win, client), true);
        assert.equal(await handleGamesBotWin(win, client), true);
        const profile = await getProfile(client, GUILD, A);
        assert.equal(profile.cc, CC.gamesBot.win);
        assert.equal(profile.stats.groupWins, 1);
        assert.equal(win.replies.length, 1);

        assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`, { authorId: B, bot: false }), client), false);
        assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`, { authorId: '300000000000000001' }), client), false);
        assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${B}>`, { winnerBot: true }), client), true);
        assert.equal((await getProfile(client, GUILD, A)).cc, CC.gamesBot.win);
        assert.equal((await getProfile(client, GUILD, B)).cc, 0);
    });

    test('GAMES_BOT_IDS switches to a premium copy of the bot', async () => {
        const client = { db: memoryDb() };
        process.env.GAMES_BOT_IDS = '300000000000000001';
        try {
            assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`, { authorId: '300000000000000001' }), client), true);
            assert.equal(await handleGamesBotWin(winMessage(`👑 | <@${A}>`), client), false);
        } finally {
            delete process.env.GAMES_BOT_IDS;
        }
        assert.equal((await getProfile(client, GUILD, A)).cc, CC.gamesBot.win);
    });

    test('daily cap', async () => {
        const client = { db: memoryDb() };
        const wins = Math.ceil(CC.gamesBot.dailyCap / CC.gamesBot.win) + 2;
        for (let i = 0; i < wins; i += 1) await handleGamesBotWin(winMessage(`👑 | <@${C}>`), client);
        const profile = await getProfile(client, GUILD, C);
        assert.equal(profile.cc, CC.gamesBot.dailyCap);
        assert.equal(profile.stats.groupWins, wins);
    });
});
