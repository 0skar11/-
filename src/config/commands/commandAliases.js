/** Command aliases configuration. */
import { findAsset } from '../store/bourse.js';

export const commandAliases = {
  bal: 'cc', balance: 'cc', money: 'cc', cash: 'cc', credits: 'cc', h: 'help', info: 'help',
  رصيد: 'cc', رصيدي: 'cc', رصيدى: 'cc', فلوس: 'cc', كريدت: 'cc',
  تحويل: 'give', حول: 'give', حوّل: 'give', transfer: 'give',
  بان: 'ban', انبان: 'unban', تايم: 'timeout', انتايم: 'untimeout', mute: 'timeout', unmute: 'untimeout',
  وارن: 'warn', وارنات: 'warnings', كلير: 'clear', clear: 'clear',
  طرد: 'kick', تحذير: 'warn', تحذيرات: 'warnings', مسح: 'clear', قفل: 'lock', فتح: 'unlock',
  حالات: 'cases', ملاحظات: 'usernotes', قل: 'say', قول: 'say', خاص: 'dm',
  kick: 'kick', ban: 'ban', warn: 'warn', untimeout: 'untimeout',
  rank: 'rank', lvl: 'rank', xp: 'rank', leaderboard: 'leaderboard', lb: 'leaderboard', top: 'leaderboard',
  لفل: 'rank', ليفل: 'rank', مستوى: 'rank', مستوايا: 'rank', رانك: 'rank', توب: 'leaderboard',
  افك: 'afk', أفك: 'afk',
  user: 'userinfo', avatar: 'avatar', av: 'avatar', pfp: 'avatar', icon: 'avatar', bd: 'birthday', bday: 'birthday', b: 'birthday',
  flip: 'flip', coin: 'flip', roll: 'roll', dice: 'roll', fight: 'fight',
  gstart: 'gcreate', gstop: 'gend', groll: 'greroll', ticket: 'ticket', t: 'ticket', new: 'ticket',
  ver: 'verify', vadmin: 'verification', welcome: 'welcome', greet: 'greet', goodbye: 'goodbye',
  calc: 'calculate', math: 'calculate', weather: 'weather', todo: 'todo', report: 'report', userinfo: 'userinfo', whois: 'userinfo', ui: 'userinfo',
  serverstats: 'serverstats', ss: 'serverstats', sstats: 'serverstats', rr: 'reactroles', reactionroles: 'reactroles',
  jtc: 'jointocreate', jointocreate: 'jointocreate', np: 'nowplaying', now: 'nowplaying',
  شغل: 'play',
  اكس: 'xo', حجر: 'rps',
};

export const subcommandAliases = {
  l: 'list', ls: 'list', s: 'set', i: 'info', r: 'remove', rm: 'remove', del: 'remove', n: 'next', sc: 'setchannel',
  a: 'add', c: 'complete', done: 'complete', d: 'complete', start: 'create', stop: 'end', roll: 'reroll', add: 'add', remove: 'remove', list: 'list',
};

/**
 * Two-word commands (`ماس بان ID1 ID2`, `top cc`, `وقف اللعبة`), keyed by their first two words.
 * A value with a space also adds leading arguments (`game stop`).
 */
export const twoWordCommandAliases = {
  'هارد بان': 'massban',
  'ماس بان': 'massban',
  'ماس طرد': 'masskick',
  'top chat': 'leaderboard chat',
  'top level': 'leaderboard level',
  'توب شات': 'leaderboard chat',
  'توب لفل': 'leaderboard level',
  'توب ليفل': 'leaderboard level',
  'توب اللفل': 'leaderboard level',
  'توب الليفل': 'leaderboard level',
  'توب لفلات': 'leaderboard level',
  'توب ليفلات': 'leaderboard level',
  'توب اللفلات': 'leaderboard level',
  'توب الليفلات': 'leaderboard level',
  'توب مستوى': 'leaderboard level',
  'توب المستوى': 'leaderboard level',
  'توب level': 'leaderboard level',
  'top lvl': 'leaderboard level',
  'توب chat': 'leaderboard chat',
  'توب الشات': 'leaderboard chat',
  'توب رسايل': 'leaderboard chat',
  'توب الرسايل': 'leaderboard chat',
  'top voice': 'leaderboard voice',
  'top vc': 'leaderboard voice',
  'توب voice': 'leaderboard voice',
  'توب vc': 'leaderboard voice',
  'توب فويس': 'leaderboard voice',
  'توب الفويس': 'leaderboard voice',
  'توب صوت': 'leaderboard voice',
  'توب الصوت': 'leaderboard voice',
  'cc give': 'give',
  'top cc': 'cctop',
  'توب cc': 'cctop',
  'توب كريدت': 'cctop',
  'وقف اللعبة': 'game stop',
  'وقف اللعبه': 'game stop',
  'ايقاف اللعبة': 'game stop',
  'ايقاف اللعبه': 'game stop',
  'إيقاف اللعبة': 'game stop',
  'إيقاف اللعبه': 'game stop',
};

