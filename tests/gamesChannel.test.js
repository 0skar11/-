import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    GAMES_CHANNEL_ID, typedCommandName, isGameCommandMessage, isBlockedSlashCommand, handleGamesChannelMessage,
} from '../src/services/games/gamesChannel.js';
import { buildGamesPanel, PANEL_ACTIONS, isGroupGame } from '../src/services/games/panel.js';
import { claimChannel, releaseChannel, gameAcceptsChat } from '../src/services/games/session.js';
import { SOLO_GAMES } from '../src/services/games/solo.js';
import { applyWordAliases } from '../src/config/commands/commandAliases.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';
import gamesPanelButton from '../src/interactions/buttons/games/gamesPanel.js';

const MEMBER = '200000000000000009';

function fakeMessage(content, { authorId = MEMBER, bot = false, channelId = GAMES_CHANNEL_ID } = {}) {
    const sent = [];
    const message = {
        content,
        channelId,
        guild: { id: '100000000000000001' },
        author: { id: authorId, bot },
        client: { user: { id: '999999999999999999' } },
        deleted: false,
        delete: async () => { message.deleted = true; },
        channel: { send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } },
        sent,
    };
    return message;
}
const client = { db: { get: async (key, fallback) => fallback } };

describe('games channel', () => {
    test('recognises game commands with and without the prefix', () => {
        assert.equal(typedCommandName('روليت', '!'), 'game');
        assert.equal(typedCommandName('!روليت', '!'), 'game');
        assert.equal(typedCommandName('اسئلة 5', '!'), 'game');
        assert.equal(typedCommandName('top cc', '!'), 'cctop');
        assert.equal(typedCommandName('TOP CC', '!'), 'cctop');
        assert.equal(typedCommandName('رصيد', '!'), 'cc');
        assert.equal(typedCommandName('سؤال يا جماعة', '!'), null);
        assert.ok(isGameCommandMessage('حجر', ['!']));
        assert.ok(isGameCommandMessage('اكس <@200000000000000001>', ['!']));
        assert.ok(!isGameCommandMessage('بان <@200000000000000001>', ['!']));
        assert.ok(!isGameCommandMessage('هاي يا شباب', ['!']));
        assert.ok(!isGameCommandMessage('top', ['!']));
    });

    test('deletes chat but keeps game commands, owners and in-game answers', async () => {
        const chat = fakeMessage('هاي يا شباب');
        assert.equal(await handleGamesChannelMessage(chat, client), true);
        assert.ok(chat.deleted);
        assert.equal(chat.sent.length, 1);

        const again = fakeMessage('تاني');
        await handleGamesChannelMessage(again, client);
        assert.ok(again.deleted);
        assert.equal(again.sent.length, 0, 'the notice is rate limited');

        const command = fakeMessage('العاب');
        assert.equal(await handleGamesChannelMessage(command, client), false);
        assert.ok(!command.deleted);

        const owner = fakeMessage('اي حاجة', { authorId: SERVER_OWNER_IDS[0] });
        assert.equal(await handleGamesChannelMessage(owner, client), false);

        const otherBot = fakeMessage('spam', { authorId: '300000000000000001', bot: true });
        assert.equal(await handleGamesChannelMessage(otherBot, client), true);

        const elsewhere = fakeMessage('هاي', { channelId: '123456789012345678' });
        assert.equal(await handleGamesChannelMessage(elsewhere, client), false);

        const session = claimChannel(GAMES_CHANNEL_ID, 'trivia', MEMBER);
        assert.equal(await handleGamesChannelMessage(fakeMessage('القاهرة', { authorId: '200000000000000010' }), client), true, 'no chat before the game opens it');
        session.chatOpen = true;
        assert.equal(await handleGamesChannelMessage(fakeMessage('القاهرة', { authorId: '200000000000000010' }), client), false);
        releaseChannel(session);
    });

    test('lobby games only let their players talk', () => {
        const session = claimChannel('chan-mafia', 'mafia', MEMBER);
        assert.equal(gameAcceptsChat('chan-mafia', MEMBER), false);
        session.players = new Set([MEMBER]);
        assert.equal(gameAcceptsChat('chan-mafia', MEMBER), true);
        assert.equal(gameAcceptsChat('chan-mafia', '200000000000000010'), false);
        releaseChannel(session);
        assert.equal(gameAcceptsChat('chan-mafia', MEMBER), false);
    });

    test('other slash commands are refused there, except for owners', () => {
        assert.ok(isBlockedSlashCommand(GAMES_CHANNEL_ID, 'ban', MEMBER));
        assert.ok(!isBlockedSlashCommand(GAMES_CHANNEL_ID, 'game', MEMBER));
        assert.ok(!isBlockedSlashCommand(GAMES_CHANNEL_ID, 'ban', SERVER_OWNER_IDS[0]));
        assert.ok(!isBlockedSlashCommand('123456789012345678', 'ban', MEMBER));
    });

    test('word aliases', () => {
        assert.deepEqual(applyWordAliases('خمن', ['3'], false), { commandName: 'game', args: ['guess', '3'] });
        assert.equal(applyWordAliases('خمن', ['ايه', 'ده'], false), null);
        assert.deepEqual(applyWordAliases('خمن', ['ايه'], true), { commandName: 'game', args: ['guess', 'ايه'] });
        assert.deepEqual(applyWordAliases('ban', ['x'], false), { commandName: 'ban', args: ['x'] });
    });
});

describe('games panel', () => {
    test('fits Discord limits and every button has a handler', () => {
        const panel = buildGamesPanel();
        assert.ok(panel.components.length <= 5);
        for (const row of panel.components) assert.ok(row.components.length <= 5);
        const ids = panel.components.flatMap((row) => row.components.map((button) => button.data.custom_id));
        assert.equal(new Set(ids).size, ids.length);
        for (const id of ids) {
            assert.ok(id.startsWith(`${gamesPanelButton.name}:`));
            assert.ok(id.length <= 100);
        }
        const handled = (action) => isGroupGame(action) || SOLO_GAMES[action.replace('solo_', '')] || ['rps', 'stop', 'daily', 'balance', 'top'].includes(action);
        for (const action of PANEL_ACTIONS) assert.ok(handled(action), action);

        const [embed] = panel.embeds;
        assert.ok(embed.title.includes('🎮'), 'keeps emojis');
        assert.ok(embed.fields.every((field) => field.value.length <= 1024 && field.name.length <= 256));
        const size = embed.title.length + embed.description.length + embed.footer.text.length
            + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
        assert.ok(size <= 6000);
    });
});
