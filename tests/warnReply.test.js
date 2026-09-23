import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import warn from '../src/commands/Moderation/warn.js';
import { applyReplyTarget } from '../src/events/messageCreate.js';
import { mapArgumentsToOptions } from '../src/utils/prefixParser.js';

const TARGET_ID = '111111111111111111';

function replyMessage({ author = { id: TARGET_ID, bot: false }, fetched = [] } = {}) {
  return {
    reference: { messageId: '3' },
    fetchReference: async () => ({ author }),
    guild: { members: { fetch: async (id) => { fetched.push(id); return { id }; } } },
  };
}

describe('warn by reply', () => {
  test('replying with `وارن السبب` warns the replied member', async () => {
    const fetched = [];
    const args = await applyReplyTarget(replyMessage({ fetched }), warn.data, ['سبام', 'كتير']);
    assert.deepEqual(args, [TARGET_ID, 'سبام', 'كتير']);
    assert.deepEqual(fetched, [TARGET_ID], 'the replied member is fetched into the cache');
    const options = mapArgumentsToOptions(args, warn.data);
    assert.equal(options.validateRequired().valid, true);
    assert.equal(options.getUser('target'), TARGET_ID);
    assert.equal(options.getString('reason'), 'سبام كتير');
  });

  test('replying with just `وارن` works without a reason', async () => {
    const args = await applyReplyTarget(replyMessage(), warn.data, []);
    assert.deepEqual(args, [TARGET_ID]);
    assert.equal(mapArgumentsToOptions(args, warn.data).validateRequired().valid, true);
  });

  test('a mention still wins over the reply, and bots are never targeted', async () => {
    assert.deepEqual(await applyReplyTarget(replyMessage(), warn.data, ['<@222222222222222222>', 'x']), ['<@222222222222222222>', 'x']);
    assert.deepEqual(await applyReplyTarget(replyMessage({ author: { id: TARGET_ID, bot: true } }), warn.data, ['x']), ['x']);
  });
});
