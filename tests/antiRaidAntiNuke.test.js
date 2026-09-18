import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent } from 'discord.js';

import antiRaidBanAddEvent from '../src/events/antiRaidBanAdd.js';
import { handleAntiRaidCommand, inspectMemberRemoval, isTrusted } from '../src/utils/antiRaid.js';
import { findRecentAuditEntry } from '../src/utils/antiNukeLogging.js';
import { handleUntrustedBotJoin } from '../src/utils/antiRaidBots.js';

test('anti-raid and anti-nuke modules import correctly', async () => {
  const modules = await Promise.all([
    import('../src/utils/antiRaid.js'),
    import('../src/utils/antiNukeLogging.js'),
    import('../src/utils/antiRaidBots.js'),
    import('../src/events/antiRaidMemberRemove.js'),
    import('../src/events/antiRaidMessageDelete.js'),
    import('../src/events/antiRaidChannelDelete.js'),
    import('../src/events/antiRaidRoleDelete.js'),
    import('../src/events/antiRaidRoleUpdate.js'),
    import('../src/events/antiRaidMessageCreate.js'),
    import('../src/events/antiNukeMemberRemoveLog.js'),
    import('../src/events/antiNukeMessageDeleteLog.js'),
    import('../src/events/antiNukeChannelDeleteLog.js'),
    import('../src/events/antiNukeRoleDeleteLog.js'),
    import('../src/events/antiNukeRoleUpdateLog.js'),
    import('../src/events/antiNukeBotJoinLog.js'),
    import('../src/events/antiNukeTrustLog.js'),
    import('../src/events/guildMemberAdd.js'),
  ]);

  assert.equal(modules.length, 17);
});

test('GuildBanAdd handler uses AuditLogEvent.MemberBanAdd path', async () => {
  let requestedType = null;

  const guild = {
    id: 'guild-ban-path',
    ownerId: 'owner',
    client: { db: { get: async () => ({ trustedUserIds: [], trustedRoleIds: [] }) } },
    members: {
      me: { id: 'bot', roles: { highest: { position: 100 } } },
      fetch: async () => null,
      cache: new Map(),
    },
    fetchAuditLogs: async ({ type }) => {
      requestedType = type;
      return {
        entries: new Map([
          ['1', {
            id: '1',
            target: { id: 'target-user' },
            executor: { id: 'executor' },
            createdTimestamp: Date.now(),
          }],
        ]),
      };
    },
  };

  await antiRaidBanAddEvent.execute({ guild, user: { id: 'target-user' } });
  assert.equal(requestedType, AuditLogEvent.MemberBanAdd);
});

test('isTrusted resolves trusted roles even if member is not in cache', async () => {
  let fetched = false;
  const guild = {
    id: 'guild-trust-role',
    client: {
      db: {
        get: async () => ({ trustedUserIds: [], trustedRoleIds: ['trusted-role'] }),
      },
    },
    members: {
      cache: new Map(),
      fetch: async () => {
        fetched = true;
        return {
          roles: {
            cache: [{ id: 'trusted-role' }],
          },
        };
      },
    },
  };

  const trusted = await isTrusted(guild, 'member-id');
  assert.equal(trusted, true);
  assert.equal(fetched, true);
});

test('trusted bots are allowed to join without anti-raid punishment', async () => {
  let banned = false;
  let kicked = false;

  const guild = {
    id: 'guild-trusted-bot',
    ownerId: 'owner',
    client: {
      db: {
        get: async () => ({ trustedUserIds: ['trusted-bot'], trustedRoleIds: [] }),
      },
    },
    members: {
      me: {
        id: 'self-bot',
        permissions: { has: () => true },
        roles: { highest: { position: 100 } },
      },
    },
  };

  const member = {
    id: 'trusted-bot',
    guild,
    user: { bot: true, tag: 'trusted#0001' },
    roles: { cache: [] },
    bannable: true,
    kickable: true,
    ban: async () => { banned = true; },
    kick: async () => { kicked = true; },
  };

  const blocked = await handleUntrustedBotJoin(member);
  assert.equal(blocked, false);
  assert.equal(banned, false);
  assert.equal(kicked, false);
});

test('findRecentAuditEntry matches event type and target in freshness window', async () => {
  const freshEntry = {
    id: 'fresh',
    action: AuditLogEvent.RoleDelete,
    target: { id: 'role-1' },
    executor: { id: 'executor-1', bot: false },
    createdTimestamp: Date.now(),
  };
  const staleEntry = {
    id: 'stale',
    action: AuditLogEvent.RoleDelete,
    target: { id: 'role-1' },
    executor: { id: 'executor-2', bot: false },
    createdTimestamp: Date.now() - 60_000,
  };

  const guild = {
    members: { me: { id: 'self-bot' } },
    fetchAuditLogs: async ({ type }) => ({
      entries: new Map(type === AuditLogEvent.RoleDelete
        ? [['fresh', freshEntry], ['stale', staleEntry]]
        : []),
    }),
  };

  const result = await findRecentAuditEntry(guild, AuditLogEvent.RoleDelete, 'role-1');
  assert.equal(result?.id, 'fresh');
});

test('trusted non-owner can run تراست and add bot/user trust', async () => {
  let storedTrust = { trustedUserIds: ['trusted-manager'], trustedRoleIds: [] };
  let setCalled = false;

  const message = {
    content: 'تراست   <@123456789012345678>',
    author: { id: 'trusted-manager' },
    member: { roles: { cache: [] } },
    guild: {
      id: 'guild-trust-command',
      ownerId: 'server-owner',
      roles: { cache: { get: () => null } },
      members: {
        cache: new Map(),
        fetch: async () => null,
      },
      client: {
        db: {
          get: async () => storedTrust,
          set: async (_key, value) => {
            setCalled = true;
            storedTrust = value;
          },
        },
      },
    },
    client: {
      users: {
        fetch: async id => ({ id, toString: () => `<@${id}>` }),
      },
    },
    channel: { send: async () => {} },
  };

  const handled = await handleAntiRaidCommand(message);
  assert.equal(handled, true);
  assert.equal(setCalled, true);
  assert.equal(storedTrust.trustedUserIds.includes('123456789012345678'), true);
});

test('untrusted non-owner cannot run انتراست', async () => {
  let setCalled = false;
  let sentText = '';

  const message = {
    content: 'انتراست <@123456789012345678>',
    author: { id: 'random-user' },
    member: { roles: { cache: [] } },
    guild: {
      id: 'guild-antitrust-command',
      ownerId: 'server-owner',
      roles: { cache: { get: () => null } },
      members: {
        cache: new Map(),
        fetch: async () => null,
      },
      client: {
        db: {
          get: async () => ({ trustedUserIds: [], trustedRoleIds: [] }),
          set: async () => { setCalled = true; },
        },
      },
    },
    client: {
      users: {
        fetch: async id => ({ id, toString: () => `<@${id}>` }),
      },
    },
    channel: { send: async text => { sentText = text; } },
  };

  const handled = await handleAntiRaidCommand(message);
  assert.equal(handled, true);
  assert.equal(setCalled, false);
  assert.match(sentText, /مالك السيرفر أو مستخدم موثوق/);
});
