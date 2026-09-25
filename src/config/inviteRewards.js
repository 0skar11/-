// inviteRewards.js — CC for inviting people to Chaos (services/inviteRewardService.js).
//
// A member who invites someone gets `reward` CC once the invited member has reached level `level`
// and has been in the server for `minStayDays` days. An invite doesn't count when the invited
// account is younger than `minAccountAgeDays` days (fake/alt accounts), when the member was in the
// server before (a rejoin), when they invited themselves, or when the invited member leaves before
// the reward is paid. The reward is a fixed amount: the CC event multiplier doesn't apply.
//
// Paid invites count towards the invite roles below; a member only keeps the role of their highest tier.

// The Chaos server and its welcome channel (voidWelcome.js posts the welcome there too).
export const CHAOS_GUILD_ID = '1155236281706627173';
export const WELCOME_CHANNEL_ID = '1547305745417113700';

export const INVITE_REWARDS = {
    reward: 1000,
    level: 5,
    minStayDays: 3,
    minAccountAgeDays: 7,
    // How often pending invites are checked, for members who reached the level before their days were up.
    checkEveryMinutes: 30,
    tiers: [
        { count: 5, name: '📨 5 Invites', color: '#f8c471' },
        { count: 10, name: '💌 10 Invites', color: '#eb984e' },
        { count: 25, name: '🏆 25 Invites', color: '#f4d03f' },
    ],
};
