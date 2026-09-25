import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { handleReportChannelMessage, REPORT_CHANNEL_ID } from '../src/services/reportChannelService.js';

delete process.env.GITHUB_TOKEN;
const OWNER_ID = '1159601661392715906';

function reportMessage(content, { authorId = '200000000000000001', staff = false } = {}) {
  const sent = [];
  const deleted = [];
  const all = new PermissionsBitField(PermissionsBitField.All);
  const channel = {
    id: REPORT_CHANNEL_ID,
    permissionsFor: () => all,
    send: async (payload) => { sent.push(payload); return { embeds: [], attachments: new Map(), edit: async () => {}, url: 'https://discord.com/x' }; },
  };
  return {
    content,
    channelId: REPORT_CHANNEL_ID,
    channel,
    author: { id: authorId, tag: authorId, displayAvatarURL: () => '', toString: () => `<@${authorId}>` },
    member: { permissionsIn: () => new PermissionsBitField(staff ? [PermissionFlagsBits.ManageMessages] : []) },
    guild: { id: 'g', ownerId: '999', members: { me: {} } },
    attachments: new Map(),
    delete: async () => deleted.push(content),
    sent,
    deleted,
  };
}

const isCommand = async (message) => /^(?:say|قول)\s/u.test(message.content);

describe('report channel', () => {
  test('an owner or staff command (say) runs instead of becoming a report', async () => {
    const owner = reportMessage('say اللي عنده افكار تتحط في المتجر يكتبها هنا @everyone', { authorId: OWNER_ID });
    assert.equal(await handleReportChannelMessage(owner, { isCommand }), false);
    assert.equal(owner.sent.length, 0);

    const staff = reportMessage('قول اهلا', { staff: true });
    assert.equal(await handleReportChannelMessage(staff, { isCommand }), false);
  });

  test('a member message is always a report, even one starting with a command word', async () => {
    const member = reportMessage('قول للإدارة إن الروم فيه مشكلة');
    assert.equal(await handleReportChannelMessage(member, { isCommand }), true);
    assert.equal(member.sent.length, 1);
    assert.match(member.sent[0].embeds[0].description, /قول للإدارة/u);
  });

  test('a staff message that is not a command is still a report', async () => {
    const staff = reportMessage('امر الملاحظات مش شغال', { staff: true });
    assert.equal(await handleReportChannelMessage(staff, { isCommand }), true);
    assert.equal(staff.sent.length, 1);
  });
});
