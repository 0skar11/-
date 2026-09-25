import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MessageType } from 'discord.js';
import {
    handleStoreChannelMessage, setStoreChannel, isStoreCommandMessage, isBlockedStoreSlashCommand, isStorePanel,
    storeRoomOverwrites,
} from '../src/services/cc/storeChannel.js';
import { buildStorePanel, confirmPurchasePayload, STORE_PANEL_FOOTER } from '../src/services/cc/storeUi.js';
import { buyItem, storeCatalog, storeMode, findStoreItem } from '../src/services/cc/ccStoreService.js';
import { ccStoreDemoItems, storeRoomSettings } from '../src/config/store/ccStoreItems.js';
import { typedCommandName } from '../src/services/games/gamesChannel.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';

const GUILD_ID = '100000000000000001';
const STORE_ID = '300000000000000001';
const BOT_ID = '999999999999999999';
const MEMBER = '200000000000000009';

function fakeMessage(content, { authorId = MEMBER, bot = false, channelId = STORE_ID, type = MessageType.Default } = {}) {
    const sent = [];
    const message = {
        content,
        type,
        channelId,
        guild: { id: GUILD_ID },
        author: { id: authorId, bot },
        client: { user: { id: BOT_ID } },
        deleted: false,
        delete: async () => { message.deleted = true; },
        channel: { id: channelId, send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } },
        sent,
    };
    return message;
}
const client = { db: { get: async (key, fallback) => fallback } };

