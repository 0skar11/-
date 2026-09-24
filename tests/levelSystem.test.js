import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isMilestone, progressBar, buildLevelUpMessage, buildRankEmbed, buildTopEmbed } from '../src/services/leveling/levelUi.js';
import { rollXp } from '../src/services/leveling/messageXp.js';

const member = { id: '42', displayName: 'زتونه', toString: () => '<@42>', displayAvatarURL: () => 'https://cdn/a.png' };

describe('level system', () => {
  test('only every 5th level pings', () => {
    assert.equal(isMilestone(3, 4), false);
    assert.equal(isMilestone(4, 5), true);
    assert.equal(isMilestone(8, 11), true); // jumped over 10
    assert.equal(isMilestone(10, 11), false);
  });

  test('a normal level-up shows the mention without pinging', () => {
    const message = buildLevelUpMessage(member, { fromLevel: 6, level: 7, xp: 10, xpNeeded: 400 });
    assert.equal(message.content, null);
    assert.deepEqual(message.allowedMentions, { parse: [] });
    assert.match(message.embeds[0].description, /<@42> وصل \*\*لفل 7\*\*/u);
    assert.match(message.embeds[0].footer.text, /لفل 10/u);
  });

  test('every 5 levels the member is pinged', () => {
    const message = buildLevelUpMessage(member, { fromLevel: 9, level: 10, xp: 0, xpNeeded: 1050, rewardRoleIds: ['99'] });
    assert.equal(message.content, '<@42>');
    assert.deepEqual(message.allowedMentions, { users: ['42'] });
    assert.match(message.embeds[0].title, /لفل 10/u);
    assert.match(message.embeds[0].description, /<@&99>/u);
  });

  test('progress bar and cards', () => {
    assert.equal(progressBar(50, 100, 10), '▰▰▰▰▰▱▱▱▱▱ 50%');
    assert.equal(progressBar(500, 100, 4), '▰▰▰▰ 100%');
    const rank = buildRankEmbed(member, { level: 3, xp: 40, totalXp: 900, xpNeeded: 245, position: 2, rankedCount: 8 });
    assert.equal(rank.fields[1].value, '**#2** من 8');
    const top = buildTopEmbed({ name: 'void' }, [{ userId: '1', level: 9, totalXp: 5000 }, { userId: '2', level: 4, totalXp: 900 }], { callerId: '3', callerEntry: null });
    assert.match(top.description, /🥇 <@1> — لفل \*\*9\*\*/u);
    assert.match(top.description, /لسه مش في الترتيب/u);
  });

  test('chat XP stays within the configured range and multiplier', () => {
    assert.equal(rollXp({ xpPerMessage: { min: 15, max: 25 } }, () => 0), 15);
    assert.equal(rollXp({ xpPerMessage: { min: 15, max: 25 } }, () => 0.999), 25);
    assert.equal(rollXp({ xpPerMessage: { min: 10, max: 10 }, xpMultiplier: 2 }, () => 0.5), 20);
  });
});
