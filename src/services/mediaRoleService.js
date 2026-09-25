import { PermissionFlagsBits } from 'discord.js';
import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

// Images/files and links are locked for everyone except members of the `media` role; GIFs are open
// to everyone. The role holds Attach Files + Embed Links and sits right below the chaos (member) role.
// Attach Files is taken off @everyone and chaos, while @everyone keeps Embed Links so GIFs from the
// GIF picker (Tenor/Giphy links) show. Discord permissions can't stop a plain link from being sent,
// so the message guard below deletes those.
const MEDIA_ROLE_NAME = 'media';
const MEDIA_ROLE_COLOR = '#9b59b6';
const CHAOS_ROLE_ID = '1155238281861156955';
const MEDIA_PERMISSIONS = [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
// Taken off @everyone and chaos. Embed Links stays with everyone, or GIFs would show as bare links.
const LOCKED_PERMISSIONS = [PermissionFlagsBits.AttachFiles];
const BLOCKED_NOTICE_DELETE_MS = 5_000;
// Guild config flag set once every member who was in the server got the media role.
const GRANTED_TO_ALL_KEY = 'mediaRoleGrantedToAll';

const LINK = /(?:https?:\/\/|www\.)\S+|(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/iu;
// GIFs anyone may send: GIF picker links (Tenor, Giphy) and .gif files on Discord's CDN. Anything else
// left in the message (another site around them) is still caught as a link.
const GIF_LINK = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:tenor\.com|giphy\.com|gph\.is)\/\S*|(?:https?:\/\/)?(?:cdn\.discordapp\.com|media\.discordapp\.net)\/\S+?\.gif(?:[?#]\S*)?(?=\s|$)/giu;

async function stripMediaPermissions(role) {
  if (!role?.editable || !role.permissions.any(LOCKED_PERMISSIONS)) return false;
  await role.setPermissions(role.permissions.remove(LOCKED_PERMISSIONS), `Media is limited to the ${MEDIA_ROLE_NAME} role`);
  return true;
}

// Gives Embed Links back to @everyone (it used to be locked too) so everyone's GIFs show.
async function allowGifEmbeds(everyone) {
  if (!everyone?.editable || everyone.permissions.has(PermissionFlagsBits.EmbedLinks)) return false;
  await everyone.setPermissions(everyone.permissions.add(PermissionFlagsBits.EmbedLinks), 'GIFs are allowed for everyone');
  return true;
}

/** Creates/updates the media role, places it right below chaos and locks media for everyone else. */
export async function ensureMediaRole(guild) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn(`Media role skipped for ${guild.name}: bot needs Manage Roles.`);
    return { created: false, positioned: false, locked: 0 };
  }

  const roles = await guild.roles.fetch();
  const chaos = roles.get(CHAOS_ROLE_ID);
  let media = roles.find((role) => role.name === MEDIA_ROLE_NAME && !role.managed);
  const created = !media;
  if (!media) {
    media = await guild.roles.create({ name: MEDIA_ROLE_NAME, color: MEDIA_ROLE_COLOR, mentionable: false, permissions: MEDIA_PERMISSIONS, reason: 'Role that may send images, links and GIFs' });
  } else if (media.editable && !media.permissions.has(MEDIA_PERMISSIONS)) {
    await media.setPermissions(media.permissions.add(MEDIA_PERMISSIONS), 'Role that may send images, links and GIFs');
  }

  let positioned = false;
  if (chaos && media.editable && media.position !== chaos.position - 1) {
    if (chaos.position < botMember.roles.highest.position) {
      // setPosition works on the sorted index: moving down from above takes chaos's slot, moving up lands one below it.
      await media.setPosition(media.position > chaos.position ? chaos.position : chaos.position - 1, { reason: `Keep ${MEDIA_ROLE_NAME} right below chaos` });
      positioned = true;
    } else {
      logger.warn(`Media role in ${guild.name} can't be moved next to chaos: the bot's highest role must be higher.`);
    }
  } else if (!chaos) {
    logger.warn(`Media role in ${guild.name}: chaos role ${CHAOS_ROLE_ID} was not found.`);
  }

  let locked = 0;
  for (const role of [guild.roles.everyone, chaos]) {
    if (await stripMediaPermissions(role)) locked += 1;
  }
  await allowGifEmbeds(guild.roles.everyone);
  return { created, positioned, locked };
}

/**
 * Gives the media role once to every member (bots aside) in the server at that moment.
 * A flag in the guild config stops it from running again, so members who join later don't get it.
 */
export async function grantMediaRoleToAllMembers(guild) {
  const db = guild.client?.db;
  if (typeof db?.get !== 'function' || (typeof db.isAvailable === 'function' && !db.isAvailable())) {
    // Without the database the flag can't be read or saved, so it would repeat on every restart.
    logger.warn(`Media role grant skipped for ${guild.name}: database unavailable.`);
    return { skipped: true, granted: 0, failed: 0 };
  }

  const config = await getGuildConfig(guild.client, guild.id);
  if (config?.[GRANTED_TO_ALL_KEY]) return { skipped: true, granted: 0, failed: 0 };

  const media = guild.roles.cache.find((role) => role.name === MEDIA_ROLE_NAME && !role.managed);
  if (!media?.editable) {
    logger.warn(`Media role grant skipped for ${guild.name}: the role is missing or above the bot's highest role.`);
    return { skipped: true, granted: 0, failed: 0 };
  }

  const members = await guild.members.fetch();
  let granted = 0;
  let failed = 0;
  for (const member of members.values()) {
    if (member.user.bot || member.roles.cache.has(media.id)) continue;
    try {
      await member.roles.add(media, 'Media role for everyone in the server');
      granted += 1;
    } catch (error) {
      failed += 1;
      logger.warn(`Could not give the media role to ${member.user.tag} in ${guild.name}: ${error.message}`);
    }
  }

  await updateGuildConfig(guild.client, guild.id, { [GRANTED_TO_ALL_KEY]: true });
  return { skipped: false, granted, failed };
}

/** A message counts as media when it has an attachment or a link. GIF links (the GIF picker's Tenor/Giphy links) don't count. */
export function hasMediaContent(message) {
  return Boolean(message.attachments?.size) || LINK.test((message.content || '').replace(GIF_LINK, ' '));
}

// `شغل <link>` / `play <link>` (with or without a prefix) is a music request, not media, so it isn't blocked.
const PLAY_COMMAND = /^\s*[^\p{L}\p{N}\s]{0,3}(?:شغل|play)\s+\S/iu;

export function isPlayCommand(message) {
  return !message.attachments?.size && PLAY_COMMAND.test(message.content || '');
}

async function canSendMedia(message) {
  if (isServerOwner(message.author.id)) return true;
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member?.roles.cache.some((role) => role.name === MEDIA_ROLE_NAME && !role.managed)) return true;
  if (member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return canLiftHardBan(message.guild, message.author.id);
}

/** Returns true when the message was deleted for sending media without the media role. */
export async function handleMediaMessage(message) {
  if (!hasMediaContent(message) || isPlayCommand(message)) return false;
  if (await canSendMedia(message)) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> الصور واللينكات لرتبة ${MEDIA_ROLE_NAME} بس.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}

export { MEDIA_ROLE_NAME, CHAOS_ROLE_ID, MEDIA_PERMISSIONS };
