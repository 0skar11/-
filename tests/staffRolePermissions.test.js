import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import '../src/utils/embeds.js';
import { ROLE_DEFINITIONS, synchronizeStaffRoles } from '../src/services/staffRoleHierarchyService.js';
import { memberHasModerationCommandAccess } from '../src/utils/permissionGuard.js';

const permissionsOf = (name) => new PermissionsBitField(ROLE_DEFINITIONS.find((definition) => definition.name === name).permissions);
const VOICE = [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.ModerateMembers];

describe('staff role permissions', () => {
  test('hierarchy order, highest first', () => {
    assert.deepEqual(ROLE_DEFINITIONS.map((definition) => definition.name), [
      '👑 Owner', '⚡ Head Admin', '🛡️ Admin', '🎖️ Supervisor', '⚔️ Senior Moderator',
      '🔨 Moderator', '💬 Chat Moderator', '🎧 Voice Moderator', '🔰 Trial Moderator', '🎫 Support Staff',
    ]);
  });

  for (const name of ['👑 Owner', '⚡ Head Admin', '🛡️ Admin', '🎖️ Supervisor', '⚔️ Senior Moderator']) {
    test(`${name} is Administrator`, () => {
      assert.ok(permissionsOf(name).has(PermissionFlagsBits.Administrator, false));
    });
  }

  test('Moderator has every permission except Administrator', () => {
    const moderator = permissionsOf('🔨 Moderator');
    assert.equal(moderator.has(PermissionFlagsBits.Administrator, false), false);
    assert.equal(moderator.bitfield | PermissionFlagsBits.Administrator, PermissionsBitField.All);
  });

  test('Chat Moderator can timeout, warn and write notes but not kick or ban', () => {
    const permissions = permissionsOf('💬 Chat Moderator');
    assert.ok(permissions.has([PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages], false));
    assert.equal(permissions.any([PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('Voice Moderator has every voice permission and no chat or member moderation', () => {
    const permissions = permissionsOf('🎧 Voice Moderator');
    assert.ok(permissions.has([...VOICE.filter((flag) => flag !== PermissionFlagsBits.ModerateMembers), PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream], false));
    assert.equal(permissions.any([PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('Trial Moderator can warn, kick, timeout and write notes but not ban', () => {
    const permissions = permissionsOf('🔰 Trial Moderator');
    assert.ok(permissions.has([PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageMessages], false));
    assert.equal(permissions.any([PermissionFlagsBits.BanMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('Support Staff has no moderation permission', () => {
    const permissions = permissionsOf('🎫 Support Staff');
    assert.equal(permissions.any([...VOICE, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
  });

  test('sync grants only what a non-admin bot holds and keeps going after a failed role', async () => {
    const botPermissions = new PermissionsBitField([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewChannel]);
    const created = [];
    const roles = new Map();
    roles.find = () => undefined;
    const guild = {
      name: 'g',
      members: { me: { permissions: botPermissions, roles: { highest: { position: 10 } } }, fetchMe: async () => ({ roles: { highest: { position: 10 } } }) },
      roles: {
        fetch: async () => roles,
        setPositions: async () => {},
        create: async (options) => {
          if (options.name === '⚡ Head Admin') throw new Error('Missing Permissions');
          created.push(options);
          return { ...options, managed: false, position: 1 };
        },
      },
    };
    const summary = await synchronizeStaffRoles(guild);
    assert.equal(summary.created, ROLE_DEFINITIONS.length - 1);
    for (const options of created) assert.equal(options.permissions & ~botPermissions.bitfield, 0n);
  });
});

describe('owner edits to staff roles', () => {
  test('existing staff roles are never edited or moved, even renamed ones', async () => {
    const store = new Map();
    const client = { db: { get: async (key, fallback) => (store.has(key) ? store.get(key) : fallback), set: async (key, value) => { store.set(key, value); return true; } } };
    const untouchable = (id, name, position) => ({
      id, name, position, managed: false, editable: true,
      edit: async () => { throw new Error('must not edit'); },
      setPermissions: async () => { throw new Error('must not edit'); },
      setPosition: async () => { throw new Error('must not move'); },
    });
    const roles = new Map(ROLE_DEFINITIONS.map((definition, index) => [String(index + 1), untouchable(String(index + 1), definition.name, 50 - index)]));
    roles.find = (fn) => [...roles.values()].find(fn);
    const created = [];
    const guild = {
      id: 'g-staff', name: 'g', client,
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 99 } } } },
      roles: { fetch: async () => roles, create: async (options) => { created.push(options); return { ...options, id: 'new', position: 1 }; } },
    };

    assert.deepEqual(await synchronizeStaffRoles(guild), { created: 0, updated: 0, positioned: 0 });
    // The owner renames the first staff role: it is still recognised by its saved ID, no copy is made.
    roles.get('1').name = 'The Boss';
    assert.deepEqual(await synchronizeStaffRoles(guild), { created: 0, updated: 0, positioned: 0 });
    assert.equal(created.length, 0);
  });
});

describe('configured modRole', () => {
  const member = { id: 'm', guild: { ownerId: 'o' }, permissions: new PermissionsBitField(), roles: { cache: new Map([['mod', {}]]) } };
  const config = { modRole: 'mod' };

  test('covers timeout', () => {
    assert.ok(memberHasModerationCommandAccess(member, config, PermissionFlagsBits.ModerateMembers));
  });

  test('never covers ban or kick', () => {
    assert.equal(memberHasModerationCommandAccess(member, config, PermissionFlagsBits.BanMembers), false);
    assert.equal(memberHasModerationCommandAccess(member, config, PermissionFlagsBits.KickMembers), false);
  });
});
