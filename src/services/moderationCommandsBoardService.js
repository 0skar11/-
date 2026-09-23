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
          '`مسح 10` / `م 10` — Delete messages',
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

/**
 * Posts the Arabic moderation commands list once in its channel.
 * Returns { status, channelId } where status is 'sent', 'updated' or 'exists'; throws on failure.
 */
export async function publishArabicModerationCommands(client) {
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

  const recentMessages = await channel.messages.fetch({ limit: 100 });
  const existing = recentMessages.find((message) =>
    message.author?.id === client.user.id && (
      message.embeds[0]?.title === MODERATION_COMMANDS_TITLE ||
      message.content?.includes(LEGACY_MARKER)
    )
  );
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