/** Words that run a command with fixed leading arguments: `روليت` = `game roulette`, `اسئلة 5` = `game trivia 5`. */
export const commandArgAliases = {
  روليت: 'game roulette', roulette: 'game roulette',
  كراسي: 'game chairs', chairs: 'game chairs',
  مافيا: 'game mafia', mafia: 'game mafia',
  غميضه: 'game hide', غميضة: 'game hide', hide: 'game hide',
  صيد: 'game hunt', hunt: 'game hunt',
  اسئلة: 'game trivia', اسئله: 'game trivia', أسئلة: 'game trivia', أسئله: 'game trivia', trivia: 'game trivia',
  خمن: 'game guess', guess: 'game guess',
  اسرع: 'game fast', أسرع: 'game fast', fast: 'game fast',
  فكك: 'game fakkek', fakkek: 'game fakkek',
  رتب: 'game scramble', scramble: 'game scramble',
  حساب: 'game math',
  العاب: 'game list', ألعاب: 'game list', games: 'game list',
  وقف: 'game stop', ايقاف: 'game stop', إيقاف: 'game stop',
  متجر: 'store list', المتجر: 'store list', shop: 'store list',
  شراء: 'store buy', اشتري: 'store buy', buy: 'store buy',
  مخزني: 'store inventory', مخزن: 'store inventory', inventory: 'store inventory', inv: 'store inventory',
  اسعار: 'bourse prices', أسعار: 'bourse prices', الاسعار: 'bourse prices', الأسعار: 'bourse prices', prices: 'bourse prices',
  بورصة: 'bourse prices', بورصه: 'bourse prices', البورصة: 'bourse prices', البورصه: 'bourse prices',
  استثمار: 'bourse invest', استثمر: 'bourse invest', invest: 'bourse invest',
  بيع: 'bourse sell', sell: 'bourse sell',
  ممتلكاتي: 'bourse holdings', ممتلكاتى: 'bourse holdings', ممتلكات: 'bourse holdings', holdings: 'bourse holdings',
  سؤال: 'solo question',
  رقم: 'solo number',
  سلوت: 'solo slots', سلوتس: 'solo slots', slots: 'solo slots',
};

/**
 * Everyday words: typed without the prefix they only run the command when the message is just the
 * word, optionally followed by a number or a mention (`خمن`, `اسئلة 5`, `رصيد @member`), so chat like
 * `سؤال يا جماعة` or `رصيد موبايلي خلص` is left alone.
 */
export const standaloneOnlyAliases = new Set([
  ...Object.keys(commandArgAliases),
  'رصيد', 'رصيدي', 'رصيدى', 'فلوس', 'كريدت',
  // `حول`/`تحويل` are everyday words, so they only send CC as `تحويل @member 100`.
  'تحويل', 'حول', 'حوّل',
  // Level words are common in chat (`لفل كام؟`), so they only run as the whole message (+ a mention).
  'لفل', 'ليفل', 'مستوى', 'مستوايا', 'رانك', 'توب',
]);

export function isStandaloneInvocation(args) {
  return args.every((arg) => /^(?:\d+|<@!?\d{17,20}>)$/u.test(arg));
}

/**
 * `استثمار عربية`, `بيع سبيكة دهب 2`: the bourse words also run without the prefix when the words
 * after them are exactly a bourse asset's name (optionally followed by a number), so a sentence like
 * `بيع العربية دي` is still left alone.
 */
export function isBourseNameInvocation(typedCommand, args) {
  const target = commandArgAliases[typedCommand];
  if (target !== 'bourse invest' && target !== 'bourse sell') return false;
  const words = /^\d+$/u.test(args[args.length - 1] || '') ? args.slice(0, -1) : args;
  return words.length > 0 && Boolean(findAsset(words.join(' ')));
}

/**
 * Applies the two-word and word-with-arguments aliases to a typed command (`top cc` → `cctop`,
 * `روليت` → `game roulette`). Returns null when an everyday word was typed without the prefix as
 * part of a normal sentence, i.e. it is not a command.
 */
export function applyWordAliases(typedCommand, args, prefixed) {
  const twoWordCommand = twoWordCommandAliases[`${typedCommand} ${(args[0] || '').toLowerCase()}`];
  if (twoWordCommand) {
    const [twoWordName, ...twoWordArgs] = twoWordCommand.split(' ');
    return { commandName: twoWordName, args: [...twoWordArgs, ...args.slice(1)] };
  }
  let commandName = typedCommand;
  let rest = args;
  if (!prefixed && standaloneOnlyAliases.has(typedCommand) && !isStandaloneInvocation(rest) && !isBourseNameInvocation(typedCommand, rest)) return null;
  const argAlias = commandArgAliases[typedCommand];
  if (argAlias) {
    const [aliasCommand, ...aliasArgs] = argAlias.split(' ');
    commandName = aliasCommand;
    rest = [...aliasArgs, ...rest];
  }
  return { commandName, args: rest };
}

export function resolveCommandAlias(commandName) {
  const normalized = String(commandName || '').toLowerCase();
  return commandAliases[normalized] || normalized;
}

export function resolveSubcommandAlias(subcommandName) {
  const normalized = String(subcommandName || '').toLowerCase();
  return subcommandAliases[normalized] || normalized;
}
