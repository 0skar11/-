// rejoinRestore.js — a member who leaves and comes back gets their things back (owner's request), in
// our server only.
//
// When a member leaves, their roles and nickname are saved (their CC, level and birthday are kept as
// well; see guildMemberRemove.js). When they come back:
//   • every saved role that still exists and the bot can give is given back, and the nickname too;
//   • staff roles (staffRoleHierarchyService.js) and any role with a dangerous permission are not given
//     right away: the bot posts a confirmation in REJOIN_APPROVAL_CHANNEL_ID, and they are given only
//     when an owner or a trusted member (the Anti-Nuke trusted list) presses ✅. ❌ drops them. Once
//     decided, the request is deleted from that channel and the decision is posted in REJOIN_LOG_CHANNEL_ID.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { filterStaffRoles } from '../staffRoleHierarchyService.js';
import { TRUSTED_BOARD_CHANNEL_ID } from '../trustedBoardService.js';
import { isTrusted } from '../../utils/antiNukeLogging.js';
import { logger } from '../../utils/logger.js';

// Where staff roles wait for approval: the trusted channel.
export const REJOIN_APPROVAL_CHANNEL_ID = TRUSTED_BOARD_CHANNEL_ID;
// Where the decision is written once the request is deleted (the owner's log channel).
export const REJOIN_LOG_CHANNEL_ID = '1550564287129456810';
export const REJOIN_BUTTON_PREFIX = 'rejoinroles';

// Roles with any of these need approval like the staff roles.
const DANGEROUS = [
    PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.ManageWebhooks,
];

const recordKey = (guildId, userId) => `guild:${guildId}:rejoin:${userId}`;

/** Saves the roles and nickname of a member who leaves. Returns the saved record, or null. */
export async function saveLeavingMember(member, now = Date.now()) {
    const guild = member?.guild;
    if (!guild || !isHomeGuild(guild.id) || member.user?.bot) return null;
    const roles = [...(member.roles?.cache?.values?.() || [])]
        .filter((role) => role.id !== guild.id && !role.managed)
        .map((role) => role.id);
    // Staff roles still waiting for approval from an earlier return are kept for the next one.
    const previous = await guild.client.db.get(recordKey(guild.id, member.id), null);
    const waiting = (previous?.pending || []).filter((id) => !roles.includes(id));
    const record = { roles: [...roles, ...waiting], nickname: member.nickname || null, leftAt: now };
    await guild.client.db.set(recordKey(guild.id, member.id), record);
    return record;
}

function needsApproval(role, staffIds) {
    return staffIds.has(role.id) || Boolean(role.permissions?.any?.(DANGEROUS));
}

export function approvalPayload(userId, roles) {
    const lines = [
        `<@${userId}> رجع السيرفر وكان معاه رولات إدارة:`,
        roles.map((role) => `• <@&${role.id}>`).join('\n') || '—',
        '',
        'ترجعله؟ الموافقة لصاحب السيرفر أو أي حد تراستد.',
    ];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${REJOIN_BUTTON_PREFIX}:approve:${userId}`).setLabel('رجّعها').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${REJOIN_BUTTON_PREFIX}:deny:${userId}`).setLabel('لا').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    return { embeds: [{ color: 0xf1c40f, title: '🔁 رجوع عضو برولات إدارة', description: lines.join('\n') }], components: [row], allowedMentions: { parse: [] } };
}

/**
 * Gives a member who came back their saved roles and nickname, and asks for approval of the staff
 * roles. Returns `{ restored: [roleIds], pending: [roleIds], nickname }`, or null when nothing was saved.
 */
