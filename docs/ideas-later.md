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

Two store items, paid as a monthly subscription in CC. Both need staff to approve the name/colour
before the role is made, so nobody buys a rude name or a role that looks like staff.

### Monthly subscription

- Every 30 days the price is taken from the owner's CC automatically.
- The owner gets a DM 3 days before renewal ("renewal in 3 days, you have X CC").
- Not enough CC on renewal day → 3 days' grace; still not enough → the role is taken off everyone
  but kept (name, colour, members) for 30 days, so paying again brings it straight back.
- `رولي الغي` cancels: the role stays until the end of the paid month, then goes.
- Friends role: any member of it can chip in towards the next month (`رولي ادفع 1000`), so the
  group can share the cost. Whatever is paid goes into the role's own balance, and renewal takes
  from that first, then from the leader's CC. Money paid in is not refunded.
- A cheaper price for paying 3 months at once (e.g. 3 months for the price of 2.5) is optional.

### Personal custom role (~4,000 CC a month)

- The buyer picks the role's name and colour (and an icon if the server has boost level 2).
- The bot creates the role just under the store roles (always below the bot's own role, never with
  any permissions) and gives it to the buyer only.
- `myrole` / `رولي` lets the owner change the name or colour later, for a small fee (e.g. 500 CC).

### Friends custom role (~10,000 CC a month, pricier)

- Same as the personal role, but the buyer also writes their friends (mentions or IDs) and the role
  goes to all of them straight away.
- Limit: 15 members in total, the owner included.
- The buyer is the **leader**. Only the leader can change anything: name, colour, icon, add or
  remove members (`رولي ضيف @x` / `رولي شيل @x`, staying at 15 or under), cancel the subscription,
  or hand leadership to another member (`رولي ليدر @x`).
- The other members can only do two things: chip in towards the subscription (`رولي ادفع 1000`)
  and leave the role themselves (`رولي اخرج`). `رولي` shows everyone the members, the leader,
  the role's balance and when it renews.
- If the leader leaves the server, leadership passes to the member who paid the most; staff can
  also delete the role.

### Things to decide when building it

- Store the role in the owner's record (`ccCustomRole: { roleId, members, paidUntil, cancelled }`)
  so the limit, ownership and renewal survive restarts; a daily cron renews or expires them.
- An active member earns roughly 4,500–7,500 CC a month, so the personal role costs most of a
  month of play and the friends role needs the group to share it.
- Block names that copy staff roles or other members' roles, and colours too close to staff colours.
- One role of each kind per member.
