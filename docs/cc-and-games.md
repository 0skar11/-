# Chaos Credits (CC) and games

> **The games moved to a separate games bot (Clover).** This bot keeps the CC system (`cc`,
> `cctop`, the live Top CC board, the store) and pays [Clover wins](#clover-wins); a games bot you
> control can also use the [CC API](#cc-api-for-the-games-bot). This bot's own games are **off** but not deleted: every
> file below is still in the repo, and `GAMES_ENABLED=true` + a restart brings them all back
> (`src/config/games.js`). While they are off the game commands (`game`, `solo`, `rps`, `xo`,
> `fight`) are not loaded, registered or listed in `help`, the games channel no longer deletes
> other messages, and the buttons of an old games panel say the games moved. The rest of this
> page describes the games as they work when switched back on.

CC is the server's only currency and it is earned from games only: [Clover wins](#clover-wins),
and this bot's own games when they are switched back on (group games pay the top 3, solo games pay
a little with a daily cap). There is no `daily`.

The old ways to earn coins (daily, work, crime, rob, beg, fish, mine, gamble, slut, pay) and the old
bank/shop/inventory commands were removed. Members can send CC to each other with
[`give`](#sending-cc-give), which takes a tax. Staff can still add or remove CC by hand from
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

Games against another member (`اكس @عضو`, `fight @عضو`) start with an invite: the other member has
20 seconds to press قبول or رفض (the challenger can take it back with رفض). Only after قبول does the
game start; a refused, cancelled or unanswered invite is deleted after 5 seconds.

## Commands

Every command works as a slash command and as a word typed in chat (with or without the prefix).
Game words typed without the prefix only start a game when the message is just that word
(optionally followed by a number or a mention), so normal chat like `سؤال يا جماعة` is ignored.

| Chat word | Slash | What it does |
|---|---|---|
| `رصيد` / `cc` / `bal` | `/cc [user]` | CC balance, rank and game stats (reply to a message to see that member's) |
| `top cc` / `توب cc` / `cctop` | `/cctop` | CC leaderboard |
| `تحويل @member 100` / `cc give @member 100` / `give` | `/give user amount` | Send CC to a member, minus a tax (see below) |
| `العاب` | `/game list` | The games panel (see below) |
| `روليت` | `/game roulette` | Roulette (3–20 players, join with buttons) |
| `كراسي` | `/game chairs` | Chairs (3–25 players): grey chairs flash 🔴 at random (pressing then knocks you out), then turn 🟢 at a random moment and everyone races to sit |
| `مافيا` | `/game mafia` | Mafia with doctor and detective (5–20 players), 20 second phases |
| `اسئلة [جولات]` | `/game trivia` | General knowledge questions, anyone can answer |
| `خمن [جولات]` | `/game guess` | Guess the number 0–200 with ⬆️/⬇️ hints, 7 tries per player each round (🚫 when they run out) |
| `اسرع [جولات]` | `/game fast` | First to type the word |
| `فكك [جولات]` | `/game fakkek` | Split the word into letters |
| `رتب [جولات]` | `/game scramble` | Unscramble the letters |
| `حساب [جولات]` | `/game math` | Quick math |
| `وقف` / `وقف اللعبة` / `ايقاف` | `/game stop` | Stop the running game (its host or a trusted member) |
| `سؤال` | `/solo question` | One question, one try |
| `رقم` | `/solo number` | Guess 0–200 in 7 tries |
| `سلوت` | `/solo slots` | Slot machine, three of a kind wins |

Only one group game can run per channel. A game is controlled (start or cancel the lobby, stop
it) by its host and trusted members: the server owners, bot owners and the anti-nuke trusted
users/roles (`trusted`), the same people who can lift a hard ban.

**20 seconds, then AFK.** Every choice in a game has 20 seconds: the roulette turn, sitting in
chairs once they turn green, rock-paper-scissors, an XO move and each mafia phase. Whoever doesn't choose in time is
kicked for AFK: in roulette and chairs they are out, in XO the other player wins, and in mafia
they leave the game with their role shown and get no CC even if their team wins. Mafia starts
with everyone pressing 🎭 to see their own role privately; not pressing is AFK too. The answer
time of the chat games (trivia 10s, guess 60s, ...) is separate. A game that is cancelled (lobby cancelled or not
enough players) or stopped with `وقف` deletes all its messages and the command that started it;
the stop notice disappears after 5 seconds. Finished games keep their messages and results.

The CC commands (`cc`, `cctop`, `give`) are in the Games category with the games, so turning
off the Economy category in the command access dashboard doesn't hide them.

## The games panel

`العاب` (or `/game list`) posts a panel: an embed explaining every game, the rewards and the CC
commands, with a button for each game. Rows are colour coded like the embed sections:
🔵 lobby games, 🟢 chat games, ⚪ solo games, then `رصيدي` / `توب CC` / `وقف اللعبة`.
Game buttons start the game in the panel's channel; balance and top answer privately.
The buttons are handled globally (`src/interactions/buttons/games/gamesPanel.js`), so an old panel
keeps working after the bot restarts.

## Games channel (`1552714038817857556`)

The channel is for game commands only (`src/services/games/gamesChannel.js`). Anything else
posted there is deleted with a notice that disappears after 4 seconds (at most one notice per
member every 10 seconds). Still allowed:

- game and CC commands (`game`, `solo`, `rps`, `xo`, `cc`, `cctop` and their words) and
  the panel buttons;
- answers while a game runs there: anyone during chat games, only the players during roulette,
  chairs and mafia (mafia needs its day discussion), and the player of a solo `سؤال` / `رقم`;
- the server owners and this bot.

Other commands don't run there, and other slash commands get a private "games only" reply.

### Live Top CC board

The bot keeps one Top CC post in the games channel (`src/services/games/ccTopBoard.js`): the top 15
members, how many members have CC and the server total. It is posted at startup when missing and
then edited every 5 minutes; its footer says when it was last updated. The post's ID is saved in the
guild config (`boardMessageIds.cctop`), so a restart keeps editing the same post however far up the
channel it is, and deleting it makes the bot post a new one on the next refresh. `top cc` replies
look the same but have no footer, so they are never mistaken for the board.

## Level-up CC

Every level-up (from chat or voice XP) pays `10 × the new level` CC: level 1 = 10, level 10 = 100,
level 50 = 500. Gaining several levels at once pays each one. The level-up message in the levels
channel shows the CC. Staff setting levels by command pays nothing. The number is
`CC.levelUp.perLevel`.

## CC events (`CC.boost`)

`CC.boost` in `src/config/cc.js` multiplies every CC earned from games (group games, solo wins,
Clover wins and the games bot's API rewards), level-up CC, and the daily caps until the `until` time, then stops
by itself. While it runs, `رصيد` and `top cc` show `🔥 CC ×5` with when it ends, and Clover win
notices show the multiplier. Transfers and staff changes are never multiplied. To end it early, set
`multiplier: 1`.

Current event: ×5 until 2026-09-30 08:15 UTC.

## Sending CC (`give`)

`تحويل @member 100` (also `حول`, `transfer`, `cc give`, `/give`) sends CC to another member. The
sender pays the full amount and the receiver gets it minus the tax. The least you can send is 10 CC,
and you can't send to yourself or to a bot.

The tax depends on how many times the sender sent CC in the last 7 days: the first 3 pay 5%, then
every transfer pays 5% more (10%, 15%, 20%, ...) up to 50%. A transfer stops counting 7 days after
it was made. The tax is rounded up, so every transfer pays at least 1 CC. The reply shows the tax
and what the next transfer will cost. The numbers are `CC.transfer` in `src/config/cc.js`.

Received CC doesn't count as "earned" in the profile; it is kept apart in `ccStats.sent` /
`ccStats.received`.

## Storage

CC is stored in each member's economy record (`guild:<id>:economy:<user>`):
`cc`, `ccStats`, `ccSolo` (today's solo earnings), `ccGamesBot` (today's Clover earnings),
`ccTransfers` (when the member sent CC in the last 7 days, for the transfer tax) and
`ccInventory` (for the store). An old `ccLastDaily` from the removed daily is left untouched.
The old `wallet` / `bank` values are left untouched and are no longer used, so everyone starts
from 0 CC. Every change goes through `src/services/cc/ccService.js`, which locks per member.

## The store (next step)

- Catalog: `src/config/store/ccStoreItems.js` (item format documented at the top).
- Buying: `buyItem()` in `src/services/cc/ccStoreService.js` checks the price, takes the CC,
  gives roles (refunding if Discord refuses) and fills `ccInventory` for stackable items.
- Still to do: a store command that lists `listStoreItems()` and calls `buyItem()`, then set
  `ccStoreSettings.open = true`.

## Clover wins

The games bot is [Clover](https://clovers.gg). When a Clover game ends it posts `👑 | @winner`;
this bot reads that message (`src/services/cc/gamesBotWins.js`) and pays the winner
**10 CC**, at most **200 CC a day** (UTC) from Clover wins (`CC.gamesBot` in `src/config/cc.js`).
Every win also counts as a game, a top 3 and a 1st place in the member's stats, even after the cap.
A short reply under Clover's message shows the CC and new balance and is deleted after 15 seconds.

Only messages from the Clover bot count (`1006332825571692544`), so typing the same text does
nothing, and each message pays once. With Clover Premium (a server copy of the bot with its own
ID) put that ID in `GAMES_BOT_IDS`.

## CC API for the games bot

The games bot reads and pays CC over HTTP on this bot's web server (same `PORT` as `/health`).
Code: `src/services/cc/ccApi.js`.

**Setup**

1. Pick a long random secret (16+ characters) and set it as `CC_API_TOKEN` on this bot.
2. Give the games bot the same secret and this bot's address, e.g. `http://<host>:<PORT>/api/cc`.
3. Every request sends `Authorization: Bearer <CC_API_TOKEN>`. Without the variable the API
   answers `503` and changes nothing; a wrong token gets `401`.

Only guilds this bot is in are accepted (`404` otherwise). User IDs are strings.

| Method and path | Body | What it does |
|---|---|---|
| `GET /api/cc/:guildId/users/:userId` | – | `{ userId, cc, stats }` |
| `GET /api/cc/:guildId/top?limit=10` | – | `{ members, total, top: [{ userId, cc, earned }] }` (1–100 rows) |
| `POST /api/cc/:guildId/group-game` | `{ game, players: [ids], ranking: [ids] }` | Pays a finished group game with the rules above (pool `10 × players`, 50/30/20 for the top 3); `ranking` is the finishing order, 1st first. Returns `{ paid: [{ userId, place, amount, balance }] }` |
| `POST /api/cc/:guildId/solo-win` | `{ userId, game }` | A solo win: 5 CC, at most 50 CC a day. Returns `{ amount, capped, balance }` |
| `POST /api/cc/:guildId/add` | `{ userId, amount, reason }` | Custom reward, 1–10,000 CC. Returns `{ ok, amount, balance }` |
| `POST /api/cc/:guildId/spend` | `{ userId, amount, reason }` | Takes CC (entry fee, bet). Returns `{ ok: false, balance }` when the member can't afford it |

Any POST can carry a `requestId` (letters, numbers, `_.:-`): repeating it within 10 minutes
returns the first answer without paying again, so the games bot can safely retry after a timeout.

Example (Node.js, from the games bot):

```js
await fetch(`${CC_API_URL}/${guildId}/group-game`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CC_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ game: 'roulette', players, ranking: [winnerId, secondId, thirdId], requestId: gameId }),
});
```

Every payment is logged (`[CC] ...`) and shows up in the member's `رصيد` and the Top CC board.
