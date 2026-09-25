import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { hasMediaContent, isPlayCommand, ensureMediaRole, grantMediaRoleToAllMembers, CHAOS_ROLE_ID, MEDIA_PERMISSIONS } from '../src/services/mediaRoleService.js';

const message = (content, attachments = 0) => ({ content, attachments: { size: attachments } });

describe('media lock', () => {
  test('attachments, links and GIFs count as media', () => {
    assert.equal(hasMediaContent(message('', 1)), true);
    assert.equal(hasMediaContent(message('شوف https://example.com')), true);
    assert.equal(hasMediaContent(message('www.example.com')), true);
    assert.equal(hasMediaContent(message('discord.gg/abc')), true);
  });

  test('a play command with a link is a music request, not media', () => {
    assert.equal(isPlayCommand(message('شغل https://www.youtube.com/playlist?list=PL1')), true);
    assert.equal(isPlayCommand(message('=play https://open.spotify.com/playlist/abc')), true);
    assert.equal(isPlayCommand(message('شوف https://example.com شغل')), false);
    assert.equal(isPlayCommand(message('شغل https://example.com', 1)), false);
  });

  test('GIFs are allowed for everyone, other links around them are not', () => {
    assert.equal(hasMediaContent(message('https://tenor.com/view/cat-gif-123')), false);
    assert.equal(hasMediaContent(message('ههه https://media.tenor.com/abc/x.gif')), false);
    assert.equal(hasMediaContent(message('https://giphy.com/gifs/funny-abc')), false);
    assert.equal(hasMediaContent(message('https://media.discordapp.net/attachments/1/2/a.gif?ex=1')), false);
    assert.equal(hasMediaContent(message('https://tenor.com/view/a https://youtube.com/x')), true);
    assert.equal(hasMediaContent(message('https://tenor.com.evil.com/x')), true);
    assert.equal(hasMediaContent(message('https://evil.com/tenor.com/x')), true);
    assert.equal(hasMediaContent(message('https://scam.com/?a.gif')), true);
  });

  test('plain text is not media', () => {
    assert.equal(hasMediaContent(message('ازيك يا جماعة')), false);
    assert.equal(hasMediaContent(message('3.5 ساعة')), false);
  });

  test('creates the media role right below chaos, locks files for @everyone and chaos, keeps GIF embeds', async () => {
    const mediaBits = new PermissionsBitField(MEDIA_PERMISSIONS);
    const role = (id, position, permissions) => ({
      id, position, name: id, managed: false, editable: true,
      permissions: new PermissionsBitField(permissions),
      async setPermissions(value) { this.permissions = new PermissionsBitField(value); },
      async setPosition(value) { this.position = value; },
    });
    // @everyone had Embed Links taken away by the old lock: it gets it back so GIFs show.
    const everyone = role('everyone', 0, [PermissionFlagsBits.AttachFiles]);
    const chaos = role(CHAOS_ROLE_ID, 3, mediaBits);
    let media;
    const roles = new Map([[everyone.id, everyone], [chaos.id, chaos]]);
    roles.find = (fn) => [...roles.values()].find(fn);
    const guild = {
      name: 'test',
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 10 } } } },
      roles: {
        everyone,
        fetch: async () => roles,
        create: async ({ name, permissions }) => { media = { ...role(name, 1, permissions) }; return media; },
      },
    };

    const result = await ensureMediaRole(guild);
    assert.deepEqual(result, { created: true, positioned: true, locked: 2 });
    assert.equal(media.name, 'media');
    assert.equal(media.permissions.has(MEDIA_PERMISSIONS), true);
    assert.equal(media.position, chaos.position - 1);
    assert.equal(everyone.permissions.has(PermissionFlagsBits.AttachFiles), false);
    assert.equal(everyone.permissions.has(PermissionFlagsBits.EmbedLinks), true);
    assert.equal(chaos.permissions.has(PermissionFlagsBits.AttachFiles), false);
  });

  test('an existing media role and @everyone / chaos are never changed back', async () => {
    const role = (id, position, permissions) => ({
      id, position, name: id, managed: false, editable: true,
      permissions: new PermissionsBitField(permissions),
      async setPermissions() { throw new Error('must not change permissions'); },
      async setPosition() { throw new Error('must not move'); },
    });
    // The owner moved media above chaos, gave chaos Attach Files and took Embed Links off media.
    const everyone = role('everyone', 0, [PermissionFlagsBits.AttachFiles]);
    const chaos = role(CHAOS_ROLE_ID, 3, [PermissionFlagsBits.AttachFiles]);
    const media = role('media', 4, [PermissionFlagsBits.AttachFiles]);
    const roles = new Map([[everyone.id, everyone], [chaos.id, chaos], [media.id, media]]);
    roles.find = (fn) => [...roles.values()].find(fn);
    const guild = {
      name: 'test',
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 10 } } } },
      roles: { everyone, fetch: async () => roles },
    };

    assert.deepEqual(await ensureMediaRole(guild), { created: false, positioned: false, locked: 0 });
    assert.equal(media.position, 4);
  });

  test('gives the media role to every current member once, skipping bots', async () => {
    const store = new Map();
    const media = { id: 'media-role', name: 'media', managed: false, editable: true };
    const member = (id, { bot = false, hasMedia = false } = {}) => {
      const ids = new Set(hasMedia ? [media.id] : []);
      return { user: { tag: id, bot }, roles: { cache: { has: (roleId) => ids.has(roleId) }, add: async (role) => { ids.add(role.id); } }, ids };
    };
    const members = new Map([['a', member('a')], ['b', member('b', { hasMedia: true })], ['bot', member('bot', { bot: true })]]);
    const guild = {
      id: 'g1',
      name: 'test',
      client: { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } },
      roles: { cache: { find: (fn) => [media].find(fn) } },
      members: { fetch: async () => members },
    };

    assert.deepEqual(await grantMediaRoleToAllMembers(guild), { skipped: false, granted: 1, failed: 0 });
    assert.equal(members.get('a').ids.has(media.id), true);
    assert.equal(members.get('bot').ids.has(media.id), false);

    members.set('late', member('late'));
    assert.deepEqual(await grantMediaRoleToAllMembers(guild), { skipped: true, granted: 0, failed: 0 });
    assert.equal(members.get('late').ids.has(media.id), false);
  });
});
