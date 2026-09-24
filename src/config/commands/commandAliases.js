/** Command aliases configuration. */
export const commandAliases = {
  bal: 'cc', balance: 'cc', money: 'cc', cash: 'cc', credits: 'cc', h: 'help', info: 'help',
  رصيد: 'cc', رصيدي: 'cc', فلوس: 'cc', كريدت: 'cc', يومي: 'daily', دايلي: 'daily',
  بان: 'ban', انبان: 'unban', تايم: 'timeout', انتايم: 'untimeout', mute: 'timeout', unmute: 'untimeout',
  وارن: 'warn', وارنات: 'warnings', كلير: 'clear', clear: 'clear',
  طرد: 'kick', تحذير: 'warn', تحذيرات: 'warnings', مسح: 'clear', قفل: 'lock', فتح: 'unlock',
  حالات: 'cases', ملاحظات: 'usernotes', قل: 'say', قول: 'say', خاص: 'dm',
  kick: 'kick', ban: 'ban', warn: 'warn', untimeout: 'untimeout',
  rank: 'rank', lvl: 'rank', xp: 'rank', leaderboard: 'leaderboard', lb: 'leaderboard', top: 'leaderboard',
  user: 'userinfo', avatar: 'avatar', pfp: 'avatar', icon: 'avatar', bd: 'birthday', bday: 'birthday', b: 'birthday',
  flip: 'flip', coin: 'flip', roll: 'roll', dice: 'roll', fight: 'fight',
  gstart: 'gcreate', gstop: 'gend', groll: 'greroll', ticket: 'ticket', t: 'ticket', new: 'ticket',
  ver: 'verify', vadmin: 'verification', av: 'autoverify', welcome: 'welcome', greet: 'greet', goodbye: 'goodbye',
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

/** Two-word commands (`ماس بان ID1 ID2`, `top cc`), keyed by their first two words. */
export const twoWordCommandAliases = {
  'هارد بان': 'massban',
  'ماس بان': 'massban',
  'ماس طرد': 'masskick',
  'top cc': 'cctop',
  'توب cc': 'cctop',
  'توب كريدت': 'cctop',
};

/** Words that run a command with fixed leading arguments: `روليت` = `game roulette`, `اسئلة 5` = `game trivia 5`. */
export const commandArgAliases = {
  روليت: 'game roulette', roulette: 'game roulette',
  كراسي: 'game chairs', chairs: 'game chairs',
  مافيا: 'game mafia', mafia: 'game mafia',
  اسئلة: 'game trivia', اسئله: 'game trivia', أسئلة: 'game trivia', أسئله: 'game trivia', trivia: 'game trivia',
  خمن: 'game guess', guess: 'game guess',
  اسرع: 'game fast', أسرع: 'game fast', fast: 'game fast',
  فكك: 'game fakkek', fakkek: 'game fakkek',
  رتب: 'game scramble', scramble: 'game scramble',
  حساب: 'game math',
  العاب: 'game list', ألعاب: 'game list', games: 'game list',
  وقف: 'game stop',
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
  'رصيد', 'رصيدي', 'فلوس', 'كريدت', 'يومي', 'دايلي',
]);

export function isStandaloneInvocation(args) {
  return args.every((arg) => /^(?:\d+|<@!?\d{17,20}>)$/u.test(arg));
}

/**
 * Applies the two-word and word-with-arguments aliases to a typed command (`top cc` → `cctop`,
 * `روليت` → `game roulette`). Returns null when an everyday word was typed without the prefix as
 * part of a normal sentence, i.e. it is not a command.
 */
export function applyWordAliases(typedCommand, args, prefixed) {
  let commandName = typedCommand;
  let rest = args;
  const twoWordCommand = twoWordCommandAliases[`${typedCommand} ${(args[0] || '').toLowerCase()}`];
  if (twoWordCommand) {
    commandName = twoWordCommand;
    rest = args.slice(1);
  }
  if (!prefixed && standaloneOnlyAliases.has(typedCommand) && !isStandaloneInvocation(rest)) return null;
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
