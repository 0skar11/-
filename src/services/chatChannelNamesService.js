import { ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';

export const CHAT_CATEGORY_ID = '1547310338133860463';

const SEPARATOR = '・';
const DEFAULT_EMOJI = '💬';

// First matching keyword decides the emoji. Keys are checked against the
// cleaned channel name, so Arabic, English and Franco names all work.
const EMOJI_RULES = [
  { emoji: '📢', words: ['announcement', 'announcements', 'news', 'اعلانات', 'إعلانات', 'اخبار', 'أخبار'] },
  { emoji: '📜', words: ['rules', 'قوانين', 'القوانين'] },
  { emoji: '👋', words: ['welcome', 'ترحيب', 'الترحيب'] },
  { emoji: '📸', words: ['media', 'pics', 'pic', 'photos', 'photo', 'images', 'image', 'صور', 'الصور', 'ميديا'] },
  { emoji: '🤳', words: ['selfie', 'selfies', 'سيلفي'] },
  { emoji: '🎬', words: ['clips', 'clip', 'videos', 'video', 'فيديو', 'فيديوهات', 'مقاطع'] },
  { emoji: '😂', words: ['memes', 'meme', 'ميمز', 'ميم', 'نكت', 'ضحك'] },
  { emoji: '🤖', words: ['bot', 'bots', 'commands', 'command', 'cmds', 'cmd', 'بوت', 'بوتات', 'اوامر', 'أوامر', 'الاوامر'] },
  { emoji: '🎵', words: ['music', 'songs', 'song', 'اغاني', 'أغاني', 'موسيقى', 'مزيكا'] },
  { emoji: '🎮', words: ['games', 'game', 'gaming', 'العاب', 'ألعاب', 'جيمنج'] },
  { emoji: '🔢', words: ['counting', 'count', 'عد', 'العد'] },
  { emoji: '💡', words: ['suggestions', 'suggestion', 'suggest', 'اقتراحات', 'اقتراح'] },
  { emoji: '📖', words: ['quran', 'قران', 'قرآن', 'اذكار', 'أذكار', 'دين'] },
  { emoji: '📝', words: ['quotes', 'quote', 'اقتباسات', 'اقتباس', 'خواطر'] },
  { emoji: '🎨', words: ['art', 'arts', 'drawing', 'draw', 'رسم', 'فن'] },
  { emoji: '🌸', words: ['anime', 'انمي', 'أنمي'] },
  { emoji: '⚽', words: ['sport', 'sports', 'football', 'كورة', 'رياضة'] },
  { emoji: '🍔', words: ['food', 'اكل', 'أكل'] },
  { emoji: '🎉', words: ['events', 'event', 'giveaway', 'giveaways', 'فعاليات', 'مسابقات'] },
  { emoji: '🔗', words: ['links', 'link', 'روابط'] },
  { emoji: '🆘', words: ['help', 'support', 'مساعدة', 'دعم'] },
  { emoji: '📈', words: ['level', 'levels', 'rank', 'ranks', 'لفل', 'مستوى', 'مستويات'] },
  { emoji: '🤫', words: ['confess', 'confessions', 'اعترافات', 'صراحة'] },
  { emoji: '💤', words: ['afk'] },
  { emoji: '💬', words: ['chat', 'general', 'شات', 'دردشة', 'عام', 'العام'] },
];

const RENAMABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);

// Strips any emoji, separators and symbols around the name and joins the
// words with single hyphens, so an already-formatted name comes out the same.
export function cleanChannelName(name) {
  return String(name || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function pickChannelEmoji(cleanName) {
  // Also try Arabic words without the "ال" prefix, e.g. "الشات" -> "شات".
  const words = cleanName.split('-').flatMap(word => (word.startsWith('ال') ? [word, word.slice(2)] : [word]));
  for (const rule of EMOJI_RULES) {
    if (rule.words.some(word => words.includes(word))) return rule.emoji;
  }
  return DEFAULT_EMOJI;
}

export function formatChatChannelName(name) {
  const clean = cleanChannelName(name);
  if (!clean) return null;
  return `${pickChannelEmoji(clean)}${SEPARATOR}${clean}`.slice(0, 100);
}

export async function tidyChatChannelNames(client) {
  const summary = { renamed: 0, unchanged: 0, errors: 0 };

  for (const guild of client.guilds.cache.values()) {
    const category = guild.channels.cache.get(CHAT_CATEGORY_ID)
      || await guild.channels.fetch(CHAT_CATEGORY_ID).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) continue;

    const channels = guild.channels.cache.filter(
      channel => channel.parentId === category.id && RENAMABLE_TYPES.has(channel.type),
    );

    for (const channel of channels.values()) {
      const newName = formatChatChannelName(channel.name);
      if (!newName || newName === channel.name) {
        summary.unchanged += 1;
        continue;
      }

      try {
        const oldName = channel.name;
        await channel.setName(newName, 'Tidy chat channel names');
        logger.info(`Renamed chat channel ${channel.id}: "${oldName}" -> "${newName}"`);
        summary.renamed += 1;
      } catch (error) {
        logger.error(`Failed to rename chat channel ${channel.id} ("${channel.name}"):`, error);
        summary.errors += 1;
      }
    }
  }

  return summary;
}
