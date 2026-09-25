import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { LEVEL_TIERS, LEVEL_ROLES_ABOVE_ROLE_ID, ensureLevelTierRoles, offsetToSitAbove, sortRolesBottomUp } from '../src/services/leveling/levelTierRoles.js';
import { CHAOS_ROLE_ID } from '../src/services/mediaRoleService.js';
import { getLevelingConfig } from '../src/services/leveling/leveling.js';
import { ROLE_DEFINITIONS, deleteRetiredRoles, isRetiredRoleName } from '../src/services/staffRoleHierarchyService.js';
import { buildSavedIdeasEmbed, isSavedIdeasBoard } from '../src/services/savedIdeasBoardService.js';
import { SAVED_IDEAS } from '../src/config/savedIdeas.js';

// A guild whose setPosition moves roles the same way discord.js does (index in the bottom-up list).
function mockGuild(initial) {
  let nextId = 900000000000000000n;
  const cache = new Map();
  const renumber = (ordered) => ordered.forEach((role, index) => { role.position = index; });
  const makeRole = ({ id, name, position, editable = true }) => {
    const role = {
      id, name, position, editable, managed: false, color: 0,
      async edit({ color }) { this.color = parseInt(color.slice(1), 16); },
      async setPosition(offset, { relative }) {
        assert.equal(relative, true);
        const ordered = sortRolesBottomUp(cache.values());
        const index = ordered.indexOf(this);
        ordered.splice(index, 1);
        ordered.splice(index + offset, 0, this);
        renumber(ordered);
      },
    };
    cache.set(id, role);
    return role;
  };
  initial.forEach(makeRole);
  const guild = {
    id: 'g-tiers', name: 'test',
    members: { me: { permissions: new PermissionsBitField([PermissionFlagsBits.ManageRoles]) } },
    roles: {
      cache,
      fetch: async () => cache,
      create: async ({ name, color }) => {
        // New roles start at the bottom, just above @everyone.
        for (const role of cache.values()) if (role.position >= 1) role.position += 1;
        const role = makeRole({ id: String(nextId++), name, position: 1 });
        role.color = parseInt(color.slice(1), 16);
        return role;
      },
    },
  };
  return guild;
}

const store = new Map();
const client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => store.set(key, value) } };

describe('level roles above role 1551151228833234985', () => {
  test('emojis and colours are different from the staff roles', () => {
    const staffEmojis = ROLE_DEFINITIONS.map((definition) => definition.name.split(' ')[0]);
    const staffColors = ROLE_DEFINITIONS.map((definition) => definition.color.toLowerCase());
    for (const tier of LEVEL_TIERS) {
      assert.ok(!staffEmojis.includes(tier.name.split(' ')[0]), `${tier.name} uses a staff emoji`);
      assert.ok(!staffColors.includes(tier.color.toLowerCase()), `${tier.name} uses a staff colour`);
    }
    assert.equal(new Set(LEVEL_TIERS.map((tier) => tier.name.split(' ')[0])).size, LEVEL_TIERS.length);
    assert.deepEqual(LEVEL_TIERS.map((tier) => tier.level), [...LEVEL_TIERS.map((tier) => tier.level)].sort((a, b) => a - b));
  });

  test('offsetToSitAbove moves up and down correctly', () => {
    assert.equal(offsetToSitAbove(['e', 'x', 'a', 'c'], 'x', 'c'), 2);
    assert.equal(offsetToSitAbove(['e', 'c', 'a', 'x'], 'x', 'c'), -1);
    assert.equal(offsetToSitAbove(['e', 'c', 'x', 'a'], 'x', 'c'), 0);
  });

  test('creates every tier, stacks them in order right above the anchor role and saves them as rewards', async () => {
    const guild = mockGuild([
      { id: '100000000000000000', name: '@everyone', position: 0 },
      { id: '100000000000000001', name: 'media', position: 1 },
      { id: CHAOS_ROLE_ID, name: 'chaos', position: 2 },
      { id: LEVEL_ROLES_ABOVE_ROLE_ID, name: 'anchor', position: 3 },
      { id: '100000000000000003', name: '🔰 Trial Moderator', position: 4 },
      { id: '100000000000000004', name: 'Bot', position: 5 },
    ]);
    const summary = await ensureLevelTierRoles(client, guild);
    assert.equal(summary.created, LEVEL_TIERS.length);
    assert.equal(summary.rewardsSaved, true);

    const names = sortRolesBottomUp(guild.roles.cache.values()).map((role) => role.name);
    assert.deepEqual(names, ['@everyone', 'media', 'chaos', 'anchor', ...LEVEL_TIERS.map((tier) => tier.name), '🔰 Trial Moderator', 'Bot']);

    const rewards = (await getLevelingConfig(client, guild.id)).roleRewards;
    for (const tier of LEVEL_TIERS) {
      assert.equal(guild.roles.cache.get(rewards[tier.level]).name, tier.name);
    }

    // A second startup changes nothing.
    const again = await ensureLevelTierRoles(client, guild);
    assert.deepEqual(again, { created: 0, moved: 0, rewardsSaved: false });
  });

  test('puts a tier that was moved out of place back in order', async () => {
    const guild = mockGuild([
      { id: '100000000000000000', name: '@everyone', position: 0 },
      { id: LEVEL_ROLES_ABOVE_ROLE_ID, name: 'anchor', position: 1 },
      { id: '100000000000000004', name: 'Bot', position: 2 },
    ]);
    await ensureLevelTierRoles(client, guild);
    const level50 = [...guild.roles.cache.values()].find((role) => role.name === '🔥 Level 50');
    await level50.setPosition(-level50.position + 1, { relative: true }); // dragged below the anchor role
    const summary = await ensureLevelTierRoles(client, guild);
    assert.equal(summary.moved >= 1, true);
    const names = sortRolesBottomUp(guild.roles.cache.values()).map((role) => role.name);
    assert.deepEqual(names, ['@everyone', 'anchor', ...LEVEL_TIERS.map((tier) => tier.name), 'Bot']);
  });
});

describe('Event Manager removed', () => {
  test('is no longer a staff role and any spelling of it is deleted', async () => {
    assert.ok(!ROLE_DEFINITIONS.some((definition) => isRetiredRoleName(definition.name)));
    for (const name of ['📢 Event Manager', 'Event Manager', 'event manger']) assert.equal(isRetiredRoleName(name), true);
    assert.equal(isRetiredRoleName('🔨 Moderator'), false);

    const deleted = [];
    const role = (id, name) => ({ id, name, managed: false, editable: true, delete: async () => deleted.push(name) });
    const roles = new Map([['1', role('1', '📢 Event Manager')], ['2', role('2', '🔨 Moderator')]]);
    const guild = { roles: { fetch: async (id) => (id ? null : roles) } };
    assert.equal(await deleteRetiredRoles(guild), 1);
    assert.deepEqual(deleted, ['📢 Event Manager']);
  });
});

describe('saved ideas in the trusted channel', () => {
  test('lists every saved idea and is told apart from the trusted board', () => {
    const embed = buildSavedIdeasEmbed();
    assert.equal(embed.fields.length, SAVED_IDEAS.length);
    assert.ok(embed.fields[0].name.startsWith('1. '));
    assert.equal(isSavedIdeasBoard({ embeds: [embed] }), true);
    assert.equal(isSavedIdeasBoard({ embeds: [{ title: 'Trusted' }] }), false);
  });
});
