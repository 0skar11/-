import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

export const MODERATION_COMMANDS_CHANNEL_ID = '1551621505991835699';
const MODERATION_COMMANDS_TITLE = '🛡️ أوامر الموديريشن بالعربي';
// Older versions showed this marker in the message; it is stripped from existing posts.
const LEGACY_MARKER = 'titanbot:arabic-moderation-commands:v1';

const PERMISSION_NAMES = [
  [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
  [PermissionFlagsBits.SendMessages, 'SendMessages'],
  [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
  [PermissionFlagsBits.ReadMessageHistory, 'ReadMessageHistory'],
  [PermissionFlagsBits.ManageMessages, 'ManageMessages'],
];

function buildEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(MODERATION_COMMANDS_TITLE)
    .setDescription('استخدم الـ prefix قبل الأمر إذا كان مفعّلًا في السيرفر. يمكنك منشن العضو أو الرد على رسالته.')
    .addFields(
      {
        name: '🚫 الحظر والطرد',
        value: [
          '`بان @العضو السبب` — Ban',
          '`انبان ID_العضو` — Unban',
          '`طرد @العضو السبب` — Kick',
          '`هارد بان @العضو ID2 السبب` — Hard ban (فكّه للـ trusted فقط)',
          '`ماس طرد ID1 ID2 السبب` — Mass kick',
        ].join('\n'),
      },
      {
        name: '⏱️ التايم والتحذيرات',
        value: [
          '`تايم @العضو 5m السبب` — Timeout',
          '`انتايم @العضو` — Remove timeout',
          '`تحذير @العضو السبب` — Warn',
          '`تحذيرات @العضو` — Warnings',
          '`مسح تحذيرات @العضو` — Clear warnings',
        ].join('\n'),
      },
      {
        name: '🔧 إدارة الرومات والبيانات',
        value: [
          '`قفل` — Lock channel',
          '`فتح` — Unlock channel',
          '`مسح 10` — Purge messages',
          '`حالات` — Moderation cases',
          '`ملاحظات @العضو` — User notes',
          '`قل @العضو النص` — Say as the bot',
          '`خاص @العضو النص` — DM user',
        ].join('\n'),
      },
    );
}

/** What the list shows: title, description and every field. Any difference triggers an edit. */
function embedSignature(embed) {
  return JSON.stringify({
    title: embed?.title || '',
    description: embed?.description || '',
    color: embed?.color ?? null,
    fields: (embed?.fields || []).map(({ name, value }) => ({ name, value })),
  });
}

export const isBoardMessage = (message, botId) => message.author?.id === botId && (
  message.embeds[0]?.title === MODERATION_COMMANDS_TITLE || message.content?.includes(LEGACY_MARKER)
);

/** Reads the whole channel history (not only the last 100 messages), oldest first. */
async function fetchAllMessages(channel) {
  const found = [];
  let before;
  for (let page = 0; page < 50; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    found.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.lastKey();
  }
  return found.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/** The channel holds only the commands list: every other message is deleted. */
async function deleteMessages(channel, messages) {
  const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000 - 60_000;
  const recent = messages.filter((message) => Date.now() - message.createdTimestamp < TWO_WEEKS);
  const old = messages.filter((message) => !recent.includes(message));
  for (let i = 0; i < recent.length; i += 100) {
    const chunk = recent.slice(i, i + 100);
    if (chunk.length === 1) await chunk[0].delete().catch(() => {});
    else await channel.bulkDelete(chunk.map((message) => message.id), true).catch(() => {});
  }
  // Discord only bulk-deletes messages younger than 14 days; older ones go one by one.
  for (const message of old) await message.delete().catch(() => {});
}

let inFlight = null;

/**
 * Posts the Arabic moderation commands list once in its channel.
 * Returns { status, channelId } where status is 'sent', 'updated' or 'exists'; throws on failure.
 */
export function publishArabicModerationCommands(client) {
  // Startup and the slash command can run together; share one run so only one message is sent.
  inFlight ||= publish(client).finally(() => { inFlight = null; });
  return inFlight;
}

async function publish(client) {
  const channel = await client.channels.fetch(MODERATION_COMMANDS_CHANNEL_ID).catch((error) => {
    throw new Error(`Channel ${MODERATION_COMMANDS_CHANNEL_ID} could not be fetched (is the bot in that server?): ${error.message}`);
  });
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !channel.guild) {
    throw new Error(`Channel ${MODERATION_COMMANDS_CHANNEL_ID} is not a server text channel`);
  }

  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = PERMISSION_NAMES.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
  if (missing.length) {
    throw new Error(`Missing permissions in channel ${MODERATION_COMMANDS_CHANNEL_ID}: ${missing.join(', ')}`);
  }

  const messages = await fetchAllMessages(channel);
  const existing = messages.find((message) => isBoardMessage(message, client.user.id));
  await deleteMessages(channel, messages.filter((message) => message !== existing));
  if (existing) {
    // Keep the posted list in sync with the code (new commands, removed legacy marker).
    const embed = buildEmbed();
    const outdated = existing.content?.includes(LEGACY_MARKER)
      || Boolean(existing.embeds[0]?.footer?.text)
      || embedSignature(existing.embeds[0]) !== embedSignature(embed.data);
    if (outdated) {
      await existing.edit({ content: '', embeds: [embed] });
      return { status: 'updated', channelId: channel.id };
    }
    return { status: 'exists', channelId: channel.id };
  }

  await channel.send({ embeds: [buildEmbed()] });
  logger.info(`Published Arabic moderation commands in channel ${MODERATION_COMMANDS_CHANNEL_ID}`);
  return { status: 'sent', channelId: channel.id };
}
