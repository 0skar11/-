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
    assert.equal(formatChatChannelName('general・💬'), '💬・general');
  });

  test('is stable on an already formatted name', () => {
    for (const name of ['💬・general', '📸・media-pics', '🎮・games', '💬・random-stuff']) {
      assert.equal(formatChatChannelName(name), name);
    }
  });

  test('keeps an emoji the channel already starts with', () => {
    assert.equal(formatChatChannelName('💭・general'), '💭・general');
    assert.equal(formatChatChannelName('📷・media'), '📷・media');
    assert.equal(formatChatChannelName('📷 media'), '📷・media');
  });

  test('names the communication channels', () => {
    assert.equal(formatChatChannelName('games'), '🎮・games');
    assert.equal(formatChatChannelName('memes'), '😂・memes');
    assert.equal(formatChatChannelName('reveal'), '👀・reveal');
    assert.equal(formatChatChannelName('cmd'), '🤖・cmd');
    assert.equal(formatChatChannelName('boosters'), '💎・boosters');
  });

  test('names the staff channels', () => {
    assert.equal(formatChatChannelName('important'), '📌・important');
    assert.equal(formatChatChannelName('anti-nuke'), '🛡️・anti-nuke');
    assert.equal(formatChatChannelName('trusted'), '🤝・trusted');
    assert.equal(formatChatChannelName('perms'), '🔐・perms');
    assert.equal(formatChatChannelName('commands'), '🤖・commands');
    assert.equal(formatChatChannelName('مشاكل'), '⚠️・مشاكل');
    assert.equal(formatChatChannelName('proof'), '🧾・proof');
  });

  test('names the categories with the rule emoji', () => {
    const asCategory = name => formatChatChannelName(name, { keepEmoji: false });
    assert.equal(asCategory('👉 | Staff'), '👑・staff');
    assert.equal(asCategory('> important'), '📌・important');
    assert.equal(asCategory('> communication'), '💬・communication');
    assert.equal(asCategory('> Voices'), '🔊・voices');
    assert.equal(asCategory('Logs'), '📁・logs');
    assert.equal(asCategory('👑・staff'), '👑・staff');
  });

  test('falls back to the chat emoji and skips empty names', () => {
    assert.equal(formatChatChannelName('random'), '💬・random');
    assert.equal(formatChatChannelName('・・'), null);
  });
});
