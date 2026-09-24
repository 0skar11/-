import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { publishStaffPermissionBoard, ROLE_DEFINITIONS } from '../src/services/staffRoleHierarchyService.js';

const FOOTER = 'Staff permissions • Anti-Raid / Anti-Nuke administration';
// Embed titles are posted without emojis (src/utils/embeds.js strips them).
const plain = (name) => name.replace(/[\p{Extended_Pictographic}️]/gu, '').trim();

function setup(existingRoleNames) {
  const bot = { id: 'bot' };
  const messages = new Map();
  let seq = 0;
  const post = (title) => {
    const id = String(++seq);
    const message = { id, author: bot, createdTimestamp: seq, embeds: [{ title, footer: { text: FOOTER } }], edit: async () => {}, delete: async () => messages.delete(id) };
    messages.set(id, message);
    return message;
  };
  const snapshot = () => {
    const copy = new Map(messages);
    copy.filter = (fn) => { const result = new Map([...copy].filter(([, value]) => fn(value))); result.filter = copy.filter; return result; };
    return copy;
  };
  for (const name of existingRoleNames) post(`${plain(name)} — الصلاحيات`);

  const client = { user: bot };
  const channel = {
    client, guild: { id: 'g' }, isTextBased: () => true,
    permissionsFor: () => new PermissionsBitField(PermissionsBitField.All),
    messages: { fetch: async (arg) => (typeof arg === 'string' ? messages.get(arg) || null : snapshot()) },
    send: async ({ embeds }) => post(embeds[0].data.title),
  };
  const roles = new Map(ROLE_DEFINITIONS.map((definition, index) => [String(index), {
    name: definition.name, managed: false, permissions: new PermissionsBitField(definition.permissions), toString: () => `<@&${index}>`,
  }]));
  roles.find = (fn) => [...roles.values()].find(fn);
  const guild = { id: 'g', client, channels: { fetch: async () => channel }, members: { me: {} }, roles: { fetch: async () => roles } };
  return { guild, messages };
}

describe('staff permission board', () => {
  test('re-posts only the missing role and keeps the rest (emoji-less titles)', async () => {
    const names = ROLE_DEFINITIONS.map((definition) => definition.name);
    const { guild, messages } = setup(names.filter((name) => !name.includes('Event Manager')));
    assert.deepEqual(await publishStaffPermissionBoard(guild).then(({ sent, edited }) => ({ sent, edited })), { sent: 1, edited: names.length - 1 });
    assert.deepEqual(await publishStaffPermissionBoard(guild).then(({ sent, edited }) => ({ sent, edited })), { sent: 0, edited: names.length });
    assert.equal(messages.size, names.length);
  });

  test('edit-only never posts', async () => {
    const { guild, messages } = setup([]);
    assert.equal((await publishStaffPermissionBoard(guild, { editOnly: true })).sent, 0);
    assert.equal(messages.size, 0);
  });
});
