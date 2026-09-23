import { PermissionFlagsBits } from 'discord.js';
import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';
import { logger } from '../utils/logger.js';

// Images/files, links and GIFs are locked for everyone except members of the `media` role.
// The role holds Attach Files + Embed Links and sits right above the chaos (member) role;
// both permissions are taken off @everyone and chaos. Discord permissions can't stop a
// plain link or a GIF-picker link from being sent, so the message guard below deletes those.
const MEDIA_ROLE_NAME = 'media';
const MEDIA_ROLE_COLOR = '#9b59b6';
const CHAOS_ROLE_ID = '1155238281861156955';
const MEDIA_PERMISSIONS = [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
const BLOCKED_NOTICE_DELETE_MS = 1_000;

const LINK = /(?:https?:\/\/|www\.)\S+|(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/iu;

async function stripMediaPermissions(role) {
  if (!role?.editable || !role.permissions.any(MEDIA_PERMISSIONS)) return false;
  await role.setPermissions(role.permissions.remove(MEDIA_PERMISSIONS), `Media is limited to the ${MEDIA_ROLE_NAME} role`);
  return true;
}

/** Creates/updates the media role, places it right above chaos and locks media for everyone else. */
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
  if (chaos && media.editable && media.position !== chaos.position + 1) {
    if (chaos.position + 1 < botMember.roles.highest.position) {
      // setPosition works on the sorted index: moving up from below takes chaos's slot, moving down lands one above it.
      await media.setPosition(media.position < chaos.position ? chaos.position : chaos.position + 1, { reason: `Keep ${MEDIA_ROLE_NAME} right above chaos` });
      positioned = true;
    } else {
      logger.warn(`Media role in ${guild.name} can't go above chaos: the bot's highest role must be higher.`);
    }
  } else if (!chaos) {
    logger.warn(`Media role in ${guild.name}: chaos role ${CHAOS_ROLE_ID} was not found.`);
  }

  let locked = 0;
  for (const role of [guild.roles.everyone, chaos]) {
    if (await stripMediaPermissions(role)) locked += 1;
  }
  return { created, positioned, locked };
}

/** A message counts as media when it has an attachment or a link (GIFs from the picker are Tenor links). */
export function hasMediaContent(message) {
  return Boolean(message.attachments?.size) || LINK.test(message.content || '');
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
  if (!hasMediaContent(message)) return false;
  if (await canSendMedia(message)) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> الصور واللينكات والـ gifs لرتبة ${MEDIA_ROLE_NAME} بس.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}

export { MEDIA_ROLE_NAME, CHAOS_ROLE_ID, MEDIA_PERMISSIONS };
