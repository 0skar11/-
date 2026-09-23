import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatChatChannelName } from '../src/services/chatChannelNamesService.js';

describe('formatChatChannelName', () => {
  test('gives each channel a matching emoji and a clean name', () => {
    assert.equal(formatChatChannelName('general'), '💬・general');
    assert.equal(formatChatChannelName('Media_Pics'), '📸・media-pics');
    assert.equal(formatChatChannelName('bot commands'), '🤖・bot-commands');
    assert.equal(formatChatChannelName('الشات'), '💬・الشات');
    assert.equal(formatChatChannelName('صور'), '📸・صور');
  });

  test('replaces old decorations instead of stacking them', () => {
    assert.equal(formatChatChannelName('『🎮』games'), '🎮・games');
    assert.equal(formatChatChannelName('┃・memes・┃'), '😂・memes');
    assert.equal(formatChatChannelName('--chat--2--'), '💬・chat-2');
  });

  test('is stable on an already formatted name', () => {
    for (const name of ['💬・general', '📸・media-pics', '🎮・games', '💬・random-stuff']) {
      assert.equal(formatChatChannelName(name), name);
    }
  });

  test('falls back to the chat emoji and skips empty names', () => {
    assert.equal(formatChatChannelName('random'), '💬・random');
    assert.equal(formatChatChannelName('・・'), null);
  });
});
