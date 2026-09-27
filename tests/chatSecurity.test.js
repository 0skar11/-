import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField } from 'discord.js';
import { checkText, handleChatFilter, INSULTS, IBN_AL_ALLOWED } from '../src/services/moderation/chatFilterService.js';
import { trackMessage, handleOwnerMentionSpam, handleSpam, FLOOD_MESSAGES, OWNER_PING_ID, SPAM_TIMEOUT_MS } from '../src/services/moderation/antiSpamService.js';
import { purgeInvites, untrust } from '../src/services/securityCleanupService.js';
import { SERVER_OWNER_IDS } from '../src/config/serverOwners.js';
import { MAIN_INVITE_CODE } from '../src/config/security.js';

describe('chat filter (reports #146, #147, #151)', () => {
  const cases = {
    kosomak: ['كسمك', 'كس امك', 'كـسـمـك', 'ك س م ك', 'ك.س.م.ك', 'كسسسمك', 'يا كسمك', 'كس اختك', 'ksmk', 'kosomak', 'kos omak', 'k$mk', 'KOSOMK', 'كسومك'],
    ibnAl: ['ابن الكلب', 'يا ابن الوسخه', 'ابن ال***', 'يابن الجزمه', 'ebn el kalb', 'إبن الكلب'],
    insult: ['يا شرموط', 'متناك', 'انت خول', 'يا عرص', 'معرص', 'طيزك', 'يا منيوك', 'ya khawal', 'sharmota', 'خوووول'],
    banned: ['تعالوا الحفره', 'الحفرة احسن', 'el7ofra'],
  };
  for (const [rule, texts] of Object.entries(cases)) {
    test(`catches ${rule}`, () => {
      for (const text of texts) assert.equal(checkText(text), rule, text);
    });
  }

  test('leaves normal words alone', () => {
    for (const text of ['ابن الحلال', 'ابن عمي', 'ابن العم', 'خوله صاحبتي', 'دخول', 'بوكس مان', 'مكس مصر', 'كسبت', 'كسرت الكوباية', 'اكسسوار', 'نيكون', 'زبادي', 'زبون', 'زبيب', 'حفره في الشارع', 'kosmos', 'kiss me', 'كسول', 'مكسيكو', 'نيكول', 'احا', 'hello']) {
      assert.equal(checkText(text), null, text);
    }
    assert.ok(INSULTS.length > 10 && IBN_AL_ALLOWED.includes('الحلال'));
  });

  function filterMessage(content, { authorId = '200000000000000001' } = {}) {
    const calls = [];
    const member = { id: authorId, moderatable: true, timeout: async (ms) => calls.push(['timeout', ms]) };
    return {
      calls,
      message: {
        content,
        guild: { id: 'g', ownerId: '1', client: { db: { get: async (key, fallback) => (key.includes('config') ? { antiNukeTrustedUsers: ['200000000000000077'] } : fallback), set: async () => true } }, members: { me: null, fetch: async () => member }, channels: { cache: new Map(), fetch: async () => null } },
        member,
        author: { id: authorId, bot: false },
        client: { user: { id: 'bot' } },
        channel: { send: async (payload) => { calls.push(['notice', payload.content]); return { delete: async () => {} }; } },
        delete: async () => calls.push(['delete']),
      },
    };
  }

  test('kosomak: deleted + 1 hour timeout; ibn al: deleted + warning; owners are skipped', async () => {
    let { calls, message } = filterMessage('يا ك س م ك');
    assert.equal(await handleChatFilter(message), true);
    assert.deepEqual(calls.slice(0, 2), [['delete'], ['timeout', 60 * 60_000]]);

    // ابن ال...: deleted + a warning, no direct timeout.
    ({ calls, message } = filterMessage('ابن الكلب'));
    assert.equal(await handleChatFilter(message), true);
    assert.deepEqual(calls[0], ['delete']);
    assert.ok(!calls.some(([kind]) => kind === 'timeout'));

    ({ calls, message } = filterMessage('الحفره'));
    await handleChatFilter(message);
    assert.deepEqual(calls[0], ['delete']);
    assert.ok(!calls.some(([kind]) => kind === 'timeout'));

    ({ calls, message } = filterMessage('كسمك', { authorId: '1159601661392715906' }));
    assert.equal(await handleChatFilter(message), false);
    assert.equal(calls.length, 0);

    // Trusted staff may swear.
    ({ calls, message } = filterMessage('كسمك', { authorId: '200000000000000077' }));
    assert.equal(await handleChatFilter(message), false);
    assert.equal(calls.length, 0);

    ({ calls, message } = filterMessage('فلان قالي كسمك'));
    message.channelId = '1552304815713943602'; // the report channel
    assert.equal(await handleChatFilter(message), false);
    assert.equal(calls.length, 0);
  });
});

