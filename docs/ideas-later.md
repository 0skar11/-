# Ideas saved for later

Ideas the owner wants, parked on purpose. Not built yet; pick them up when asked.
They are also listed in the trusted channel from `src/config/savedIdeas.js`: keep that file in sync when an idea is added or built.

## Daily streak (instead of the old `daily`)

The old `daily` is gone (see `src/config/cc.js`). The replacement idea:

- A member who writes in chat on a day keeps their streak; missing a whole day (UTC) resets it to 0.
- Each day of the streak pays a bonus (CC or XP) that grows with the streak, e.g. day 1 = 5 CC,
  +2 CC per day, capped (e.g. 30 CC) so long streaks don't flood the economy.
- Milestones (7, 30, 100 days) could give a one-time bonus or a role.
- `streak` / `ستريك` shows your streak, `top streak` the longest ones.
- Store it next to CC in the economy record (e.g. `ccStreak: { day, count, best }`) and pay it from
  `messageCreate` through `ccService.js`, once per member per day.

## Suggestions channel

- A set channel where every message becomes a suggestion: the bot reposts it as an embed (or keeps
  it) and adds 👍 👎.
- Staff buttons: accept / reject (with an optional reason); the embed changes colour and says who
  decided. The author could get a DM.
- Optional: a thread per suggestion for discussion, and `top suggestions` by votes.
