import { logger } from '../utils/logger.js';

// AFK: `afk <reason>` marks a member away. Mentioning or replying to them tells the sender they're AFK
// (no ping), and their next message removes it. AFK members are kept in memory and saved under one key
// per server ({ userId: { reason, since } }), loaded the first time the server is needed.
const NOTICE_DELETE_MS = 8_000;
const WELCOME_BACK_DELETE_MS = 5_000;
const NICK_PREFIX = '[AFK] ';
const MAX_NICK = 32;

const afkListKey = (guildId) => `guild:${guildId}:afklist`;
const loaded = new Map(); // guildId -> Promise<Map<userId, { reason, since }>>

function loadGuild(client, guildId) {
    if (!loaded.has(guildId)) {
        loaded.set(guildId, (async () => {
            const stored = (await client.db.get(afkListKey(guildId), {}).catch(() => ({}))) || {};
            return new Map(Object.entries(stored));
        })());
    }
    return loaded.get(guildId);
}

async function save(client, guildId, afk) {
    await client.db.set(afkListKey(guildId), Object.fromEntries(afk)).catch((error) => logger.error('Failed to save AFK list:', error));
}

export async function getAfk(client, guildId, userId) {
    return (await loadGuild(client, guildId)).get(userId) || null;
}

export async function setAfk(client, member, reason) {
    const afk = await loadGuild(client, member.guild.id);
    afk.set(member.id, { reason, since: Date.now() });
    await save(client, member.guild.id, afk);
    // Shows [AFK] in front of the name when the bot is allowed to change it.
    const name = member.nickname || member.user.globalName || member.user.username;
    if (member.manageable && !name.startsWith(NICK_PREFIX)) {
        await member.setNickname(`${NICK_PREFIX}${name}`.slice(0, MAX_NICK), 'AFK').catch(() => {});
    }
}

export async function clearAfk(client, member) {
    const afk = await loadGuild(client, member.guild.id);
    const entry = afk.get(member.id);
    if (!entry) return null;
    afk.delete(member.id);
    await save(client, member.guild.id, afk);
    if (member.manageable && member.nickname?.startsWith(NICK_PREFIX)) {
        const original = member.nickname.slice(NICK_PREFIX.length);
        const plain = member.user.globalName || member.user.username;
        await member.setNickname(original === plain ? null : original, 'Back from AFK').catch(() => {});
    }
    return entry;
}

async function sendTemporary(channel, payload, ms) {
    const sent = await channel.send({ ...payload, allowedMentions: { parse: [] } }).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), ms);
}

/** The author's own AFK is removed; people they mention or reply to who are AFK are announced (no ping). */
export async function handleAfkMessage(message, client, { isAfkCommand = false } = {}) {
    try {
        const afk = await loadGuild(client, message.guild.id);

        if (!isAfkCommand && afk.has(message.author.id) && message.member) {
            const entry = await clearAfk(client, message.member);
            await sendTemporary(message.channel, { content: `👋 أهلا بيك تاني ${message.author}، شلت الـ AFK (كنت AFK <t:${Math.floor(entry.since / 1000)}:R>).` }, WELCOME_BACK_DELETE_MS);
        }

        const mentioned = new Set(message.mentions?.users?.filter((user) => !user.bot && user.id !== message.author.id).map((user) => user.id) || []);
        const repliedTo = message.mentions?.repliedUser;
        if (repliedTo && !repliedTo.bot && repliedTo.id !== message.author.id) mentioned.add(repliedTo.id);

        const lines = [...mentioned]
            .filter((userId) => afk.has(userId))
            .map((userId) => {
                const entry = afk.get(userId);
                return `💤 <@${userId}> AFK <t:${Math.floor(entry.since / 1000)}:R> — ${entry.reason}`;
            });
        if (lines.length) await sendTemporary(message.channel, { content: lines.join('\n') }, NOTICE_DELETE_MS);
    } catch (error) {
        logger.error('Error handling AFK for message:', error);
    }
}
