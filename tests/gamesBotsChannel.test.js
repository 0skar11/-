import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleGamesBotOutsideChannel } from '../src/services/cc/gamesBotChannel.js';
import { CLOVER_BOT_ID, GAMES_BOTS_CHANNEL_ID } from '../src/config/games.js';
import { investReceiptEmbed, sellReceiptEmbed } from '../src/services/cc/bourseUi.js';
import { ccProfileEmbed } from '../src/commands/Games/cc.js';

function botMessage(channelId, { authorId = CLOVER_BOT_ID, parentId = null, userId = '200000000000000001' } = {}) {
  const sent = [];
  let deleted = false;
  return {
    guild: { id: 'g' },
    channelId,
    channel: { id: channelId, parentId, send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } },
    author: { id: authorId, bot: true },
    interactionMetadata: { user: { id: userId } },
    delete: async () => { deleted = true; },
    get deleted() { return deleted; },
    sent,
  };
}

describe('games bots channel (report #121)', () => {
  test('Clover messages outside the channel are deleted with one notice per 30 seconds', async () => {
    const first = botMessage('111111111111111111');
    assert.equal(await handleGamesBotOutsideChannel(first, { now: 1_000_000 }), true);
    assert.equal(first.deleted, true);
    assert.match(first.sent[0].content, new RegExp(`<#${GAMES_BOTS_CHANNEL_ID}>`));
    assert.deepEqual(first.sent[0].allowedMentions, { users: ['200000000000000001'] });

    const second = botMessage('111111111111111111');
    assert.equal(await handleGamesBotOutsideChannel(second, { now: 1_010_000 }), true);
    assert.equal(second.deleted, true);
    assert.equal(second.sent.length, 0);
  });

  test('Clover in its channel or a thread of it, and other bots, are left alone', async () => {
    assert.equal(await handleGamesBotOutsideChannel(botMessage(GAMES_BOTS_CHANNEL_ID)), false);
    assert.equal(await handleGamesBotOutsideChannel(botMessage('222222222222222222', { parentId: GAMES_BOTS_CHANNEL_ID })), false);
    assert.equal(await handleGamesBotOutsideChannel(botMessage('111111111111111111', { authorId: '300000000000000009' })), false);
  });
});

describe('CC messages', () => {
  const user = { id: 'u', toString: () => '<@u>', displayAvatarURL: () => 'https://x/a.png' };
  const asset = { emoji: '🏍️', name: 'موتوسيكل' };

  test('the invest receipt shows what was bought on top and the numbers as cards (report #123)', () => {
    const embed = investReceiptEmbed(user, { asset, quantity: 1, price: 432, cost: 432, owned: 1, before: 438, balance: 6 });
    assert.match(embed.description, /<@u> اشترى \*\*🏍️ موتوسيكل × 1\*\*/u);
    assert.deepEqual(embed.fields.map((field) => field.name), ['🏷️ سعر القطعة', '💵 اتخصم', '💼 معاك دلوقتي', '💰 رصيدك']);
    assert.match(embed.fields[3].value, /قبل: \*\*438\*\*[\s\S]*دلوقتي: \*\*6\*\*/u);
  });

  test('the sell receipt uses cards too', () => {
    const embed = sellReceiptEmbed(user, { asset, quantity: 2, price: 500, fee: 50, received: 950, profit: 100, owned: 0, before: 6, balance: 956 });
    assert.match(embed.description, /باع/u);
    assert.equal(embed.fields.length, 5);
  });

  test('cc shows the balance only (report #122)', async () => {
    const client = { db: { get: async (key, fallback) => fallback, set: async () => true } };
    const embed = await ccProfileEmbed(client, 'g', user);
    assert.match(embed.description, /💰 الرصيد/u);
    assert.equal(embed.fields, undefined);
    assert.doesNotMatch(embed.description, /الترتيب/u);
  });
});
