import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'fs/promises';
import { Collection, PermissionsBitField } from 'discord.js';
import { ensureGameRoles, keepGameRolesAtBottom, GAME_ROLES } from '../src/services/gameRolesService.js';

const makeRole = (id, name, position, { color = 0, permissions = 0n, icon = null, editable = true } = {}) => ({
  id, name, position, color, icon, unicodeEmoji: null, managed: false, editable,
  permissions: new PermissionsBitField(permissions),
  async edit(data) {
    if ('color' in data) this.color = data.color;
    if ('permissions' in data) this.permissions = new PermissionsBitField(data.permissions);
    if ('icon' in data) this.icon = data.icon;
    return this;
  },
});

const guildWith = ({ roles = [], features = ['ROLE_ICONS'], permissions = PermissionsBitField.All } = {}) => {
  const everyone = makeRole('guild', '@everyone', 0);
  const cache = new Collection([everyone, ...roles].map((role) => [role.id, role]));
  let next = 100;
  const guild = {
    id: 'guild', name: 'test', features, moves: 0,
    members: { me: { permissions: new PermissionsBitField(permissions) } },
    roles: {
      fetch: async () => cache,
      async create(data) {
        const role = makeRole(String(next++), data.name, cache.size, { color: data.color, icon: data.icon ?? null });
        role.createdWith = data;
        cache.set(role.id, role);
        return role;
      },
      async setPositions(list) {
        guild.moves += 1;
        for (const { role, position } of list) cache.get(role).position = position;
      },
    },
  };
  return { guild, cache };
};

const bottomNames = (cache) => [...cache.values()].filter((role) => role.id !== 'guild')
  .sort((a, b) => b.position - a.position).map((role) => role.name).slice(-GAME_ROLES.length);

describe('game roles', () => {
  test('every game has an emoji file', async () => {
    for (const { icon } of GAME_ROLES) await access(icon);
  });

  test('creates colourless roles with no permissions and their emoji as icon, at the bottom', async () => {
    const { guild, cache } = guildWith({ roles: [makeRole('chaos', 'chaos', 1, { color: 5 })] });
    const result = await ensureGameRoles(guild);
    assert.equal(result.created, GAME_ROLES.length);
    assert.equal(result.icons, GAME_ROLES.length);
    for (const game of GAME_ROLES) {
      const role = [...cache.values()].find((r) => r.name === game.name);
      assert.equal(role.createdWith.color, 0);
      assert.deepEqual(role.createdWith.permissions, []);
      assert.equal(role.createdWith.icon, game.icon);
    }
    assert.deepEqual(bottomNames(cache), GAME_ROLES.map((game) => game.name));
    assert.equal(bottomNames(cache).at(-1), 'Other');
    assert.ok(cache.get('chaos').position > GAME_ROLES.length);
  });

  test('clears colour and permissions of existing roles and leaves a correct setup alone', async () => {
    const { guild, cache } = guildWith({ roles: [makeRole('v', 'valorant', 7, { color: 0xff0000, permissions: PermissionsBitField.Flags.SendMessages })] });
    await ensureGameRoles(guild);
    assert.equal(cache.get('v').color, 0);
    assert.equal(cache.get('v').permissions.bitfield, 0n);
    const again = await ensureGameRoles(guild);
    assert.deepEqual(again, { skipped: false, created: 0, icons: 0, positioned: false, canUseIcons: true });
  });

  test('moves the game roles back under a role created later at the bottom', async () => {
    const { guild, cache } = guildWith({ roles: [makeRole('chaos', 'chaos', 1)] });
    await ensureGameRoles(guild);
    cache.set('new', makeRole('new', 'new role', 1));
    assert.equal(await keepGameRolesAtBottom(guild), true);
    assert.deepEqual(bottomNames(cache), GAME_ROLES.map((game) => game.name));
    assert.ok(cache.get('new').position > GAME_ROLES.length && cache.get('chaos').position > GAME_ROLES.length);
    assert.equal(await keepGameRolesAtBottom(guild), false);
  });

  test('does not move the roles when one is above the bot', async () => {
    const { guild, cache } = guildWith({ roles: [makeRole('chaos', 'chaos', 1), makeRole('v', 'Valorant', 2, { editable: false })] });
    await ensureGameRoles(guild);
    assert.equal(guild.moves, 0);
    assert.equal(cache.get('chaos').position, 1);
  });

  test('puts the new icons on roles that already have an old one, once', async () => {
    const store = new Map();
    const { guild, cache } = guildWith({ roles: [makeRole('v', 'Valorant', 1, { icon: 'old-hash' })] });
    guild.client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } };
    const first = await ensureGameRoles(guild);
    assert.equal(cache.get('v').icon, GAME_ROLES[0].icon);
    assert.equal(first.icons, GAME_ROLES.length);
    cache.get('v').icon = 'discord-hash';
    const again = await ensureGameRoles(guild);
    assert.equal(again.icons, 0);
    assert.equal(cache.get('v').icon, 'discord-hash');
  });

  test('skips icons without the ROLE_ICONS feature', async () => {
    const { guild, cache } = guildWith({ features: [] });
    const result = await ensureGameRoles(guild);
    assert.equal(result.icons, 0);
    assert.ok([...cache.values()].every((role) => !role.createdWith || !('icon' in role.createdWith)));
  });

  test('skips when the bot cannot manage roles', async () => {
    const { guild } = guildWith({ permissions: 0n });
    assert.equal((await ensureGameRoles(guild)).skipped, true);
  });
});
