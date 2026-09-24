# Chaos Credits (CC) and games

CC is the server's only currency. Members earn it in exactly two ways:

1. **`daily` / `يومي`**: 100 CC every 24 hours (+10% with the premium role from the guild config).
2. **Games**: group games pay the top 3, solo games pay a little with a daily cap.

The old ways to earn coins (work, crime, rob, beg, fish, mine, gamble, slut, pay) and the old
bank/shop/inventory commands were removed. Staff can still add or remove CC by hand from
`/economy dashboard`.

All numbers live in `src/config/cc.js`.

## Rewards

Group games: the pool is `10 CC × players` (counting up to 30 players), split 50% / 30% / 20%
between 1st, 2nd and 3rd. A game pays fewer places than it has players, so a 2 player game only
pays the winner.

| Players | 🥇 | 🥈 | 🥉 |
|---|---|---|---|
| 2 | 10 | – | – |
| 3 | 15 | 9 | – |
| 5 | 25 | 15 | 10 |
| 10 | 50 | 30 | 20 |
| 30+ | 150 | 90 | 60 |

Solo games (`سؤال`, `رقم`, `سلوت`, `حجر`, `اكس`): 5 CC per win, at most 50 CC a day (UTC).

## Commands

Every command works as a slash command and as a word typed in chat (with or without the prefix).
Game words typed without the prefix only start a game when the message is just that word
(optionally followed by a number or a mention), so normal chat like `سؤال يا جماعة` is ignored.

| Chat word | Slash | What it does |
|---|---|---|
| `يومي` / `daily` | `/daily` | Daily CC |
| `رصيد` / `cc` / `bal` | `/cc [user]` | CC balance, rank and game stats (reply to a message to see that member's) |
| `top cc` / `توب cc` / `cctop` | `/cctop` | CC leaderboard |
| `العاب` | `/game list` | The games panel (see below) |
| `روليت` | `/game roulette` | Roulette (3–20 players, join with buttons) |
| `كراسي` | `/game chairs` | Musical chairs (3–25 players) |
| `مافيا` | `/game mafia` | Mafia with doctor and detective (5–20 players) |
| `اسئلة [جولات]` | `/game trivia` | General knowledge questions, anyone can answer |
| `خمن [جولات]` | `/game guess` | Guess the number 1–100 with ⬆️/⬇️ hints |
| `اسرع [جولات]` | `/game fast` | First to type the word |
| `فكك [جولات]` | `/game fakkek` | Split the word into letters |
| `رتب [جولات]` | `/game scramble` | Unscramble the letters |
| `حساب [جولات]` | `/game math` | Quick math |
| `وقف` | `/game stop` | Stop the running game (its host or staff with Manage Messages) |
| `سؤال` | `/solo question` | One question, one try |
| `رقم` | `/solo number` | Guess 1–50 in 6 tries |
| `سلوت` | `/solo slots` | Slot machine, three of a kind wins |

Only one group game can run per channel.

## The games panel

`العاب` (or `/game list`) posts a panel: an embed explaining every game, the rewards and the CC
commands, with a button for each game. Rows are colour coded like the embed sections:
🔵 lobby games, 🟢 chat games, ⚪ solo games, then `يومي` / `رصيدي` / `توب CC` / `وقف اللعبة`.
Game buttons start the game in the panel's channel; daily, balance and top answer privately.
The buttons are handled globally (`src/interactions/buttons/games/gamesPanel.js`), so an old panel
keeps working after the bot restarts.

## Games channel (`1552714038817857556`)

The channel is for game commands only (`src/services/games/gamesChannel.js`). Anything else
posted there is deleted with a notice that disappears after 4 seconds (at most one notice per
member every 10 seconds). Still allowed:

- game and CC commands (`game`, `solo`, `rps`, `xo`, `cc`, `cctop`, `daily` and their words) and
  the panel buttons;
- answers while a game runs there: anyone during chat games, only the players during roulette,
  chairs and mafia (mafia needs its day discussion), and the player of a solo `سؤال` / `رقم`;
- the server owners and this bot.

Other commands don't run there, and other slash commands get a private "games only" reply.

## Storage

CC is stored in each member's economy record (`guild:<id>:economy:<user>`):
`cc`, `ccStats`, `ccLastDaily`, `ccSolo` (today's solo earnings) and `ccInventory` (for the store).
The old `wallet` / `bank` values are left untouched and are no longer used, so everyone starts
from 0 CC. Every change goes through `src/services/cc/ccService.js`, which locks per member.

## The store (next step)

- Catalog: `src/config/store/ccStoreItems.js` (item format documented at the top).
- Buying: `buyItem()` in `src/services/cc/ccStoreService.js` checks the price, takes the CC,
  gives roles (refunding if Discord refuses) and fills `ccInventory` for stackable items.
- Still to do: a store command that lists `listStoreItems()` and calls `buyItem()`, then set
  `ccStoreSettings.open = true`.
