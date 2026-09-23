/** Command aliases configuration. */
export const commandAliases = {
  bal: 'balance', money: 'balance', cash: 'balance', dep: 'deposit', with: 'withdraw',
  bet: 'gamble', give: 'pay', send: 'pay', h: 'help', info: 'help',
  بان: 'ban', انبان: 'unban', تايم: 'timeout', انتايم: 'untimeout', mute: 'timeout', unmute: 'untimeout',
  وارن: 'warn', وارنات: 'warnings', كلير: 'purge', clear: 'purge',
  طرد: 'kick', تحذير: 'warn', تحذيرات: 'warnings', مسح: 'purge', قفل: 'lock', فتح: 'unlock',
  حالات: 'cases', ملاحظات: 'usernotes', قل: 'say', خاص: 'dm',
  kick: 'kick', ban: 'ban', warn: 'warn', purge: 'purge', untimeout: 'untimeout',
  rank: 'rank', lvl: 'rank', xp: 'rank', leaderboard: 'leaderboard', lb: 'leaderboard', top: 'leaderboard',
  shop: 'shop', buy: 'buy', inventory: 'inventory', inv: 'inventory', items: 'inventory',
  user: 'userinfo', avatar: 'avatar', pfp: 'avatar', icon: 'avatar', bd: 'birthday', bday: 'birthday', b: 'birthday',
  flip: 'flip', coin: 'flip', roll: 'roll', dice: 'roll', fight: 'fight',
  gstart: 'gcreate', gstop: 'gend', groll: 'greroll', ticket: 'ticket', t: 'ticket', new: 'ticket',
  ver: 'verify', vadmin: 'verification', av: 'autoverify', welcome: 'welcome', greet: 'greet', goodbye: 'goodbye', autorole: 'autorole',
  calc: 'calculate', math: 'calculate', weather: 'weather', todo: 'todo', report: 'report', userinfo: 'userinfo', whois: 'userinfo', ui: 'userinfo',
  serverstats: 'serverstats', ss: 'serverstats', sstats: 'serverstats', rr: 'reactroles', reactionroles: 'reactroles',
  jtc: 'jointocreate', jointocreate: 'jointocreate', np: 'nowplaying', now: 'nowplaying',
};

export const subcommandAliases = {
  l: 'list', ls: 'list', s: 'set', i: 'info', r: 'remove', rm: 'remove', del: 'remove', n: 'next', sc: 'setchannel',
  a: 'add', c: 'complete', done: 'complete', d: 'complete', start: 'create', stop: 'end', roll: 'reroll', add: 'add', remove: 'remove', list: 'list',
};

/** Two-word Arabic commands (`ماس بان ID1 ID2`), keyed by their first two words. */
export const twoWordCommandAliases = {
  'ماس بان': 'massban',
  'ماس طرد': 'masskick',
};

/**
 * Arabic aliases that are also everyday words. Without the prefix they only run for
 * members who have the command's permissions, so normal chat never gets an error reply.
 */
export const COMMON_WORD_ALIASES = new Set(['مسح', 'قفل', 'فتح', 'حالات', 'ملاحظات', 'قل', 'خاص', 'تحذير', 'تحذيرات', 'طرد']);

export function resolveCommandAlias(commandName) {
  const normalized = String(commandName || '').toLowerCase();
  return commandAliases[normalized] || normalized;
}

export function resolveSubcommandAlias(subcommandName) {
  const normalized = String(subcommandName || '').toLowerCase();
  return subcommandAliases[normalized] || normalized;
}
