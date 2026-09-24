import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

// Game roles for Onboarding: no colour, no permissions, and kept at the very bottom of the role list
// (Valorant on top, Other right above @everyone). Each role's icon is its game emoji from
// src/assets/emojis; role icons need the server's ROLE_ICONS feature (boost level 2).
const EMOJI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/emojis');

export const GAME_ROLES = [
  { name: 'Valorant', emoji: 'game_valorant' },
  { name: 'Among Us', emoji: 'game_amongus' },
  { name: 'Minecraft', emoji: 'game_minecraft' },
  { name: 'Roblox', emoji: 'game_roblox' },
  { name: 'Other', emoji: 'game_other' },
].map((game) => ({ ...game, icon: path.join(EMOJI_DIR, `${game.emoji}.png`) }));

const REASON = 'Game role for Onboarding';

const findRole = (roles, name) => roles.find((role) => !role.managed && role.name.toLowerCase() === name.toLowerCase());

/** Creates the game roles and keeps them colourless, permissionless, with their icon and at the bottom. */
export async function ensureGameRoles(guild) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { skipped: true, created: 0, icons: 0, positioned: false };
  }

  const canUseIcons = guild.features?.includes('ROLE_ICONS') ?? false;
  const roles = await guild.roles.fetch();
  const gameRoles = [];
  let created = 0;
  let icons = 0;

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
      if (canUseIcons && !role.icon && !role.unicodeEmoji) edit.icon = game.icon;
      if (Object.keys(edit).length) {
        role = await role.edit({ ...edit, reason: REASON });
        if (edit.icon) icons += 1;
      }
    } else {
      logger.warn(`Game role ${game.name} in ${guild.name} is above the bot's highest role and can't be edited.`);
    }
    gameRoles.push(role);
  }

  // Bottom of the list: Other at position 1 (right above @everyone), Valorant on top of the group.
  const wanted = [...gameRoles].reverse();
  const bottom = [...roles.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => a.position - b.position)
    .slice(0, wanted.length);
  let positioned = false;
  if (created || wanted.some((role, index) => bottom[index]?.id !== role.id)) {
    if (wanted.every((role) => role.editable)) {
      await guild.roles.setPositions(wanted.map((role, index) => ({ role: role.id, position: index + 1 })));
      positioned = true;
    } else {
      logger.warn(`Game roles in ${guild.name} can't all be moved to the bottom: some are above the bot's highest role.`);
    }
  }

  return { skipped: false, created, icons, positioned, canUseIcons };
}
