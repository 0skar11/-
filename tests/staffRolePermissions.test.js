import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import '../src/utils/embeds.js';
import { ROLE_DEFINITIONS, synchronizeStaffRoles } from '../src/services/staffRoleHierarchyService.js';
import { memberHasModerationCommandAccess } from '../src/utils/permissionGuard.js';

const permissionsOf = (name) => new PermissionsBitField(ROLE_DEFINITIONS.find((definition) => definition.name === name).permissions);
const VOICE = [PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.ModerateMembers];

describe('staff role permissions', () => {
  test('Head Admin is Administrator', () => {
    assert.ok(permissionsOf('⚡ Head Admin').has(PermissionFlagsBits.Administrator, false));
  });

  test('Admin has every permission except Administrator', () => {
    const admin = permissionsOf('🛡️ Admin');
    assert.equal(admin.has(PermissionFlagsBits.Administrator, false), false);
    assert.equal(admin.bitfield | PermissionFlagsBits.Administrator, PermissionsBitField.All);
  });

  for (const name of ['🔨 Moderator', '🔰 Trial Moderator']) {
    test(`${name} can disconnect, mute, deafen and timeout but not ban or kick`, () => {
      const permissions = permissionsOf(name);
      assert.ok(permissions.has(VOICE, false));
      assert.equal(permissions.any([PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.Administrator], false), false);
    });
  }

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