describe('anti spam (#144) and owner mentions (#148)', () => {
  const message = (content, { userId = '300000000000000001', id = String(Math.random()), mentions = [] } = {}) => ({
    id, content, channelId: 'c', guild: { id: 'g2', channels: { cache: new Map() }, members: { me: null, fetch: async () => null } },
    author: { id: userId, bot: false }, member: null,
    mentions: { users: new Map(mentions.map((m) => [m, {}])) },
    client: { user: { id: 'bot' } },
    channel: { send: async () => ({ delete: async () => {} }), bulkDelete: async () => {}, messages: { delete: async () => {} } },
    delete: async () => {},
  });

  test('6 messages in 5 seconds or the same message 4 times is spam', () => {
    const t = 1_000_000;
    for (let i = 0; i < FLOOD_MESSAGES - 1; i += 1) assert.equal(trackMessage(message(`m${i}`, { userId: 'a' }), t + i * 100), null);
    assert.equal(trackMessage(message('m5', { userId: 'a' }), t + 600).kind, 'flood');
    for (let i = 0; i < 3; i += 1) assert.equal(trackMessage(message('نفس الكلام', { userId: 'b' }), t + i * 3000), null);
    assert.equal(trackMessage(message('نفس الكلام', { userId: 'b' }), t + 9000).kind, 'duplicate');
    assert.equal(trackMessage(message('نفس الكلام', { userId: 'c' }), t), null);
  });

  test('spam times the member out for 10 minutes; staff are skipped', async () => {
    const calls = [];
    const member = { id: 'd', moderatable: true, timeout: async (ms) => calls.push(ms), permissions: new PermissionsBitField() };
    let last;
    for (let i = 0; i < FLOOD_MESSAGES; i += 1) {
      last = { ...message(`x${i}`, { userId: 'd' }), member };
      await handleSpam(last, { now: 2_000_000 + i * 100 });
    }
    assert.deepEqual(calls, [SPAM_TIMEOUT_MS]);
    const staff = { ...message('y', { userId: 'e' }), member: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageMessages) } };
    for (let i = 0; i < FLOOD_MESSAGES + 2; i += 1) assert.equal(await handleSpam(staff, { now: 3_000_000 + i }), false);
  });

  test('the 3rd owner mention in a row is deleted; a message without it starts over', async () => {
    const ping = (userId, now) => handleOwnerMentionSpam(message(`<@${OWNER_PING_ID}>`, { userId, mentions: [OWNER_PING_ID] }), { now });
    assert.equal(await ping('f', 1), false);
    assert.equal(await ping('f', 2), false);
    assert.equal(await ping('f', 3), true);
    assert.equal(await ping('g', 1), false);
    assert.equal(await ping('g', 2), false);
    assert.equal(await handleOwnerMentionSpam(message('هاي', { userId: 'g' }), { now: 3 }), false);
    assert.equal(await ping('g', 4), false);
  });
});

describe('security cleanup (#145, #149, #150, #152)', () => {
  test('izatona is no longer an owner', () => {
    assert.deepEqual(SERVER_OWNER_IDS, ['1159601661392715906']);
  });

  test('deletes every invite except the main one', async () => {
    const deleted = [];
    const invite = (code) => ({ code, delete: async () => deleted.push(code) });
    const guild = {
      name: 'g',
      members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All) } },
      invites: { fetch: async () => new Map(['a1', MAIN_INVITE_CODE, 'b2'].map((code) => [code, invite(code)])) },
    };
    assert.equal(await purgeInvites(guild), 2);
    assert.deepEqual(deleted, ['a1', 'b2']);
  });

  test('takes izatona and role 1547448260661084161 out of the trusted list', async () => {
    const store = new Map();
    const client = { db: { get: async (k, f) => (store.has(k) ? store.get(k) : f), set: async (k, v) => { store.set(k, v); return true; } } };
    const config = { antiNukeTrustedUsers: ['1308224908576428079', '1'], antiNukeTrustedRoles: ['1547448260661084161', '2'] };
    assert.deepEqual(await untrust(client, 'g3', config), { users: 1, roles: 1 });
  });
});
