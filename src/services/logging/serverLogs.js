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

import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { getAuditLogChannelId } from '../auditLogChannelsService.js';
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
export async function postServerLog(guild, key, payload) {
    if (!guild || !isHomeGuild(guild.id)) return false;
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    const channelId = getAuditLogChannelId(config, key);
    if (!channelId) return false;
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.send) return false;
    return channel.send({ embeds: [payload], allowedMentions: { parse: [] } }).then(() => true).catch((error) => {
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

/** A deleted message (not a bot's, and not one the bot itself cleaned up). */
export async function logMessageDelete(message) {
    const guild = message?.guild;
    if (!guild || !isHomeGuild(guild.id) || !message.author || message.author.bot || message.webhookId) return false;
    const entry = await auditEntry(guild, AuditLogEvent.MessageDelete, message.author.id,
        (item) => !item.extra?.channel?.id || item.extra.channel.id === message.channelId);
    // The bot's own cleanups (games room, filters, spam) are logged where they belong.
    if (isBot(guild, entry)) return false;
    const attachments = [...(message.attachments?.values?.() || [])].map((file) => `[${file.name}](${file.url})`);
    return postServerLog(guild, 'message', embed({
        color: COLORS.red,
        title: '🗑️ رسالة اتمسحت',
        lines: [
            `👤 صاحبها: ${userLine(message.author)}`,
            `📍 الروم: <#${message.channelId}>`,
            entry ? byLine(entry) : '👮 مسحها: صاحبها (أو مش معروف)',
            message.createdTimestamp ? `🕒 اتبعتت: ${time(message.createdTimestamp)}` : null,
            '',
            message.content ? `>>> ${cut(message.content)}` : '*(من غير كلام)*',
            attachments.length ? `\n📎 ${attachments.join('، ')}` : null,
        ],
    }));
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
