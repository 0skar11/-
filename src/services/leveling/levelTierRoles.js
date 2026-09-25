import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLevelingConfig, saveLevelingConfig } from './leveling.js';

// Level roles: one role per tier, stacked right above the anchor role below in order (higher level = higher role).
// Emojis and colours are their own, apart from the staff roles (👑 ⚡ 🛡️ 🔨 🔰): green for the first
// levels, through blue and purple, up to gold at level 100. They carry no permissions, only a colour.
// Each tier is saved in the leveling config's roleRewards, so the level-up message gives the role
// (and names it) and the startup level role sync hands it to members who already passed that level.
// A member only holds the highest tier they've reached: the new one replaces the one before it.
// The owner asked for the level roles to sit right above this role.
export const LEVEL_ROLES_ABOVE_ROLE_ID = '1551151228833234985';

export const LEVEL_TIERS = [
    { level: 5, name: '🌱 Level 5', color: '#a3e4a1' },
    { level: 10, name: '🍀 Level 10', color: '#27ae60' },
    { level: 15, name: '💧 Level 15', color: '#48dbfb' },
    { level: 20, name: '🌊 Level 20', color: '#2e86de' },
    { level: 30, name: '🔮 Level 30', color: '#8e44ad' },
    { level: 40, name: '🌸 Level 40', color: '#fd79a8' },
    { level: 50, name: '🔥 Level 50', color: '#ff7f50' },
    { level: 75, name: '💎 Level 75', color: '#00d2d3' },
    { level: 100, name: '🌌 Level 100', color: '#ffd700' },
];

const colorNumber = (hex) => parseInt(hex.slice(1), 16);

// Same order discord.js uses for setPosition: bottom first, equal positions broken by the higher ID being lower.
export function sortRolesBottomUp(roles) {
    return [...roles].sort((a, b) => (a.position === b.position ? Number(BigInt(b.id) - BigInt(a.id)) : a.position - b.position));
}

/** The relative move that puts `roleId` right above `belowId` in the bottom-up list of role IDs (0 = already there). */
export function offsetToSitAbove(orderedIds, roleId, belowId) {
    const current = orderedIds.indexOf(roleId);
    const below = orderedIds.indexOf(belowId);
    if (current === -1 || below === -1) return 0;
    if (current === below + 1) return 0;
    // Moving up: taking the role out shifts everything above it down by one.
    return current < below ? below - current : below + 1 - current;
}

async function ensureTierRole(guild, roles, tier) {
    const byName = [...roles.values()].find((role) => role.name === tier.name && !role.managed);
    if (!byName) {
        const role = await guild.roles.create({ name: tier.name, color: tier.color, hoist: false, mentionable: false, permissions: [], reason: `Level ${tier.level} role` });
        return { role, created: true };
    }
    if (byName.editable && byName.color !== colorNumber(tier.color)) {
        await byName.edit({ color: tier.color, reason: `Level ${tier.level} role colour` });
    }
    return { role: byName, created: false };
}

/**
 * Creates the level roles, keeps them stacked right above the anchor role (level 5 first, level 100 on top)
 * and saves them as the level rewards.
 */
export async function ensureLevelTierRoles(client, guild) {
    const summary = { created: 0, moved: 0, rewardsSaved: false };
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn(`Level roles skipped for ${guild.name}: bot needs Manage Roles.`);
        return summary;
    }

    const roles = await guild.roles.fetch();
    const tierRoles = [];
    for (const tier of LEVEL_TIERS) {
        const { role, created } = await ensureTierRole(guild, roles, tier);
        if (created) summary.created += 1;
        tierRoles.push({ tier, role });
    }

    const anchor = guild.roles.cache.get(LEVEL_ROLES_ABOVE_ROLE_ID);
    if (!anchor) {
        logger.warn(`Level roles in ${guild.name}: role ${LEVEL_ROLES_ABOVE_ROLE_ID} was not found, so they were not ordered.`);
    } else {
        let belowId = anchor.id;
        for (const { tier, role } of tierRoles) {
            const ordered = sortRolesBottomUp(guild.roles.cache.values()).map((r) => r.id);
            const offset = offsetToSitAbove(ordered, role.id, belowId);
            if (offset !== 0) {
                if (!role.editable) {
                    logger.warn(`Level role ${tier.name} in ${guild.name} can't be moved: the bot's highest role must be above it.`);
                    break;
                }
                try {
                    await role.setPosition(offset, { relative: true, reason: 'Keep level roles in order above their anchor role' });
                    summary.moved += 1;
                } catch (error) {
                    logger.warn(`Could not move level role ${tier.name} in ${guild.name} (the bot's role must be above all level roles): ${error.message}`);
                    break;
                }
            }
            belowId = role.id;
        }
    }

    const config = await getLevelingConfig(client, guild.id);
    const rewards = { ...(config.roleRewards || {}) };
    let changed = false;
    for (const { tier, role } of tierRoles) {
        if (rewards[tier.level] === role.id) continue;
        rewards[tier.level] = role.id;
        changed = true;
    }
    if (changed) {
        await saveLevelingConfig(client, guild.id, { ...config, roleRewards: rewards });
        summary.rewardsSaved = true;
    }
    return summary;
}
