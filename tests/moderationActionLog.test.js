import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildModerationActionLogEmbed } from '../src/services/moderation/moderationActionLogService.js';
import { NO_REASON } from '../src/utils/moderationCard.js';

const target = { id: '111111111111111111', tag: 'target', displayAvatarURL: () => 'https://cdn/avatar.png' };
const moderator = { id: '222222222222222222', tag: 'mod' };

describe('moderation action log', () => {
  test('shows the member, moderator, reason and duration', () => {
    const embed = buildModerationActionLogEmbed({ action: 'timeout', targetUser: target, moderatorUser: moderator, reason: 'سبام', durationMs: 15 * 60_000 });
    assert.equal(embed.title, '⏳ تايم أوت');
    assert.match(embed.description, /\*\*العضو:\*\* <@111111111111111111> \(target - 111111111111111111\)/);
    assert.match(embed.description, /\*\*الإداري:\*\* <@222222222222222222> \(mod - 222222222222222222\)/);
    assert.match(embed.description, /\*\*السبب:\*\* سبام/);
    assert.match(embed.description, /\*\*المدة:\*\* 15m/);
    assert.doesNotMatch(embed.description, /ريبلاي/);
    assert.equal(embed.thumbnail.url, 'https://cdn/avatar.png');
  });

  test('falls back to the no-reason text', () => {
    const embed = buildModerationActionLogEmbed({ action: 'ban', targetUser: target, moderatorUser: moderator, reason: 'No reason provided' });
    assert.match(embed.description, new RegExp(`\\*\\*السبب:\\*\\* ${NO_REASON}`));
  });

  test('shows the warning count and auto timeout', () => {
    const embed = buildModerationActionLogEmbed({ action: 'warn', targetUser: target, moderatorUser: moderator, reason: 'x', warnings: 3, punishment: '⏳ Timeout 15m' });
    assert.match(embed.description, /\*\*عدد التحذيرات:\*\* 3/);
    assert.match(embed.description, /\*\*العقوبة:\*\* ⏳ Timeout 15m/);
  });
});
