// serverLogs.js — the Logs category channels (auditLogChannelsService.js), in our server only.
//
// The general logging (loggingService.js) stays off; these post straight into the dedicated channels,
// with who did it from the audit log when there is one:
//   • moderation      — warnings (copied from the moderation action log) and kicks
//   • timeout         — timeouts given and removed, from any source
//   • ban             — bans and unbans
//   • message-deleted — deleted messages (not the bot's own cleanups) and bulk deletes
//   • roles           — roles given to / taken from members, and roles created, deleted or changed
//   • join / leave    — members joining and leaving
// (voice and invites are posted by dedicatedVoiceAuditLog.js and inviteTrackerService.js.)

import { AuditLogEvent, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { getAuditLogChannelId, AUDIT_LOG_CATEGORY_ID, LOG_CHANNELS } from '../auditLogChannelsService.js';
import { findRecentAuditEntry } from '../../utils/antiNukeLogging.js';
import { logger } from '../../utils/logger.js';

// The audit entry can land a moment after the gateway event; tests set this to 0.
export const SERVER_LOG_SETTINGS = { auditRetryMs: 1_500 };

const MAX_CONTENT = 1000;
const NEW_ACCOUNT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const COLORS = { red: 0xe74c3c, green: 0x2ecc71, orange: 0xe67e22, yellow: 0xf1c40f, blue: 0x3498db, grey: 0x95a5a6, purple: 0x9b59b6 };

const time = (ms) => `<t:${Math.floor(ms / 1000)}:f> (<t:${Math.floor(ms / 1000)}:R>)`;
const userLine = (user, id = user?.id) => `<@${id}>${user?.tag || user?.username ? ` (${user.tag || user.username} - ${id})` : ` (${id})`}`;
const cut = (text, max = MAX_CONTENT) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

function embed({ color, title, lines, thumbnail = null }) {
    return {
        color,
        title,
        description: lines.filter((line) => line !== null && line !== undefined && line !== false).join('\n').slice(0, 4000),
        ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
        timestamp: new Date().toISOString(),
    };
}

/** Posts `payload` (an embed) in the Logs channel `key` (moderation, timeout, ban, message, roles, join, leave). */
/**
 * The Logs room for `key`: found by its name inside the Logs category (so it works even when the saved
 * IDs in the config are missing or old), else by the ID saved by ensureAuditLogChannels.
 */
export async function findLogChannel(guild, key) {
    const name = LOG_CHANNELS[key];
    const byName = name && guild.channels.cache.find?.((channel) => channel.parentId === AUDIT_LOG_CATEGORY_ID && channel.name === name && channel.send);
    if (byName) return byName;
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    const channelId = getAuditLogChannelId(config, key);
    if (!channelId) return null;
    return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

export async function postServerLog(guild, key, payload, files = []) {
    if (!guild || !isHomeGuild(guild.id)) return false;
    const channel = await findLogChannel(guild, key);
    if (!channel?.send) {
        logger.warn(`[SERVER_LOGS] The ${LOG_CHANNELS[key] || key} log room was not found`);
        return false;
    }
    return channel.send({ embeds: [payload], files, allowedMentions: { parse: [] } }).then(() => true).catch((error) => {
        logger.warn(`[SERVER_LOGS] Could not post in ${key}: ${error.message}`);
        return false;
    });
}

/** The audit entry for an action, looked up once more after a moment. */
async function auditEntry(guild, type, targetId, filter) {
    const entry = await findRecentAuditEntry(guild, type, targetId, filter).catch(() => null);
    if (entry || !SERVER_LOG_SETTINGS.auditRetryMs) return entry;
    await new Promise((resolve) => setTimeout(resolve, SERVER_LOG_SETTINGS.auditRetryMs));
    return findRecentAuditEntry(guild, type, targetId, filter).catch(() => null);
}

const byLine = (entry) => (entry?.executor ? `👮 بواسطة: ${userLine(entry.executor)}` : null);
const reasonLine = (entry) => (entry?.reason ? `📝 السبب: ${cut(entry.reason, 500)}` : null);
const isBot = (guild, entry) => Boolean(entry?.executor?.id && entry.executor.id === guild.client?.user?.id);

// Discord removes a message's images once it is deleted, so images sent in our server are kept in memory
// for a while, to be posted with the delete log.
export const IMAGE_CACHE = { maxFileBytes: 8 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024, ttlMs: 6 * 60 * 60 * 1000 };
const imageCache = new Map(); // messageId -> { at, bytes, files: [{ name, attachment }] }
let cachedBytes = 0;

const isImage = (file) => (file.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/iu.test(file.name || '');

function forgetImages(messageId) {
    const entry = imageCache.get(messageId);
    if (!entry) return null;
    imageCache.delete(messageId);
    cachedBytes -= entry.bytes;
    return entry;
}

function pruneImages(now) {
    for (const [messageId, entry] of imageCache) {
        if (now - entry.at <= IMAGE_CACHE.ttlMs && cachedBytes <= IMAGE_CACHE.maxTotalBytes) break;
        forgetImages(messageId);
    }
}

async function download(file, fetchImpl) {
    for (const url of [file.url, file.proxyURL].filter(Boolean)) {
        const response = await fetchImpl(url).catch(() => null);
        if (response?.ok) return Buffer.from(await response.arrayBuffer());
    }
    return null;
}

const imageFiles = (message) => [...(message.attachments?.values?.() || [])]
    .filter((file) => isImage(file) && (file.size || 0) <= IMAGE_CACHE.maxFileBytes)
    .slice(0, 10);

/** Keeps a copy of the images of a member's message (our server only). Returns how many were kept. */
export async function rememberImages(message, { fetchImpl = fetch, now = Date.now() } = {}) {
    if (!message?.guild || !isHomeGuild(message.guild.id) || message.author?.bot || message.webhookId) return 0;
    const wanted = imageFiles(message);
    if (!wanted.length) return 0;
    const files = [];
    let bytes = 0;
    for (const [index, file] of wanted.entries()) {
        const data = await download(file, fetchImpl);
        if (!data) continue;
        files.push({ name: `${index + 1}-${file.name || 'image.png'}`, attachment: data });
        bytes += data.length;
    }
    if (!files.length) return 0;
    imageCache.set(message.id, { at: now, bytes, files });
    cachedBytes += bytes;
    pruneImages(now);
    return files.length;
}

/** The images of a deleted message: the kept copy, else a last try to download them. */
async function deletedImages(message, fetchImpl) {
    const kept = forgetImages(message.id);
    if (kept) return kept.files;
    const files = [];
    for (const [index, file] of imageFiles(message).entries()) {
        const data = await download(file, fetchImpl);
        if (data) files.push({ name: `${index + 1}-${file.name || 'image.png'}`, attachment: data });
    }
    return files;
}

/** A deleted message (not a bot's, and not one the bot itself cleaned up), with its images. */
export async function logMessageDelete(message, { fetchImpl = fetch } = {}) {
    const guild = message?.guild;
    if (!guild || !isHomeGuild(guild.id) || !message.author || message.author.bot || message.webhookId) return false;
    const entry = await auditEntry(guild, AuditLogEvent.MessageDelete, message.author.id,
        (item) => !item.extra?.channel?.id || item.extra.channel.id === message.channelId);
    // The bot's own cleanups (games room, filters, spam) are logged where they belong.
    if (isBot(guild, entry)) return false;
    // Discord deleted the files too: images are posted from the kept copy, other files only by name.
    const images = await deletedImages(message, fetchImpl);
    const otherFiles = [...(message.attachments?.values?.() || [])].filter((file) => !isImage(file)).map((file) => file.name);
    const missingImages = imageFiles(message).length - images.length;
    const payload = embed({
        color: COLORS.red,
        title: '🗑️ رسالة اتمسحت',
        lines: [
            `👤 صاحبها: ${userLine(message.author)}`,
            `📍 الروم: <#${message.channelId}>`,
            entry ? byLine(entry) : '👮 مسحها: صاحبها',
            message.createdTimestamp ? `🕒 اتبعتت: ${time(message.createdTimestamp)}` : null,
            '',
            message.content ? `>>> ${cut(message.content)}` : '*(من غير كلام)*',
            images.length ? `\n🖼️ الصور تحت (${images.length})` : null,
            missingImages > 0 ? `⚠️ ${missingImages} صورة مقدرتش أجيبها` : null,
            otherFiles.length ? `📎 ملفات: ${otherFiles.join('، ')}` : null,
        ],
    });
    if (images.length) payload.image = { url: `attachment://${images[0].name}` };
    return postServerLog(guild, 'message', payload, images);
}

/** Several messages deleted at once (a purge). */
export async function logBulkDelete(messages, channel) {
    const guild = channel?.guild;
    if (!guild || !isHomeGuild(guild.id)) return false;
    const entry = await auditEntry(guild, AuditLogEvent.MessageBulkDelete, channel.id);
    if (isBot(guild, entry)) return false;
    return postServerLog(guild, 'message', embed({
        color: COLORS.red,
        title: '🧹 مسح رسايل بالجملة',
        lines: [`📍 الروم: <#${channel.id}>`, `🔢 العدد: **${messages.size ?? messages.length ?? 0}**`, byLine(entry)],
    }));
}

/** Roles given to or taken from a member. */
export async function logMemberRoles(oldMember, newMember) {
    const guild = newMember?.guild;
    if (!guild || !isHomeGuild(guild.id) || !oldMember?.roles?.cache || oldMember.partial) return false;
    const added = [...newMember.roles.cache.values()].filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = [...oldMember.roles.cache.values()].filter((role) => !newMember.roles.cache.has(role.id));
    if (!added.length && !removed.length) return false;
    const ids = new Set([...added, ...removed].map((role) => role.id));
    const entry = await auditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id,
        (item) => item.changes?.some((change) => change.new?.some?.((role) => ids.has(role.id))));
    return postServerLog(guild, 'roles', embed({
        color: added.length && !removed.length ? COLORS.green : removed.length && !added.length ? COLORS.red : COLORS.blue,
        title: '🎭 رولات عضو اتغيرت',
        lines: [
            `👤 العضو: ${userLine(newMember.user, newMember.id)}`,
            added.length ? `➕ اتضافت: ${added.map((role) => `<@&${role.id}>`).join('، ')}` : null,
            removed.length ? `➖ اتشالت: ${removed.map((role) => `<@&${role.id}>`).join('، ')}` : null,
            byLine(entry),
        ],
    }));
}

/** A timeout given or removed (by a command, Discord itself, or another bot). */
export async function logTimeout(oldMember, newMember, now = Date.now()) {
    const guild = newMember?.guild;
    if (!guild || !isHomeGuild(guild.id) || oldMember?.partial) return false;
    const before = oldMember?.communicationDisabledUntilTimestamp || 0;
    const after = newMember.communicationDisabledUntilTimestamp || 0;
    if (before === after) return false;
    const given = after > now;
    if (!given && before <= now) return false;
    const entry = await auditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id,
        (item) => item.changes?.some((change) => change.key === 'communication_disabled_until'));
    return postServerLog(guild, 'timeout', embed({
        color: given ? COLORS.orange : COLORS.green,
        title: given ? '⏳ تايم أوت' : '✅ اتفك التايم أوت',
        lines: [
            `👤 العضو: ${userLine(newMember.user, newMember.id)}`,
            given ? `⏱️ لحد: ${time(after)}` : null,
            byLine(entry),
            reasonLine(entry),
        ],
        thumbnail: newMember.user?.displayAvatarURL?.() || null,
    }));
}

export async function logBan(ban) {
    const guild = ban?.guild;
    if (!guild || !isHomeGuild(guild.id)) return false;
    const entry = await auditEntry(guild, AuditLogEvent.MemberBanAdd, ban.user?.id);
    return postServerLog(guild, 'ban', embed({
        color: COLORS.red,
        title: '🔨 بان',
        lines: [`👤 العضو: ${userLine(ban.user)}`, byLine(entry), reasonLine(entry) || (ban.reason ? `📝 السبب: ${cut(ban.reason, 500)}` : null)],
        thumbnail: ban.user?.displayAvatarURL?.() || null,
    }));
}

export async function logUnban(ban) {
    const guild = ban?.guild;
    if (!guild || !isHomeGuild(guild.id)) return false;
    const entry = await auditEntry(guild, AuditLogEvent.MemberBanRemove, ban.user?.id);
    return postServerLog(guild, 'ban', embed({
        color: COLORS.green,
        title: '🔓 فك بان',
        lines: [`👤 العضو: ${userLine(ban.user)}`, byLine(entry), reasonLine(entry)],
    }));
}

export async function logJoin(member, now = Date.now()) {
    const guild = member?.guild;
    if (!guild || !isHomeGuild(guild.id)) return false;
    const created = member.user?.createdTimestamp || 0;
    const fresh = created && now - created < NEW_ACCOUNT_DAYS * DAY_MS;
    return postServerLog(guild, 'join', embed({
        color: fresh ? COLORS.yellow : COLORS.green,
        title: member.user?.bot ? '🤖 بوت دخل' : '📥 عضو دخل',
        lines: [
            `👤 العضو: ${userLine(member.user, member.id)}`,
            created ? `🗓️ الحساب اتعمل: ${time(created)}${fresh ? ' ⚠️ حساب جديد' : ''}` : null,
            `👥 عدد الأعضاء: **${guild.memberCount ?? '—'}**`,
        ],
        thumbnail: member.user?.displayAvatarURL?.() || null,
    }));
}

/** A member left: the leave channel, and the moderation channel too when they were kicked. */
export async function logLeave(member) {
    const guild = member?.guild;
    if (!guild || !isHomeGuild(guild.id)) return false;
    const kick = await auditEntry(guild, AuditLogEvent.MemberKick, member.id);
    const roles = [...(member.roles?.cache?.values?.() || [])].filter((role) => role.id !== guild.id).map((role) => `<@&${role.id}>`);
    const posted = await postServerLog(guild, 'leave', embed({
        color: kick ? COLORS.orange : COLORS.grey,
        title: kick ? '👢 عضو اتطرد' : '📤 عضو طلع',
        lines: [
            `👤 العضو: ${userLine(member.user, member.id)}`,
            member.joinedTimestamp ? `📅 كان داخل: ${time(member.joinedTimestamp)}` : null,
            roles.length ? `🎭 رولاته: ${cut(roles.join('، '), 900)}` : null,
            `👥 عدد الأعضاء: **${guild.memberCount ?? '—'}**`,
            kick ? byLine(kick) : null,
        ],
        thumbnail: member.user?.displayAvatarURL?.() || null,
    }));
    if (kick) {
        await postServerLog(guild, 'moderation', embed({
            color: COLORS.orange,
            title: '👢 كيك',
            lines: [`👤 العضو: ${userLine(member.user, member.id)}`, byLine(kick), reasonLine(kick)],
        }));
    }
    return posted;
}

/** A warning, copied from the moderation action log. */
export async function logWarning(guild, logEmbed) {
    return postServerLog(guild, 'moderation', logEmbed?.toJSON ? logEmbed.toJSON() : logEmbed);
}

const PERMISSION_NAMES = Object.keys(PermissionsBitField.Flags);

function permissionChanges(oldRole, newRole) {
    const before = new PermissionsBitField(oldRole.permissions?.bitfield ?? 0n);
    const after = new PermissionsBitField(newRole.permissions?.bitfield ?? 0n);
    const added = PERMISSION_NAMES.filter((name) => after.has(name, false) && !before.has(name, false));
    const removed = PERMISSION_NAMES.filter((name) => before.has(name, false) && !after.has(name, false));
    return { added, removed };
}

export async function logRoleCreate(role) {
    if (!role?.guild || !isHomeGuild(role.guild.id)) return false;
    const entry = await auditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    return postServerLog(role.guild, 'roles', embed({ color: COLORS.green, title: '🆕 رول اتعملت', lines: [`🎭 الرول: <@&${role.id}> (${role.name})`, byLine(entry)] }));
}

export async function logRoleDelete(role) {
    if (!role?.guild || !isHomeGuild(role.guild.id)) return false;
    const entry = await auditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    return postServerLog(role.guild, 'roles', embed({ color: COLORS.red, title: '🗑️ رول اتمسحت', lines: [`🎭 الرول: **${role.name}** (${role.id})`, byLine(entry)] }));
}

export async function logRoleUpdate(oldRole, newRole) {
    if (!newRole?.guild || !isHomeGuild(newRole.guild.id)) return false;
    const lines = [];
    if (oldRole.name !== newRole.name) lines.push(`✏️ الاسم: **${oldRole.name}** ← **${newRole.name}**`);
    const colorOf = (role) => role.colors?.primaryColor ?? role.color ?? 0;
    const hex = (role) => `\`#${colorOf(role).toString(16).padStart(6, '0')}\``;
    if (colorOf(oldRole) !== colorOf(newRole)) lines.push(`🎨 اللون: ${hex(oldRole)} ← ${hex(newRole)}`);
    const { added, removed } = permissionChanges(oldRole, newRole);
    if (added.length) lines.push(`➕ صلاحيات: ${added.join('، ')}`);
    if (removed.length) lines.push(`➖ صلاحيات: ${removed.join('، ')}`);
    // Position changes alone (every role below moves too) are not logged.
    if (!lines.length) return false;
    const entry = await auditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    return postServerLog(newRole.guild, 'roles', embed({ color: COLORS.purple, title: '🛠️ رول اتعدلت', lines: [`🎭 الرول: <@&${newRole.id}>`, ...lines, byLine(entry)] }));
}

// What each room gets, for the one-time "this log works" message.
const ROOM_PURPOSE = {
    moderation: 'الوارنات والكيك',
    timeout: 'التايم أوت وفكه',
    ban: 'البان وفك البان',
    message: 'الرسايل اللي بتتمسح ومسح الرسايل بالجملة',
    roles: 'الرولات اللي بتتضاف وتتشال من الأعضاء، والرولات اللي بتتعمل أو تتمسح أو تتعدل',
    join: 'الأعضاء اللي بيدخلوا',
    leave: 'الأعضاء اللي بيطلعوا أو بيتطردوا',
};
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

/**
 * Startup, our server only: loads the members (Discord only sends member updates and leaves for members
 * the bot knows), makes sure the bot can post in each Logs room, and posts a one-time "this log works"
 * message in each. Returns `{ ready, missing, noAccess, auditLog }`.
 */
export async function startServerLogs(client) {
    const summary = { ready: [], missing: [], noAccess: [], auditLog: true };
    for (const guild of client.guilds.cache.values()) {
        if (!isHomeGuild(guild.id)) continue;
        await guild.members.fetch().catch((error) => logger.warn(`[SERVER_LOGS] Could not load the members: ${error.message}`));
        const me = guild.members.me;
        summary.auditLog = Boolean(me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog));
        const helloKey = `guild:${guild.id}:serverlogs:hello`;
        const greeted = new Set(await client.db.get(helloKey, []) || []);
        for (const key of Object.keys(ROOM_PURPOSE)) {
            const channel = await findLogChannel(guild, key);
            if (!channel) {
                summary.missing.push(LOG_CHANNELS[key]);
                continue;
            }
            if (me && channel.permissionsFor && !channel.permissionsFor(me)?.has(NEEDED)) {
                await channel.permissionOverwrites?.edit(me.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true }, { reason: 'Logs room' }).catch(() => {});
                if (!channel.permissionsFor(me)?.has(NEEDED)) {
                    summary.noAccess.push(LOG_CHANNELS[key]);
                    continue;
                }
            }
            summary.ready.push(LOG_CHANNELS[key]);
            if (greeted.has(key)) continue;
            const sent = await channel.send({
                embeds: [embed({ color: COLORS.green, title: '✅ اللوج ده شغال', lines: [`هنا هيتبعت: ${ROOM_PURPOSE[key]}.`] })],
                allowedMentions: { parse: [] },
            }).then(() => true).catch(() => false);
            if (sent) greeted.add(key);
        }
        await client.db.set(helloKey, [...greeted]);
    }
    if (summary.missing.length) logger.warn(`[SERVER_LOGS] Log rooms not found: ${summary.missing.join(', ')}`);
    if (summary.noAccess.length) logger.warn(`[SERVER_LOGS] The bot can't post in: ${summary.noAccess.join(', ')}`);
    if (!summary.auditLog) logger.warn('[SERVER_LOGS] The bot has no View Audit Log permission: logs won\'t say who did it');
    return summary;
}
