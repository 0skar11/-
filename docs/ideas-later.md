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

## Custom roles in the CC store

Two store items, bought with CC. Both need staff to approve the name/colour before the role is made,
so nobody buys a rude name or a role that looks like staff.

### Personal custom role (~15,000 CC)

- The buyer picks the role's name and colour (and an icon if the server has boost level 2).
- The bot creates the role just under the store roles (always below the bot's own role, never with
  any permissions) and gives it to the buyer only.
- `myrole` / `رولي` lets the owner change the name or colour later, for a small fee (e.g. 500 CC).

### Friends custom role (~40,000 CC, pricier)

- Same as the personal role, but the buyer also writes their friends (mentions or IDs) and the role
  goes to all of them straight away.
- Limit: 15 members in total, the owner included.
- The owner can add or remove friends later (`رولي ضيف @x` / `رولي شيل @x`) while staying at 15 or
  under; a friend can leave the role themselves.
- If the owner leaves the server the role stays with the friends; staff can delete it.

### Things to decide when building it

- Store the role in the owner's record (`ccCustomRole: { roleId, members }`) so the limit and
  ownership survive restarts.
- Block names that copy staff roles or other members' roles, and colours too close to staff colours.
- One role of each kind per member.
