import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { buildPunishmentDm, sendPunishmentDm } from '../src/services/moderation/punishmentDm.js';
import { ModerationService } from '../src/services/moderation/moderationService.js';

const guild = { id: 'g', name: 'Chaos', iconURL: () => null, vanityURLCode: 'chaos' };

describe('ban / kick DM (report #133)', () => {
  test('says what happened and why, without naming the moderator', () => {
    const ban = buildPunishmentDm(guild, 'ban', 'سبام');
    assert.match(ban.embeds[0].description, /بان[\s\S]*Chaos[\s\S]*السبب:\*\* سبام/u);
    assert.equal(ban.components.length, 0);
    const kick = buildPunishmentDm(guild, 'kick', 'شتيمة', 'https://discord.gg/chaos');
    assert.match(kick.embeds[0].description, /كيك/u);
    assert.equal(kick.components.length, 1);
  });

  test('closed DMs never stop the punishment, and bots are not messaged', async () => {
    assert.equal(await sendPunishmentDm(guild, { id: 'u', send: async () => { throw new Error('Cannot send messages to this user'); } }, 'ban', 'x'), false);
    assert.equal(await sendPunishmentDm(guild, { id: 'b', bot: true, send: async () => { throw new Error('no'); } }, 'kick', 'x'), false);
    assert.equal(await sendPunishmentDm(guild, { id: 'u', send: async () => {} }, 'warn', 'x'), false);
  });

  test('the DM is sent before the ban and the kick', async () => {
    const order = [];
    const user = { id: '200000000000000001', tag: 'u', send: async () => order.push('dm') };
    const moderator = { id: '200000000000000002', user: { tag: 'mod' }, permissions: new PermissionsBitField(PermissionsBitField.All) };
    const g = {
      ...guild,
      ownerId: moderator.id,
      client: { db: { get: async (k, f) => f, set: async () => true } },
      members: { fetch: async () => null, ban: async () => order.push('ban') },
      channels: { cache: new Map() },
    };
    await ModerationService.banUser({ guild: g, user, moderator, reason: 'r' }).catch(() => {});
    assert.deepEqual(order.slice(0, 2), ['dm', 'ban']);

    order.length = 0;
    const member = { id: user.id, user, kickable: true, kick: async () => order.push('kick'), roles: { highest: { position: 0 } }, guild: g };
    const orig = ModerationService.assertModerationHierarchy;
    ModerationService.assertModerationHierarchy = () => {};
    try {
      await ModerationService.kickUser({ guild: g, member, moderator, reason: 'r' }).catch(() => {});
    } finally {
      ModerationService.assertModerationHierarchy = orig;
    }
    assert.deepEqual(order.slice(0, 2), ['dm', 'kick']);
  });
});
