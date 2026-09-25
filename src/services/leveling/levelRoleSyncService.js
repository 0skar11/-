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
 * Which level roles a member at `level` should gain and lose. A member holds only the highest level
 * role they've reached: reaching a new one takes the one before it away. With `removeAbove`, rewards
 * above their level are taken away too, for when an admin lowers someone's level. `extra` roles (media)
 * are given from their level and never taken away.
 */
export function levelRoleChanges(level, roleRewards = {}, heldRoleIds = new Set(), { removeAbove = false, extra = [] } = {}) {
    const add = [];
    const remove = [];
    const byLevel = (a, b) => a[0] - b[0];
    const valid = ([requiredLevel, roleId]) => Number.isFinite(requiredLevel) && roleId;
    const rewards = Object.entries(roleRewards).map(([levelStr, roleId]) => [Number(levelStr), roleId]).filter(valid).sort(byLevel);
    const extras = extra.map((entry) => [Number(entry.level), entry.roleId]).filter(valid).sort(byLevel);
    const keep = new Set(extras.map(([, roleId]) => roleId));

    // The reward for the highest level reached is the only level role the member should hold.
    const current = rewards.filter(([requiredLevel]) => level >= requiredLevel).at(-1) || null;
    const wanted = new Map(current ? [[current[1], current[0]]] : []);
    for (const [requiredLevel, roleId] of extras) {
        if (level >= requiredLevel && !wanted.has(roleId)) wanted.set(roleId, requiredLevel);
    }

    for (const [roleId, requiredLevel] of wanted) {
        if (!heldRoleIds.has(roleId)) add.push({ level: requiredLevel, roleId });
    }
    for (const [requiredLevel, roleId] of rewards) {
        if (wanted.has(roleId) || keep.has(roleId) || !heldRoleIds.has(roleId)) continue;
        if (requiredLevel > level && !removeAbove) continue;
        if (!remove.some((entry) => entry.roleId === roleId)) remove.push({ level: requiredLevel, roleId });
    }
    return { add, remove };
}

/**
 * Gives a member the level role for their level (and media from level 5), and takes the lower level
 * roles away (with `removeAbove`, the ones above their level too). Returns the IDs of the roles that
 * were added and removed. Never throws.
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
            await member.roles.remove(role, `${reason}: level ${requiredLevel} role replaced`);
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
        rolesRemoved: 0,
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

                const { added, removed } = await syncMemberLevelRoles(guild, member, levelData.level, rewards, { reason: 'Level reward (startup sync)' });
                summary.rolesReAwarded += added.length;
                summary.rolesRemoved += removed.length;
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Level role sync failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}
