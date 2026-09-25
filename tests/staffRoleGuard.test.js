import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import '../src/utils/embeds.js';
import { guardStaffRoleUpdate, synchronizeStaffRoles, ROLE_DEFINITIONS } from '../src/services/staffRoleHierarchyService.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';

const OWNER = SERVER_OWNER_IDS[0];
let roleSeq = 0;

function memoryDb() {
  const store = new Map();
  return { get: async (key, fallback) => (store.has(key) ? structuredClone(store.get(key)) : fallback), set: async (key, value) => store.set(key, structuredClone(value)) };
}

function setup({ editorId } = {}) {
  // A fresh role id per test: the guard remembers the roles the bot itself just edited.
  const roleId = `r${++roleSeq}`;
  const client = { user: { id: 'bot' }, db: memoryDb() };
  const edits = [];
  const guild = {
    id: `g${++roleSeq}`, name: 'g', client, channels: { cache: new Map() },
    fetchAuditLogs: async () => {
      const entries = editorId ? [{ id: 'e', target: { id: roleId }, createdTimestamp: Date.now(), executor: { id: editorId, tag: editorId } }] : [];
      return { entries: { find: (fn) => entries.find(fn) } };
    },
  };
  const role = (overrides = {}) => ({
    id: roleId, guild, managed: false, name: '🔨 Moderator', colors: { primaryColor: 0x2ecc71, secondaryColor: null, tertiaryColor: null },
    hoist: true, mentionable: false, permissions: new PermissionsBitField(PermissionFlagsBits.ManageMessages), icon: null, unicodeEmoji: null,
    edit: async (data) => { edits.push(data); },
    ...overrides,
  });
  return { client, guild, edits, role, roleId };
}

describe('staff role guard', () => {
  test('a stranger editing a staff role gets it reverted', async () => {
    const { edits, role } = setup({ editorId: 'stranger' });
    const before = role();
    const after = role({ name: 'hacked', permissions: new PermissionsBitField(PermissionFlagsBits.Administrator) });
    assert.equal(await guardStaffRoleUpdate(before, after, { retryDelayMs: 0 }), 'reverted');
    assert.equal(edits.length, 1);
    assert.equal(edits[0].name, '🔨 Moderator');
    assert.equal(edits[0].permissions, PermissionFlagsBits.ManageMessages);
    assert.equal(edits[0].colors.primaryColor, 0x2ecc71);
  });

  test("a stranger's quick second edit is reverted too, while the bot's own revert is not judged", async () => {
    const { edits, role } = setup({ editorId: 'stranger' });
    const original = role();
    const hacked = role({ hoist: false });
    assert.equal(await guardStaffRoleUpdate(original, hacked, { retryDelayMs: 0 }), 'reverted');
    // The gateway event for the bot's revert, while the audit log still shows the stranger.
    assert.equal(await guardStaffRoleUpdate(hacked, role(), { retryDelayMs: 0 }), 'bot');
    assert.equal(await guardStaffRoleUpdate(role(), role({ mentionable: true }), { retryDelayMs: 0 }), 'reverted');
    assert.equal(edits.length, 2);
  });

  test('an owner edit is kept and the startup sync then leaves that role alone', async () => {
    const { client, guild, edits, role, roleId } = setup({ editorId: OWNER });
    const after = role({ name: '🔨 Mod', permissions: new PermissionsBitField(PermissionFlagsBits.KickMembers) });
    assert.equal(await guardStaffRoleUpdate(role(), after, { retryDelayMs: 0 }), 'kept');
    assert.equal(edits.length, 0);

    // Renamed by the owner, still known as 🔨 Moderator through the saved role id.
    const roles = new Map([[roleId, { ...after, position: 1, edit: async (data) => edits.push(data) }]]);
    roles.find = (fn) => [...roles.values()].find(fn);
    const key = `guild:${guild.id}:config`;
    const stored = await client.db.get(key, {});
    assert.deepEqual(stored.staffRolesKeptByOwner, [roleId]);
    await client.db.set(key, { ...stored, staffRoleIds: { '🔨 Moderator': roleId } });
    const syncGuild = {
      ...guild,
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: { position: 50 } } }, fetchMe: async () => ({ roles: { highest: { position: 50 } } }) },
      roles: { fetch: async () => roles, setPositions: async () => {}, create: async (options) => ({ ...options, id: `new${options.name}`, managed: false, position: 1 }) },
    };
    const summary = await synchronizeStaffRoles(syncGuild);
    assert.equal(summary.kept, 1);
    assert.equal(summary.created, ROLE_DEFINITIONS.length - 1);
    assert.equal(edits.length, 0);
  });

  test("the bot's own edits, position-only moves and other roles are ignored", async () => {
    const bot = setup({ editorId: 'bot' });
    assert.equal(await guardStaffRoleUpdate(bot.role(), bot.role({ hoist: false }), { retryDelayMs: 0 }), 'bot');
    const stranger = setup({ editorId: 'stranger' });
    assert.equal(await guardStaffRoleUpdate(stranger.role({ position: 3 }), stranger.role({ position: 4 }), { retryDelayMs: 0 }), 'ignored');
    assert.equal(await guardStaffRoleUpdate(stranger.role({ name: 'Members' }), stranger.role({ name: 'Members', hoist: false }), { retryDelayMs: 0 }), 'ignored');
    assert.equal(bot.edits.length + stranger.edits.length, 0);
  });

  test('an edit with no audit entry is left as is', async () => {
    const { edits, role } = setup();
    assert.equal(await guardStaffRoleUpdate(role(), role({ hoist: false }), { retryDelayMs: 0 }), 'unknown');
    assert.equal(edits.length, 0);
  });
});
