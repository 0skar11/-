import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { buildRulesEmbed, publishRulesBoard, RULES_TITLE } from '../src/services/rulesBoardService.js';

function setup({ permissions = PermissionsBitField.All } = {}) {
  const bot = { id: 'bot' };
  const messages = new Map();
  let seq = 0;
  const post = (embed) => {
    const id = String(++seq);
    const message = {
      id, author: bot, createdTimestamp: seq, embeds: [embed],
      edit: async ({ embeds }) => { message.embeds = [embeds[0].data]; },
      delete: async () => messages.delete(id),
    };
    messages.set(id, message);
    return message;
  };
  const client = { user: bot };
  const channel = {
    id: 'c', client, guild: { id: 'g', members: { me: {} } }, isTextBased: () => true,
    permissionsFor: () => new PermissionsBitField(permissions),
    messages: { fetch: async (arg) => (typeof arg === 'string' ? messages.get(arg) || null : new Map(messages)) },
    send: async ({ embeds }) => post(embeds[0].data),
  };
  return { channel, messages, post };
}

describe('rules board', () => {
  test('fits Discord embed limits', () => {
    const { data } = buildRulesEmbed();
    assert.ok(data.fields.length <= 25);
    for (const field of data.fields) assert.ok(field.value.length <= 1024, field.name);
    const total = [data.title, data.description, ...data.fields.flatMap((f) => [f.name, f.value])].join('').length;
    assert.ok(total <= 6000);
  });

  test('posts once, then leaves an up-to-date post alone', async () => {
    const { channel, messages } = setup();
    assert.equal((await publishRulesBoard(channel)).status, 'sent');
    assert.equal((await publishRulesBoard(channel)).status, 'exists');
    assert.equal(messages.size, 1);
  });

  test('edits an outdated post instead of reposting', async () => {
    const { channel, messages, post } = setup();
    post({ title: RULES_TITLE, description: 'old rules', fields: [] });
    assert.equal((await publishRulesBoard(channel)).status, 'updated');
    assert.equal(messages.size, 1);
    assert.notEqual([...messages.values()][0].embeds[0].description, 'old rules');
  });

  test('reports missing permissions', async () => {
    const { channel } = setup({ permissions: [PermissionsBitField.Flags.ViewChannel] });
    await assert.rejects(publishRulesBoard(channel), /Missing permissions/);
  });
});
