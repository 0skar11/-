import { ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { AUDIT_LOG_CATEGORY_ID } from './auditLogChannelsService.js';

export const CHAT_CATEGORY_ID = '1547310338133860463';

// Categories that get tidied along with their channels, matched by their
// cleaned name so the IDs don't need to be known.
const TIDY_CATEGORY_NAMES = new Set(['staff', 'important', 'communication', 'voices', 'logs']);

// The log channels are looked up by their exact name, so only their
// category gets renamed.
const KEEP_CHANNEL_NAMES_IN = new Set([AUDIT_LOG_CATEGORY_ID]);

const SEPARATOR = '・';
const DEFAULT_EMOJI = '💬';

// First matching keyword decides the emoji. Keys are checked against the
// cleaned channel name, so Arabic, English and Franco names all work.
const EMOJI_RULES = [
  { emoji: '👑', words: ['staff', 'ستاف', 'الادارة', 'ادارة'] },
  { emoji: '📌', words: ['important', 'مهم'] },
  { emoji: '🔊', words: ['voices', 'voice', 'فويس', 'فويسات'] },
  { emoji: '📁', words: ['logs', 'log', 'لوج', 'لوجات'] },
  { emoji: '🛡️', words: ['nuke', 'antinuke', 'raid', 'antiraid', 'حماية'] },
  { emoji: '🤝', words: ['trusted', 'trust', 'ترستد', 'موثوقين'] },
  { emoji: '🔐', words: ['perms', 'perm', 'permissions', 'صلاحيات'] },
  { emoji: '⚠️', words: ['مشاكل', 'مشكلة', 'problems', 'issues', 'reports', 'report', 'bugs', 'بلاغات'] },
  { emoji: '📢', words: ['announcement', 'announcements', 'news', 'اعلانات', 'إعلانات', 'اخبار', 'أخبار'] },
  { emoji: '📜', words: ['rules', 'قوانين', 'القوانين'] },
  { emoji: '👋', words: ['welcome', 'ترحيب', 'الترحيب'] },
  { emoji: '📸', words: ['media', 'pics', 'pic', 'photos', 'photo', 'images', 'image', 'صور', 'الصور', 'ميديا'] },
  { emoji: '💎', words: ['boosters', 'booster', 'boosts', 'boost', 'بوسترز', 'بوستر'] },
  { emoji: '👀', words: ['reveal', 'reveals', 'face-reveal', 'ريفيل'] },
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
  { emoji: '💬', words: ['chat', 'general', 'communication', 'تواصل', 'شات', 'دردشة', 'عام', 'العام'] },
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

// An emoji someone already put at the start of the name (e.g. 💭・general)
// is kept instead of being swapped for the default one.
const LEADING_EMOJI = /^\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*/u;

// Categories always get the emoji from the rules, so "👉 | Staff" becomes
// "👑・staff" like the rest.
export function formatChatChannelName(name, { keepEmoji = true } = {}) {
  const clean = cleanChannelName(name);
  if (!clean) return null;
  const emoji = (keepEmoji && String(name).trim().match(LEADING_EMOJI)?.[0]) || pickChannelEmoji(clean);
  return `${emoji}${SEPARATOR}${clean}`.slice(0, 100);
}

async function renameIfNeeded(channel, newName, summary) {
  if (!newName || newName === channel.name) {
    summary.unchanged += 1;
    return;
  }

  try {
    const oldName = channel.name;
    await channel.setName(newName, 'Tidy channel names');
    logger.info(`Renamed channel ${channel.id}: "${oldName}" -> "${newName}"`);
    summary.renamed += 1;
  } catch (error) {
    logger.error(`Failed to rename channel ${channel.id} ("${channel.name}"):`, error);
    summary.errors += 1;
  }
}

export async function tidyChatChannelNames(client) {
  const summary = { renamed: 0, unchanged: 0, errors: 0 };

  for (const guild of client.guilds.cache.values()) {
    const categories = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory && (
      channel.id === CHAT_CATEGORY_ID || TIDY_CATEGORY_NAMES.has(cleanChannelName(channel.name))
    ));

    for (const category of categories.values()) {
      await renameIfNeeded(category, formatChatChannelName(category.name, { keepEmoji: false }), summary);
      if (KEEP_CHANNEL_NAMES_IN.has(category.id)) continue;

      const channels = guild.channels.cache.filter(
        channel => channel.parentId === category.id && RENAMABLE_TYPES.has(channel.type),
      );
      for (const channel of channels.values()) {
        await renameIfNeeded(channel, formatChatChannelName(channel.name), summary);
      }
    }
  }

  return summary;
}
