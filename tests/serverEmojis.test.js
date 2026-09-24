import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { ensureServerEmojis, listServerEmojiFiles } from '../src/services/serverEmojiService.js';

const guildWith = ({ permissions = PermissionsBitField.All, existing = [], failOn = [] } = {}) => {
  const created = [];
  return {
    created,
    members: { me: { permissions: new PermissionsBitField(permissions) } },
    emojis: {
      fetch: async () => existing.map((name) => ({ name })),
      create: async ({ name, attachment }) => {
        if (failOn.includes(name)) throw new Error('Maximum number of emojis reached');
        created.push({ name, attachment });
      },
    },
  };
};

describe('server emojis', () => {
  test('every emoji file has a valid Discord emoji name', async () => {
    const files = await listServerEmojiFiles();
    assert.ok(files.length > 0);
    for (const { name } of files) assert.match(name, /^[\w]{2,32}$/u);
  });

  test('uploads only the emojis the server does not have yet', async () => {
    const files = await listServerEmojiFiles();
    const guild = guildWith({ existing: ['void_coin'] });
    const result = await ensureServerEmojis(guild);
    assert.deepEqual(result, { skipped: false, added: files.length - 1, failed: 0 });
    assert.equal(guild.created.some((emoji) => emoji.name === 'void_coin'), false);
    assert.ok(guild.created.every((emoji) => emoji.attachment.endsWith(`${emoji.name}.png`)));
  });

  test('counts failures (full emoji slots) without stopping', async () => {
    const files = await listServerEmojiFiles();
    const result = await ensureServerEmojis(guildWith({ failOn: ['chaos'] }));
    assert.deepEqual(result, { skipped: false, added: files.length - 1, failed: 1 });
  });

  test('skips when the bot cannot manage expressions', async () => {
    const result = await ensureServerEmojis(guildWith({ permissions: 0n }));
    assert.deepEqual(result, { skipped: true, added: 0, failed: 0 });
  });
});
