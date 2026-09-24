import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';

// Game roles for Onboarding: no colour, no permissions, and kept at the very bottom of the role list
// (Valorant on top, Other right above @everyone). Each role's icon is its game emoji from
// src/assets/emojis; role icons need the server's ROLE_ICONS feature (boost level 2).
const EMOJI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/emojis');

export const GAME_ROLES = [
  { name: 'Valorant', emoji: 'game_valorant' },
  { name: 'Among Us', emoji: 'game_amongus' },
  { name: 'Minecraft', emoji: 'game_minecraft' },
  { name: 'Roblox', emoji: 'game_roblox' },
  { name: 'Codenames', emoji: 'game_codenames' },
  { name: 'Fortnite', emoji: 'game_fortnite' },
  { name: 'PUBG', emoji: 'game_pubg' },
  { name: 'Brawlhalla', emoji: 'game_brawlhalla' },
  { name: 'ARK', emoji: 'game_ark' },
  { name: 'Warframe', emoji: 'game_warframe' },
  { name: 'Other', emoji: 'game_other' },
].map((game) => ({ ...game, icon: path.join(EMOJI_DIR, `${game.emoji}.png`) }));

const REASON = 'Game role for Onboarding';
// Guild config key holding a hash of the icon files last put on the game roles. When the emoji
// files change, every game role gets the new icon once, even when it already had one.
const ICONS_VERSION_KEY = 'gameRoleIconsVersion';

async function iconsVersion() {
  const hash = createHash('sha1');
  for (const game of GAME_ROLES) hash.update(game.emoji).update(await readFile(game.icon));
  return hash.digest('hex');
}

const hasDatabase = (guild) => {
  const db = guild.client?.db;
  return typeof db?.get === 'function' && !(typeof db.isAvailable === 'function' && !db.isAvailable());
};

// Lowest role first. Roles on the same position are ordered like Discord does: the older (smaller id) one is higher.
const idKey = (role) => String(role.id).padStart(20, '0');
const byPosition = (a, b) => a.position - b.position || idKey(b).localeCompare(idKey(a));

const findRole = (roles, name) => roles.find((role) => !role.managed && role.name.toLowerCase() === name.toLowerCase());

/** Creates the game roles and keeps them colourless, permissionless, with their icon and at the bottom. */
export async function ensureGameRoles(guild) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { skipped: true, created: 0, icons: 0, positioned: false };
  }

  const canUseIcons = guild.features?.includes('ROLE_ICONS') ?? false;
  const roles = await guild.roles.fetch();
  let created = 0;
  let icons = 0;

  // New icon files: replace the icons already on the roles. Without the database only missing icons are set.
  const version = canUseIcons && hasDatabase(guild) ? await iconsVersion() : null;
  const newIcons = Boolean(version) && (await getGuildConfig(guild.client, guild.id))?.[ICONS_VERSION_KEY] !== version;

  for (const game of GAME_ROLES) {
    let role = findRole(roles, game.name);
    if (!role) {
      role = await guild.roles.create({
        name: game.name,
        color: 0,
        permissions: [],
        hoist: false,
        mentionable: false,
        ...(canUseIcons ? { icon: game.icon } : {}),
        reason: REASON,
      });
      created += 1;
      if (canUseIcons) icons += 1;
    } else if (role.editable) {
      const edit = {};
      if (role.color !== 0) edit.color = 0;
      if (role.permissions.bitfield !== 0n) edit.permissions = [];
      if (canUseIcons && (newIcons || (!role.icon && !role.unicodeEmoji))) edit.icon = game.icon;
      if (Object.keys(edit).length) {
        role = await role.edit({ ...edit, reason: REASON });
        if (edit.icon) icons += 1;
      }
    } else {
      logger.warn(`Game role ${game.name} in ${guild.name} is above the bot's highest role and can't be edited.`);
    }
  }

  if (newIcons) await updateGuildConfig(guild.client, guild.id, { [ICONS_VERSION_KEY]: version });

  // Fetch again: the roles created or edited above are not in `roles`.
  const positioned = await keepGameRolesAtBottom(guild);
  return { skipped: false, created, icons, positioned, canUseIcons };
}

/**
 * Moves the game roles to the very bottom of the role list (Other right above @everyone, Valorant on
 * top of the group). Discord puts every new role at the bottom, so this runs again whenever roles change.
 * Returns true when the roles were moved.
 */
export async function keepGameRolesAtBottom(guild) {
  const roles = await guild.roles.fetch();
  const gameRoles = GAME_ROLES.map((game) => findRole(roles, game.name)).filter(Boolean).reverse();
  if (!gameRoles.length) return false;

  const current = [...roles.values()].filter((role) => role.id !== guild.id).sort(byPosition);
  if (gameRoles.every((role, index) => current[index]?.id === role.id)) return false;
  if (!gameRoles.every((role) => role.editable)) {
    logger.warn(`Game roles in ${guild.name} can't all be moved to the bottom: some are above the bot's highest role.`);
    return false;
  }

  // Send the whole order (like discord.js does for one role) so no other role ends up between them.
  const gameIds = new Set(gameRoles.map((role) => role.id));
  const order = [...gameRoles, ...current.filter((role) => !gameIds.has(role.id))];
  await guild.roles.setPositions(order.map((role, index) => ({ role: role.id, position: index + 1 })));
  return true;
}

// Role changes come in bursts (moving roles fires one update per role), so wait for them to settle.
const SETTLE_MS = 3_000;
const pending = new Map();

/** Re-checks the game roles' place a few seconds after roles in the guild were created or moved. */
export function scheduleKeepGameRolesAtBottom(guild) {
  clearTimeout(pending.get(guild.id));
  pending.set(guild.id, setTimeout(async () => {
    pending.delete(guild.id);
    try {
      await keepGameRolesAtBottom(guild);
    } catch (error) {
      logger.error(`Failed to keep the game roles at the bottom in ${guild.name}:`, error);
    }
  }, SETTLE_MS));
}
