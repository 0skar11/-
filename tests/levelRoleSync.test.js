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
  test('a member gets every level role they have reached, including missed ones', () => {
    const { add, remove } = levelRoleChanges(12, rewards, new Set(['r10']));
    assert.deepEqual(add.map((entry) => entry.roleId), ['r5']);
    assert.deepEqual(remove, []);
  });

  test('roles above the level are only removed when asked', () => {
    assert.deepEqual(levelRoleChanges(7, rewards, new Set(['r5', 'r15'])).remove, []);
    assert.deepEqual(levelRoleChanges(7, rewards, new Set(['r5', 'r15']), { removeAbove: true }).remove.map((entry) => entry.roleId), ['r15']);
  });

  test('reaching level 10 gives Level 5 and Level 10', async () => {
    const member = mockMember();
    const { added } = await syncMemberLevelRoles(guild, member, 10, rewards);
    assert.deepEqual(added, ['r5', 'r10']);
    assert.ok(member.roles.cache.has('r10'));
    assert.ok(!member.roles.cache.has('r15'));
  });

  test('lowering the level takes the higher roles away', async () => {
    const member = mockMember(['r5', 'r10', 'r15', 'r20']);
    const { removed } = await syncMemberLevelRoles(guild, member, 11, rewards, { removeAbove: true });
    assert.deepEqual(removed, ['r15', 'r20']);
    assert.deepEqual([...member.roles.cache.keys()].sort(), ['r10', 'r5']);
  });

  test('a missing role does not stop the others', async () => {
    const member = mockMember();
    const { added } = await syncMemberLevelRoles(guild, member, 10, { 5: 'gone', 10: 'r10' });
    assert.deepEqual(added, ['r10']);
  });
});
