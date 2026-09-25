import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getUserLevelData, saveLevelingConfig } from './leveling.js';

import { getUserLevelPrefix } from '../../utils/database/keys.js';
import { MEDIA_ROLE_NAME } from '../mediaRoleService.js';

// The media role (images, links, GIFs) comes by itself at this level. The level system only gives it,
// never takes it away: members who were in the server when media was locked got it without a level.
export const MEDIA_ROLE_LEVEL = 5;

function findMediaRole(guild) {
    for (const role of guild.roles?.cache?.values?.() || []) {
        if (role.name === MEDIA_ROLE_NAME && !role.managed) return role;
    }
    return null;
}

/** Roles the level system gives on top of the level rewards (never removed): the media role at level 5. */
export function extraLevelRoles(guild) {
    const media = findMediaRole(guild);
    return media ? [{ level: MEDIA_ROLE_LEVEL, roleId: media.id }] : [];
}

async function listLevelUserIds(client, guildId) {
    if (!client.db?.list) return [];

    const prefixes = [getUserLevelPrefix(guildId), `${guildId}:leveling:users:`];
    const userIds = new Set();

    for (const prefix of prefixes) {
        let keys = await client.db.list(prefix).catch(() => []);
        if (!Array.isArray(keys)) {
            keys = typeof keys === 'object' && keys !== null ? Object.keys(keys) : [];
        }

        for (const key of keys) {
            if (!key.startsWith(prefix)) continue;
            const userId = key.slice(prefix.length);
            if (/^\d{17,19}$/.test(userId)) userIds.add(userId);
        }
    }

    return [...userIds];
}

/**
 * Which level roles a member at `level` should gain and lose. A member holds every reward role at or
 * below their level (Level 5, Level 10, ... stack). With `removeAbove`, rewards above their level are
 * taken away, for when an admin lowers someone's level.
 */
export function levelRoleChanges(level, roleRewards = {}, heldRoleIds = new Set(), { removeAbove = false, extra = [] } = {}) {
    const add = [];
    const remove = [];
    // `extra` roles are given like rewards but never removed.
    const keep = new Set(extra.map((entry) => entry.roleId));
    const entries = [
        ...Object.entries(roleRewards).map(([levelStr, roleId]) => [Number(levelStr), roleId]),
        ...extra.map((entry) => [Number(entry.level), entry.roleId]),
    ]
        .filter(([requiredLevel, roleId]) => Number.isFinite(requiredLevel) && roleId)
        .sort((a, b) => a[0] - b[0]);
    const earned = new Set(entries.filter(([requiredLevel]) => level >= requiredLevel).map(([, roleId]) => roleId));

    for (const [requiredLevel, roleId] of entries) {
        if (earned.has(roleId)) {
            if (!heldRoleIds.has(roleId) && !add.some((entry) => entry.roleId === roleId)) add.push({ level: requiredLevel, roleId });
        } else if (removeAbove && !keep.has(roleId) && heldRoleIds.has(roleId) && !remove.some((entry) => entry.roleId === roleId)) {
            remove.push({ level: requiredLevel, roleId });
        }
    }
    return { add, remove };
}

/**
 * Gives a member every level role they've reached (and, with `removeAbove`, takes the ones above their
 * level). Returns the IDs of the roles that were added and removed. Never throws.
 */
export async function syncMemberLevelRoles(guild, member, level, roleRewards, { removeAbove = false, reason = 'Level role' } = {}) {
    const result = { added: [], removed: [] };
    if (!member?.roles?.cache) return result;

    const { add, remove } = levelRoleChanges(level, roleRewards || {}, new Set(member.roles.cache.keys()), { removeAbove, extra: extraLevelRoles(guild) });
    const findRole = async (roleId) => guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));

    for (const { level: requiredLevel, roleId } of add) {
        try {
            const role = await findRole(roleId);
            if (!role) {
                logger.warn(`Role ${roleId} not found for level ${requiredLevel} reward in guild ${guild.id}`);
                continue;
            }
            await member.roles.add(role, `${reason}: reached level ${requiredLevel}`);
            result.added.push(roleId);
        } catch (error) {
            logger.warn(`Could not give level ${requiredLevel} role to ${member.id} in guild ${guild.id}: ${error.message}`);
        }
    }
    for (const { level: requiredLevel, roleId } of remove) {
        try {
            const role = await findRole(roleId);
            if (!role) continue;
            await member.roles.remove(role, `${reason}: now below level ${requiredLevel}`);
            result.removed.push(roleId);
        } catch (error) {
            logger.warn(`Could not remove level ${requiredLevel} role from ${member.id} in guild ${guild.id}: ${error.message}`);
        }
    }
    return result;
}

/** Re-checks one member's level roles against their saved level (after an admin change or a rejoin). */
export async function syncMemberLevelRolesFromData(client, guild, member, { removeAbove = false, reason } = {}) {
    try {
        const config = await getLevelingConfig(client, guild.id);
        if (config.enabled === false) return { added: [], removed: [] };
        const levelData = await getUserLevelData(client, guild.id, member.id);
        return await syncMemberLevelRoles(guild, member, levelData.level, config.roleRewards, { removeAbove, reason });
    } catch (error) {
        logger.warn(`Level role sync failed for ${member?.id} in guild ${guild?.id}: ${error.message}`);
        return { added: [], removed: [] };
    }
}

export async function reconcileLevelRoles(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        prunedRewardEntries: 0,
        rolesReAwarded: 0,
        errors: 0,
    };

    const guilds = guildId
        ? [client.guilds.cache.get(guildId)].filter(Boolean)
        : [...client.guilds.cache.values()];

    for (const guild of guilds) {
        summary.scannedGuilds += 1;

        try {
            const cfg = await getLevelingConfig(client, guild.id);
            if (cfg.enabled === false) continue;

            const rewards = { ...(cfg.roleRewards || {}) };
            let configChanged = false;

            for (const [level, roleId] of Object.entries(rewards)) {
                const role =
                    guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
                if (!role) {
                    delete rewards[level];
                    configChanged = true;
                    summary.prunedRewardEntries += 1;
                    logger.warn(
                        `Removed missing level ${level} reward role ${roleId} from config in guild ${guild.id}`,
                    );
                }
            }

            if (configChanged) {
                cfg.roleRewards = rewards;
                await saveLevelingConfig(client, guild.id, cfg);
            }

            if (Object.keys(rewards).length === 0 && extraLevelRoles(guild).length === 0) continue;

            const userIds = await listLevelUserIds(client, guild.id);

            for (const userId of userIds) {
                const levelData = await getUserLevelData(client, guild.id, userId);
                if (levelData.level <= 0) continue;
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;

                const { added } = await syncMemberLevelRoles(guild, member, levelData.level, rewards, { reason: 'Level reward (startup sync)' });
                summary.rolesReAwarded += added.length;
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Level role sync failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}