export async function restoreRejoiningMember(member) {
    const guild = member?.guild;
    if (!guild || !isHomeGuild(guild.id) || member.user?.bot) return null;
    const key = recordKey(guild.id, member.id);
    const record = await guild.client.db.get(key, null);
    if (!record?.roles) return null;

    const saved = record.roles.map((id) => guild.roles.cache.get(id)).filter((role) => role && !role.managed && role.editable !== false);
    const staffIds = new Set((await filterStaffRoles(guild, saved)).map((role) => role.id));
    const pending = saved.filter((role) => needsApproval(role, staffIds));
    const normal = saved.filter((role) => !needsApproval(role, staffIds) && !member.roles.cache.has(role.id));

    if (normal.length) {
        await member.roles.add(normal.map((role) => role.id), 'رجع السيرفر: رجوع رولاته').catch((error) => {
            logger.warn(`[REJOIN] Could not give roles back to ${member.id}: ${error.message}`);
        });
    }
    if (record.nickname && member.manageable !== false) await member.setNickname(record.nickname, 'رجع السيرفر').catch(() => {});

    if (pending.length) {
        const channel = guild.channels.cache.get(REJOIN_APPROVAL_CHANNEL_ID)
            || await guild.channels.fetch(REJOIN_APPROVAL_CHANNEL_ID).catch(() => null);
        await channel?.send?.(approvalPayload(member.id, pending)).catch((error) => logger.warn(`[REJOIN] Could not ask about ${member.id}: ${error.message}`));
        await guild.client.db.set(key, { ...record, roles: [], pending: pending.map((role) => role.id) });
    } else {
        if (typeof guild.client.db.delete === 'function') await guild.client.db.delete(key);
        else await guild.client.db.set(key, null);
    }
    return { restored: normal.map((role) => role.id), pending: pending.map((role) => role.id), nickname: record.nickname };
}

/**
 * ✅ / ❌ on the approval message, by `userId`. Returns `{ ok: true, approved, given }` or
 * `{ ok: false, reason }` with reason one of: not_trusted, nothing, left.
 */
export async function decideRejoinRoles(guild, deciderId, memberId, approve) {
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    if (!(await isTrusted(guild, config, deciderId))) return { ok: false, reason: 'not_trusted' };
    const key = recordKey(guild.id, memberId);
    const record = await guild.client.db.get(key, null);
    if (!record?.pending?.length) return { ok: false, reason: 'nothing' };
    await guild.client.db.set(key, { ...record, pending: [] });
    if (!approve) return { ok: true, approved: false, given: [], asked: record.pending };

    const member = await guild.members.fetch(memberId).catch(() => null);
    if (!member) {
        // Left again: the roles wait for the next time they come back.
        await guild.client.db.set(key, { ...record, roles: [...(record.roles || []), ...record.pending], pending: [] });
        return { ok: false, reason: 'left' };
    }
    const roles = record.pending.filter((id) => guild.roles.cache.has(id));
    await member.roles.add(roles, `رجوع رولات الإدارة بموافقة ${deciderId}`);
    return { ok: true, approved: true, given: roles, asked: record.pending };
}

/** The line posted in REJOIN_LOG_CHANNEL_ID once a request is decided. */
export function decisionLog(memberId, deciderId, roleIds, approved) {
    const roles = roleIds.map((id) => `<@&${id}>`).join('، ') || '—';
    return {
        embeds: [{
            color: approved ? 0x2ecc71 : 0xe74c3c,
            title: approved ? '✅ تمت الموافقة على رجوع رولات الإدارة' : '❌ اترفض رجوع رولات الإدارة',
            description: [`👤 العضو: <@${memberId}>`, `🛡️ الرولات: ${roles}`, `${approved ? '✅ وافق' : '❌ رفض'}: <@${deciderId}>`].join('\n'),
            timestamp: new Date().toISOString(),
        }],
        allowedMentions: { parse: [] },
    };
}

/** Posts the decision in REJOIN_LOG_CHANNEL_ID. Returns true when it was posted. */
export async function logRejoinDecision(guild, memberId, deciderId, roleIds, approved) {
    const channel = guild.channels.cache.get(REJOIN_LOG_CHANNEL_ID)
        || await guild.channels.fetch(REJOIN_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.send) return false;
    return channel.send(decisionLog(memberId, deciderId, roleIds, approved)).then(() => true).catch(() => false);
}
