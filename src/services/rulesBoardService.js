import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';

// No emoji: src/utils/embeds.js strips them from titles, and the title is how the post is found again.
export const RULES_TITLE = 'قوانين السيرفر';
const BOARD_KEY = 'rules';

const PERMISSION_NAMES = [
  [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
  [PermissionFlagsBits.SendMessages, 'SendMessages'],
  [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
  [PermissionFlagsBits.ReadMessageHistory, 'ReadMessageHistory'],
];

export const RULES_SECTIONS = [
  {
    name: '🤝 الاحترام',
    rules: [
      'احترم كل الأعضاء والستاف، ممنوع الشتيمة والسب والتنمر.',
      'ممنوع العنصرية أو الكلام عن الدين أو السياسة أو الأصل بشكل مسيء.',
      'ممنوع التهديد أو نشر معلومات شخصية لأي حد (صور، أرقام، عناوين).',
      'الخلافات الشخصية تتحل في الخاص أو عن طريق تكت، مش في الشات العام.',
    ],
  },
  {
    name: '💬 الشات',
    rules: [
      'ممنوع السبام والفلود وتكرار الرسائل أو الإيموجي.',
      'ممنوع منشن `@everyone` أو `@here` أو منشن الستاف من غير سبب.',
      'ممنوع أي محتوى +18 أو دموي أو مقزز، في الرسائل أو الصور أو الأسماء أو الصور الشخصية.',
      'استخدم كل روم في الغرض بتاعه (الأوامر في روم الأوامر، والألعاب في روم الألعاب).',
    ],
  },
  {
    name: '🔗 الإعلانات والروابط',
    rules: [
      'ممنوع نشر روابط سيرفرات تانية أو أي إعلان، في الشات أو في خاص الأعضاء.',
      'ممنوع الروابط المشبوهة أو روابط النيترو المزيفة أو أي محاولة نصب.',
    ],
  },
  {
    name: '🎙️ الرومات الصوتية',
    rules: [
      'ممنوع الإزعاج في الفويس: صريخ، أصوات عالية، أو تشغيل أصوات من غير إذن.',
      'ممنوع تسجيل الفويس أو نشر كلام حد من غير موافقته.',
    ],
  },
  {
    name: '🎮 الألعاب والـ CC',
    rules: [
      'ممنوع استخدام حسابات تانية (alts) عشان تاخد يومي أو CC زيادة.',
      'ممنوع الغش أو الاتفاق مع حد عشان تكسب لعبة، أو تخريب لعبة شغالة.',
      'الـ CC ملوش أي قيمة حقيقية وممنوع بيعه أو شراه بفلوس.',
    ],
  },
  {
    name: '🛡️ الستاف والعقوبات',
    rules: [
      'قرار الستاف نهائي، ولو عندك اعتراض افتح تكت بهدوء.',
      'ممنوع انتحال شخصية حد من الستاف أو من الأعضاء.',
      'كل 3 تحذيرات = تايم أوت تلقائي 15 دقيقة، ويتضاعف كل 3 تحذيرات بعدها.',
      'التحذير بيتمسح تلقائياً بعد 5 أيام، والمخالفات الكبيرة ممكن توصل للبان مباشرة.',
      'لازم تلتزم بشروط ديسكورد (Discord ToS)، واللي سنه أقل من 13 سنة ممنوع يكون في السيرفر.',
    ],
  },
];

/** Numbers the rules across sections so members can point to one ("rule 7"). */
export function buildRulesEmbed() {
  let number = 0;
  const fields = RULES_SECTIONS.map(({ name, rules }) => ({
    name,
    value: rules.map((rule) => `**${++number}.** ${rule}`).join('\n'),
  }));
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(RULES_TITLE)
    .setDescription([
      'وجودك في السيرفر معناه إنك موافق على القوانين دي. عدم معرفتك بالقوانين مش عذر.',
      'أي مشكلة أو شكوى؟ افتح تكت والستاف هيساعدك.',
    ].join('\n'))
    .addFields(fields);
}

function embedSignature(embed) {
  return JSON.stringify({
    title: embed?.title || '',
    description: embed?.description || '',
    color: embed?.color ?? null,
    fields: (embed?.fields || []).map(({ name, value }) => ({ name, value })),
  });
}

/**
 * Posts the rules in the given channel, or edits the bot's existing rules post there so it matches the code.
 * Returns { status, channelId } where status is 'sent', 'updated' or 'exists'; throws on failure.
 */
export async function publishRulesBoard(channel) {
  if (!channel?.isTextBased?.() || !channel.messages?.fetch || !channel.guild) {
    throw new Error('The rules can only be posted in a server text channel');
  }

  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  const missing = PERMISSION_NAMES.filter(([flag]) => !permissions?.has(flag)).map(([, name]) => name);
  if (missing.length) {
    throw new Error(`Missing permissions in <#${channel.id}>: ${missing.join(', ')}`);
  }

  const embed = buildRulesEmbed();
  const existing = await findBoardMessage(channel, BOARD_KEY, (message) => message.embeds[0]?.title === RULES_TITLE);
  if (existing) {
    if (embedSignature(existing.embeds[0]) === embedSignature(embed.data)) return { status: 'exists', channelId: channel.id };
    await existing.edit({ content: '', embeds: [embed] });
    return { status: 'updated', channelId: channel.id };
  }

  const sent = await channel.send({ embeds: [embed] });
  await rememberBoardMessage(channel, BOARD_KEY, sent.id);
  return { status: 'sent', channelId: channel.id };
}
