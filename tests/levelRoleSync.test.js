import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { levelRoleChanges, syncMemberLevelRoles } from '../src/services/leveling/levelRoleSyncService.js';

const rewards = { 5: 'r5', 10: 'r10', 15: 'r15', 20: 'r20' };

function mockMember(held = []) {
  const cache = new Map(held.map((id) => [id, { id }]));
  return {
    id: 'm1',
    roles: {
      cache,
      add: async (role) => { cache.set(role.id, role); },
      remove: async (role) => { cache.delete(role.id); },
    },
  };
}

const guild = {
  id: 'g1',
  roles: { cache: new Map(Object.values(rewards).map((id) => [id, { id }])), fetch: async () => null },
};

describe('level roles are given automatically', () => {
  test('a member only gets the role for the highest level reached', () => {
    const { add, remove } = levelRoleChanges(12, rewards, new Set());
    assert.deepEqual(add.map((entry) => entry.roleId), ['r10']);
    assert.deepEqual(remove, []);
  });

  test('the new level role takes the one before it away', () => {
    const { add, remove } = levelRoleChanges(15, rewards, new Set(['r5', 'r10']));
    assert.deepEqual(add.map((entry) => entry.roleId), ['r15']);
    assert.deepEqual(remove.map((entry) => entry.roleId), ['r5', 'r10']);
  });

  test('roles above the level are only removed when asked', () => {
    assert.deepEqual(levelRoleChanges(7, rewards, new Set(['r5', 'r15'])).remove, []);
    assert.deepEqual(levelRoleChanges(7, rewards, new Set(['r5', 'r15']), { removeAbove: true }).remove.map((entry) => entry.roleId), ['r15']);
  });

  test('reaching level 10 swaps Level 5 for Level 10', async () => {
    const member = mockMember(['r5']);
    const { added, removed } = await syncMemberLevelRoles(guild, member, 10, rewards);
    assert.deepEqual(added, ['r10']);
    assert.deepEqual(removed, ['r5']);
    assert.deepEqual([...member.roles.cache.keys()], ['r10']);
  });

  test('lowering the level gives back the lower role', async () => {
    const member = mockMember(['r20']);
    const { added, removed } = await syncMemberLevelRoles(guild, member, 11, rewards, { removeAbove: true });
    assert.deepEqual(added, ['r10']);
    assert.deepEqual(removed, ['r20']);
    assert.deepEqual([...member.roles.cache.keys()], ['r10']);
  });

  test('below the first level role there is nothing to give', async () => {
    const member = mockMember();
    assert.deepEqual(await syncMemberLevelRoles(guild, member, 3, rewards), { added: [], removed: [] });
  });

  test('a missing role does not stop the others', async () => {
    const member = mockMember(['r5']);
    const { added, removed } = await syncMemberLevelRoles(guild, member, 10, { 5: 'r5', 10: 'gone' });
    assert.deepEqual(added, []);
    assert.deepEqual(removed, ['r5']);
  });
});

describe('the media role comes by itself at level 5', () => {
  const media = { id: 'media-id', name: 'media', managed: false };
  const mediaGuild = {
    id: 'g2',
    roles: { cache: new Map([...Object.values(rewards).map((id) => [id, { id, name: id }]), [media.id, media]]), fetch: async () => null },
  };

  test('level 4 does not get media, level 5 and above do', async () => {
    const low = mockMember();
    await syncMemberLevelRoles(mediaGuild, low, 4, rewards);
    assert.ok(!low.roles.cache.has('media-id'));

    const five = mockMember();
    const { added } = await syncMemberLevelRoles(mediaGuild, five, 5, rewards);
    assert.deepEqual(added.sort(), ['media-id', 'r5']);

    const high = mockMember(['r5', 'r10', 'r15', 'r20']);
    const result = await syncMemberLevelRoles(mediaGuild, high, 30, rewards);
    assert.deepEqual(result.added, ['media-id']);
    assert.deepEqual(result.removed, ['r5', 'r10', 'r15']);
    assert.deepEqual([...high.roles.cache.keys()].sort(), ['media-id', 'r20']);
  });

  test('media stays when the level role is swapped', async () => {
    const member = mockMember(['r5', 'media-id']);
    const { added, removed } = await syncMemberLevelRoles(mediaGuild, member, 10, rewards);
    assert.deepEqual(added, ['r10']);
    assert.deepEqual(removed, ['r5']);
    assert.ok(member.roles.cache.has('media-id'));
  });

  test('media is never taken away when a level goes down', async () => {
    const member = mockMember(['r5', 'media-id']);
    const { removed } = await syncMemberLevelRoles(mediaGuild, member, 2, rewards, { removeAbove: true });
    assert.deepEqual(removed, ['r5']);
    assert.ok(member.roles.cache.has('media-id'));
  });

  test('media still comes with no level rewards set', async () => {
    const member = mockMember();
    assert.deepEqual((await syncMemberLevelRoles(mediaGuild, member, 6, {})).added, ['media-id']);
  });
});
