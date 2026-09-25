import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyLevelUps, getSplitXpForLevel, getXpForLevel, getUserLevelData } from '../src/services/leveling/leveling.js';
import { buildRankEmbed, levelRequirementLines } from '../src/services/leveling/levelUi.js';
import { getUserLevelKey } from '../src/utils/database/keys.js';

const member = { id: '42', displayName: 'x', displayAvatarURL: () => '' };

describe('a level needs chat XP and voice XP', () => {
  test('each side needs half of the level XP', () => {
    assert.deepEqual(getSplitXpForLevel(0), { chat: 25, voice: 25 });
    const { chat, voice } = getSplitXpForLevel(7);
    assert.ok(chat + voice >= getXpForLevel(7));
  });

  test('chat alone or voice alone does not level up', () => {
    assert.equal(applyLevelUps({ level: 0, chatXp: 5000, voiceXp: 0 }).level, 0);
    assert.equal(applyLevelUps({ level: 0, chatXp: 0, voiceXp: 5000 }).level, 0);
  });

  test('both filled levels up and keeps the extra', () => {
    const data = applyLevelUps({ level: 0, chatXp: 30, voiceXp: 25 });
    assert.equal(data.level, 1);
    assert.equal(data.chatXp, 5);
    assert.equal(data.voiceXp, 0);
    assert.equal(data.xp, 5);
  });

  test('extra chat XP counts later, but every level still needs voice', () => {
    const data = applyLevelUps({ level: 0, chatXp: 10000, voiceXp: 25 + 30 });
    assert.equal(data.level, 1); // level 1 needs 53 voice XP, only 30 left
    data.voiceXp += 23;
    assert.equal(applyLevelUps(data).level, 2);
  });

  test('old progress is split between chat and voice', async () => {
    const store = new Map([[getUserLevelKey('g', 'u'), { xp: 41, level: 3, totalXp: 900 }]]);
    const client = { db: { get: async (key) => store.get(key) } };
    const data = await getUserLevelData(client, 'g', 'u');
    assert.equal(data.chatXp, 20);
    assert.equal(data.voiceXp, 21);
  });

  test('rank tells how much chat and voice XP is missing', () => {
    const lines = levelRequirementLines({ chatXp: 20, voiceXp: 0, chatXpNeeded: 100, voiceXpNeeded: 100, perMessage: 20, perMinute: 10 });
    assert.match(lines[1], /ناقصك \*\*80 XP\*\* شات \(≈ 4 رسالة\)/u);
    assert.match(lines[3], /ناقصك \*\*100 XP\*\* فويس \(≈ 10د فويس\)/u);

    const done = levelRequirementLines({ chatXp: 150, voiceXp: 40, chatXpNeeded: 100, voiceXpNeeded: 100 });
    assert.match(done[1], /الشات كامل/u);
    assert.match(done.at(-1), /فاضل الفويس/u);

    const card = buildRankEmbed(member, { level: 2, chatXp: 10, voiceXp: 5, chatXpNeeded: 80, voiceXpNeeded: 80, totalXp: 300, position: 1, rankedCount: 3 });
    const field = card.fields.at(-1);
    assert.match(field.name, /لفل 3/u);
    assert.match(field.value, /ناقصك \*\*70 XP\*\* شات/u);
    assert.match(field.value, /ناقصك \*\*75 XP\*\* فويس/u);
  });
});
