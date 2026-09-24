// games.js — on/off switch for this bot's own games.
//
// The games moved to a separate games bot, so they are OFF by default. Nothing was deleted: every
// game file is still in the repo (commands/Games, commands/Fun, services/games, the panel buttons)
// and `GAMES_ENABLED=true` in the environment brings all of it back after a restart.
//
// What stays on either way is the CC system: `daily`, `cc`, `cctop`, the live Top CC board and
// the CC API the games bot uses to pay players (src/services/cc/ccApi.js).
//
// While the games are off:
//   • the game commands below are not loaded, not registered as slash commands and not in `help`;
//   • the games channel is open again (no "games only" deleting), so the games bot can work there;
//   • old games panel buttons answer that the games moved.

/** Commands that belong to this bot's games (the CC commands `cc`, `cctop`, `daily` are not here). */
export const GAME_COMMAND_NAMES = new Set(['game', 'solo', 'rps', 'xo', 'fight']);

/** Read on every call so the switch can be flipped in tests without re-importing. */
export function gamesEnabled() {
    return String(process.env.GAMES_ENABLED || '').trim().toLowerCase() === 'true';
}

/** Whether `commandName` is a game command that is switched off right now. */
export function isDisabledGameCommand(commandName) {
    return !gamesEnabled() && GAME_COMMAND_NAMES.has(commandName);
}

export const GAMES_MOVED_NOTICE = '🎮 الألعاب اتنقلت لبوت الألعاب. الـ CC (`يومي`، `رصيد`، `توب cc`) لسه شغال هنا.';
