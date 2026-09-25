import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setAfk, getAfk, handleAfkMessage } from '../src/services/afkService.js';

function setup() {
  const store = new Map();
  const client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => store.set(key, value) } };
  const sent = [];
  const channel = { send: async (payload) => { sent.push(payload); return { delete: async () => {} }; } };
  const guild = { id: `g${Math.random()}` };
  const member = (id, nickname = null) => ({
    id, guild, nickname, manageable: true,
    user: { id, username: `user${id}`, globalName: null, bot: false, toString: () => `<@${id}>` },
    async setNickname(value) { this.nickname = value; },
  });
  const users = (list) => ({ filter: (fn) => list.filter(fn) });
  const message = (author, { mentions = [], repliedUser = null, content = 'hi' } = {}) => ({
    guild, channel, content, member: author, author: author.user,
    mentions: { users: users(mentions.map((m) => m.user)), repliedUser: repliedUser?.user || null },
  });
  return { client, store, sent, guild, member, message };
}

describe('afk', () => {
  test('mentioning or replying to an AFK member tells the sender, without pinging', async () => {
    const { client, sent, member, message } = setup();
    const away = member('1');
    const other = member('2');
    await setAfk(client, away, 'نايم');
    assert.equal(away.nickname, '[AFK] user1');

    await handleAfkMessage(message(other, { mentions: [away] }), client);
    assert.match(sent[0].content, /💤 <@1> AFK .* — نايم/u);
    assert.deepEqual(sent[0].allowedMentions, { parse: [] });

    await handleAfkMessage(message(other, { repliedUser: away }), client);
    assert.equal(sent.length, 2);
  });

  test('the AFK member talking again clears it and restores the name', async () => {
    const { client, sent, member, message, guild } = setup();
    const away = member('1', 'Zito');
    await setAfk(client, away, 'برا');
    assert.equal(away.nickname, '[AFK] Zito');
    await handleAfkMessage(message(away), client);
    assert.equal(await getAfk(client, guild.id, '1'), null);
    assert.equal(away.nickname, 'Zito');
    assert.match(sent[0].content, /أهلا بيك تاني/u);
  });

  test('the afk command itself does not clear AFK', async () => {
    const { client, member, message, guild } = setup();
    const away = member('1');
    await setAfk(client, away, 'x');
    await handleAfkMessage(message(away, { content: 'afk y' }), client, { isAfkCommand: true });
    assert.ok(await getAfk(client, guild.id, '1'));
  });
});
