import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { HOME_GUILD_ID } from '../src/config/homeGuild.js';
import {
  SERVER_LOG_SETTINGS, logMessageDelete, logBulkDelete, logMemberRoles, logTimeout, logBan, logUnban, logJoin, logLeave,
  logRoleUpdate, logWarning,
} from '../src/services/logging/serverLogs.js';

const MOD = '200000000000000009';
const MEMBER = '200000000000000001';
const KEYS = ['moderation', 'timeout', 'ban', 'message', 'roles', 'join', 'leave'];

function setup({ guildId = HOME_GUILD_ID, audit = [] } = {}) {
  const sent = Object.fromEntries(KEYS.map((key) => [key, []]));
  const channels = new Map(KEYS.map((key, index) => [`70000000000000000${index}`, { send: async (payload) => { sent[key].push(payload.embeds[0]); return {}; } }]));
  const auditChannels = Object.fromEntries(KEYS.map((key, index) => [key, `70000000000000000${index}`]));
  const guild = {
    id: guildId, memberCount: 42,
    client: { user: { id: 'bot' }, db: { get: async (key, fallback) => (key.includes(':config') ? { auditChannels } : fallback), set: async () => true } },
    channels: { cache: channels, fetch: async () => null },
    fetchAuditLogs: async ({ type }) => ({ entries: audit.filter((entry) => entry.type === type).map((entry) => ({ createdTimestamp: Date.now(), ...entry })) }),
  };
  return { guild, sent };
}

const user = (id, extra = {}) => ({ id, tag: `u${id.slice(-2)}`, bot: false, displayAvatarURL: () => null, ...extra });
const roleOf = (id, name) => ({ id, name });

describe('the Logs category channels (owner\'s request)', () => {
  before(() => { SERVER_LOG_SETTINGS.auditRetryMs = 0; });

  test('a deleted message is logged with who deleted it; the bot\'s own cleanups are not', async () => {
    const byMod = setup({ audit: [{ type: AuditLogEvent.MessageDelete, target: { id: MEMBER }, executor: user(MOD), extra: { channel: { id: 'c1' } } }] });
    const message = { guild: byMod.guild, author: user(MEMBER), channelId: 'c1', content: 'رسالة', createdTimestamp: Date.now(), attachments: new Map() };
    assert.equal(await logMessageDelete(message), true);
    assert.match(byMod.sent.message[0].description, new RegExp(`بواسطة: <@${MOD}>`));
    assert.match(byMod.sent.message[0].description, /رسالة/u);

    const byBot = setup({ audit: [{ type: AuditLogEvent.MessageDelete, target: { id: MEMBER }, executor: user('bot'), extra: { channel: { id: 'c1' } } }] });
    assert.equal(await logMessageDelete({ ...message, guild: byBot.guild }), false);
    assert.equal(await logMessageDelete({ ...message, guild: byBot.guild, author: user('300000000000000001', { bot: true }) }), false);

    const purge = setup({ audit: [{ type: AuditLogEvent.MessageBulkDelete, target: { id: 'c1' }, executor: user(MOD) }] });
    assert.equal(await logBulkDelete(new Map([[1, {}], [2, {}]]), { id: 'c1', guild: purge.guild }), true);
    assert.match(purge.sent.message[0].description, /\*\*2\*\*/u);
  });

  test('roles given and taken, timeouts and bans, with who did it', async () => {
    const { guild, sent } = setup({
      audit: [
        { type: AuditLogEvent.MemberRoleUpdate, target: { id: MEMBER }, executor: user(MOD), changes: [{ key: '$add', new: [{ id: 'r1' }] }] },
        { type: AuditLogEvent.MemberUpdate, target: { id: MEMBER }, executor: user(MOD), reason: 'سبام', changes: [{ key: 'communication_disabled_until' }] },
        { type: AuditLogEvent.MemberBanAdd, target: { id: MEMBER }, executor: user(MOD), reason: 'تخريب' },
      ],
    });
    const oldMember = { guild, id: MEMBER, user: user(MEMBER), roles: { cache: new Map([['r2', roleOf('r2', 'Old')]]) }, communicationDisabledUntilTimestamp: null };
    const newMember = { guild, id: MEMBER, user: user(MEMBER), roles: { cache: new Map([['r1', roleOf('r1', 'New')]]) }, communicationDisabledUntilTimestamp: Date.now() + 60_000 };
    assert.equal(await logMemberRoles(oldMember, newMember), true);
    assert.match(sent.roles[0].description, /➕ اتضافت: <@&r1>/u);
    assert.match(sent.roles[0].description, /➖ اتشالت: <@&r2>/u);
    assert.equal(await logTimeout(oldMember, newMember), true);
    assert.match(sent.timeout[0].description, /سبام/u);
    assert.equal(await logTimeout(newMember, { ...newMember, communicationDisabledUntilTimestamp: null }), true);
    assert.match(sent.timeout[1].title, /اتفك/u);
    assert.equal(await logBan({ guild, user: user(MEMBER) }), true);
    assert.match(sent.ban[0].description, /تخريب/u);
    assert.equal(await logUnban({ guild, user: user(MEMBER) }), true);
  });

  test('join and leave; a kick also goes to moderation; warnings are copied there', async () => {
    const { guild, sent } = setup({ audit: [{ type: AuditLogEvent.MemberKick, target: { id: MEMBER }, executor: user(MOD), reason: 'قلة أدب' }] });
    assert.equal(await logJoin({ guild, id: MEMBER, user: user(MEMBER, { createdTimestamp: Date.now() - 1000 }) }), true);
    assert.match(sent.join[0].description, /حساب جديد/u);
    assert.equal(await logLeave({ guild, id: MEMBER, user: user(MEMBER), joinedTimestamp: Date.now() - 5000, roles: { cache: new Map([['r1', roleOf('r1', 'X')]]) } }), true);
    assert.match(sent.leave[0].title, /اتطرد/u);
    assert.match(sent.moderation[0].description, /قلة أدب/u);
    assert.equal(await logWarning(guild, { title: '⚠️ وارن' }), true);
    assert.equal(sent.moderation[1].title, '⚠️ وارن');
  });

  test('a role\'s name and permissions changing is logged; moving it alone is not', async () => {
    const { guild, sent } = setup();
    const oldRole = { id: 'r1', guild, name: 'Helpers', color: 0, permissions: new PermissionsBitField(0n) };
    const newRole = { ...oldRole, name: 'Mods', permissions: new PermissionsBitField(PermissionsBitField.Flags.BanMembers) };
    assert.equal(await logRoleUpdate(oldRole, newRole), true);
    assert.match(sent.roles[0].description, /Helpers\*\* ← \*\*Mods/u);
    assert.match(sent.roles[0].description, /BanMembers/u);
    assert.equal(await logRoleUpdate(oldRole, { ...oldRole, position: 9 }), false);
  });

  test('another server gets nothing', async () => {
    const { guild, sent } = setup({ guildId: '100000000000000099' });
    assert.equal(await logJoin({ guild, id: MEMBER, user: user(MEMBER) }), false);
    assert.equal(await logBan({ guild, user: user(MEMBER) }), false);
    assert.ok(Object.values(sent).every((list) => list.length === 0));
  });
});