describe('store room', () => {
    beforeEach(() => setStoreChannel(GUILD_ID, STORE_ID));

    test('recognises store commands', () => {
        assert.equal(typedCommandName('متجر', '!'), 'store');
        assert.equal(typedCommandName('شراء 1', '!'), 'store');
        assert.equal(typedCommandName('شراء 1 3', '!'), 'store');
        assert.equal(typedCommandName('مخزني', '!'), 'store');
        assert.equal(typedCommandName('متجر ايه ده', '!'), null);
        assert.ok(isStoreCommandMessage('رصيد', ['!']));
        assert.ok(isStoreCommandMessage('top cc', ['!']));
        assert.ok(isStoreCommandMessage('!store buy demo_vip', ['!']));
        assert.ok(!isStoreCommandMessage('بان <@200000000000000001>', ['!']));
        assert.ok(!isStoreCommandMessage('هاي', ['!']));
    });

    test('deletes chat but keeps store commands, owners and the bot', async () => {
        const chat = fakeMessage('هاي يا شباب');
        assert.equal(await handleStoreChannelMessage(chat, client), true);
        assert.ok(chat.deleted);
        assert.equal(chat.sent.length, 1);

        const command = fakeMessage('متجر', { authorId: '200000000000000010' });
        assert.equal(await handleStoreChannelMessage(command, client), false);
        assert.ok(!command.deleted);

        const owner = fakeMessage('اهلا', { authorId: SERVER_OWNER_IDS[0] });
        assert.equal(await handleStoreChannelMessage(owner, client), false);

        const own = fakeMessage('', { authorId: BOT_ID, bot: true });
        assert.equal(await handleStoreChannelMessage(own, client), false);

        const otherBot = fakeMessage('spam', { authorId: '200000000000000011', bot: true });
        assert.equal(await handleStoreChannelMessage(otherBot, client), true);
        assert.ok(otherBot.deleted);

        const elsewhere = fakeMessage('هاي', { channelId: '300000000000000002' });
        assert.equal(await handleStoreChannelMessage(elsewhere, client), false);
    });

    test('deletes the bot\'s own "pinned a message" notice', async () => {
        const pinned = fakeMessage('', { authorId: BOT_ID, type: MessageType.ChannelPinnedMessage });
        assert.equal(await handleStoreChannelMessage(pinned, client), true);
        assert.ok(pinned.deleted);
    });

    test('only store slash commands work in the room', () => {
        assert.ok(isBlockedStoreSlashCommand(STORE_ID, 'ban', MEMBER));
        assert.ok(!isBlockedStoreSlashCommand(STORE_ID, 'store', MEMBER));
        assert.ok(!isBlockedStoreSlashCommand(STORE_ID, 'cc', MEMBER));
        assert.ok(!isBlockedStoreSlashCommand(STORE_ID, 'ban', SERVER_OWNER_IDS[0]));
        assert.ok(!isBlockedStoreSlashCommand('300000000000000002', 'ban', MEMBER));
    });

    test('the panel is sent again after every few member commands', async () => {
        assert.equal(storeRoomSettings.repostEvery, 5);
        const channelId = '300000000000000005';
        setStoreChannel('100000000000000005', channelId);
        const sends = [];
        const channel = {
            id: channelId,
            guild: { id: '100000000000000005', name: 'Test', iconURL: () => null },
            client: { user: { id: BOT_ID } },
            messages: { fetch: async () => new Map() },
            send: async (payload) => {
                sends.push(payload);
                return { id: `50000000000000000${sends.length}`, pin: async () => {}, delete: async () => {} };
            },
        };
        const configClient = { db: { get: async (key, fallback) => fallback, set: async () => true } };
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = (fn) => { fn(); return { unref() {} }; };
        try {
            for (let i = 0; i < 9; i += 1) {
                const message = fakeMessage('متجر', { channelId, authorId: `2000000000000001${i}` });
                message.guild = channel.guild;
                message.channel = channel;
                assert.equal(await handleStoreChannelMessage(message, configClient), false);
            }
            await new Promise((resolve) => originalSetTimeout(resolve, 20));
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
        assert.equal(sends.length, 1);
        assert.equal(sends[0].embeds[0].footer.text, STORE_PANEL_FOOTER);
    });
});

describe('store panel', () => {
    test('shows the demo items with a buy menu and the buttons', () => {
        const guild = { name: 'Void', iconURL: () => null };
        const panel = buildStorePanel(guild);
        const embed = panel.embeds[0];
        assert.ok(isStorePanel({ embeds: [embed] }));
        assert.match(embed.description, /تجريبي/u);
        assert.ok(embed.fields[0].value.includes(ccStoreDemoItems[0].name));
        const [menuRow, buttonRow] = panel.components.map((row) => row.toJSON());
        assert.equal(menuRow.components[0].custom_id, 'storepanel:buy');
        assert.equal(menuRow.components[0].options.length, ccStoreDemoItems.length);
        assert.deepEqual(buttonRow.components.map((button) => button.custom_id),
            ['storepanel:balance', 'storepanel:inventory', 'storepanel:top', 'storepanel:help']);
    });

    test('the confirmation is only for the buyer and is disabled without enough CC', () => {
        const item = ccStoreDemoItems[0];
        const rich = confirmPurchasePayload(item, 1, MEMBER, item.price * 2, 'trial').components[0].toJSON();
        assert.equal(rich.components[0].custom_id, `storepanel:confirm:${item.id}:1:${MEMBER}`);
        assert.ok(!rich.components[0].disabled);
        const poor = confirmPurchasePayload(item, 1, MEMBER, 0, 'trial').components[0].toJSON();
        assert.ok(poor.components[0].disabled);
    });
});

describe('trial buying', () => {
    test('the store is in trial mode and shows the demo items', () => {
        assert.equal(storeMode(), 'trial');
        assert.equal(storeCatalog().length, ccStoreDemoItems.length);
        assert.equal(findStoreItem('1', storeCatalog()).id, ccStoreDemoItems[0].id);
        assert.equal(findStoreItem(ccStoreDemoItems[1].id, storeCatalog()).id, ccStoreDemoItems[1].id);
        assert.equal(findStoreItem('99', storeCatalog()), null);
    });

    test('a trial purchase checks the balance but takes no CC', async () => {
        let saved = 0;
        const item = ccStoreDemoItems[3];
        const db = {
            get: async () => ({ cc: item.price * 2 }),
            set: async () => { saved += 1; return true; },
        };
        const member = { id: MEMBER, guild: { id: GUILD_ID }, roles: { cache: new Map() } };
        const result = await buyItem({ db }, member, item.id, 2);
        assert.equal(result.ok, true);
        assert.equal(result.trial, true);
        assert.equal(result.cost, item.price * 2);
        assert.equal(result.balance, item.price * 2);
        assert.equal(saved, 0);

        const tooMany = await buyItem({ db }, member, item.id, 3);
        assert.equal(tooMany.reason, 'no_cc');
        assert.equal(saved, 0);
    });

    test('a closed store sells nothing', async () => {
        const result = await buyItem({}, {}, 'x', 1, { settings: { open: false, trial: false, maxQuantity: 10 } });
        assert.equal(result.reason, 'closed');
        assert.deepEqual(storeCatalog({ open: false, trial: false }), []);
    });
});

describe('store room permissions', () => {
    test('keeps the category\'s view rules and lets members type', () => {
        const guild = { id: GUILD_ID };
        const category = { permissionOverwrites: { cache: new Map([[GUILD_ID, {
            id: GUILD_ID, type: 0, allow: { bitfield: 0n }, deny: { bitfield: 1024n | 2048n },
        }]]) } };
        const overwrites = storeRoomOverwrites(category, guild, BOT_ID);
        const everyone = overwrites.find((overwrite) => overwrite.id === GUILD_ID);
        assert.ok(everyone.deny & 1024n, 'view stays denied like the category');
        assert.ok(!(everyone.deny & 2048n), 'members can send commands');
        assert.ok(everyone.deny & 32768n, 'no attachments');
        assert.ok(overwrites.find((overwrite) => overwrite.id === BOT_ID).allow & 8192n, 'the bot can manage messages');
    });
});
