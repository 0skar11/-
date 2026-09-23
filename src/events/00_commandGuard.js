import { Events } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

const COMMANDS = new Set([
  'وارن', 'وارنات', 'تايم', 'انتايم', 'بان', 'انبان', 'كلير', 'ان', 'شيل', 'ر', 'رول', 'ب', 'رتبة', 'ازالةرتبة', 'purge', 'trusted', 'trustedlist', 'warn', 'warnings', 'timeout', 'untimeout', 'ban', 'unban', 'clear', 'remove', 'role', 'roll', 'lock', 'unlock', 'ق',
]);
const PERMISSIONS = new Map([
  ['وارن', PermissionFlagsBits.ModerateMembers], ['وارنات', PermissionFlagsBits.ModerateMembers], ['warn', PermissionFlagsBits.ModerateMembers], ['warnings', PermissionFlagsBits.ModerateMembers],
  ['تايم', PermissionFlagsBits.ModerateMembers], ['انتايم', PermissionFlagsBits.ModerateMembers], ['timeout', PermissionFlagsBits.ModerateMembers], ['untimeout', PermissionFlagsBits.ModerateMembers],
  ['بان', PermissionFlagsBits.BanMembers], ['انبان', PermissionFlagsBits.BanMembers], ['ban', PermissionFlagsBits.BanMembers], ['unban', PermissionFlagsBits.BanMembers],
  ['كلير', PermissionFlagsBits.ModerateMembers], ['clear', PermissionFlagsBits.ModerateMembers], ['ر', PermissionFlagsBits.ManageRoles], ['رول', PermissionFlagsBits.ManageRoles], ['ب', PermissionFlagsBits.ManageRoles], ['شيل', PermissionFlagsBits.ManageRoles], ['رتبة', PermissionFlagsBits.ManageRoles], ['ازالةرتبة', PermissionFlagsBits.ManageRoles], ['role', PermissionFlagsBits.ManageRoles], ['remove', PermissionFlagsBits.ManageRoles], ['roll', PermissionFlagsBits.ManageRoles], ['purge', PermissionFlagsBits.ManageMessages], ['ق', PermissionFlagsBits.ManageChannels], ['lock', PermissionFlagsBits.ManageChannels], ['unlock', PermissionFlagsBits.ManageChannels],
]);

function firstCommand(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  const first = parts[0]?.toLowerCase();
  return { first, parts };
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    const { first, parts } = firstCommand(message.content);
    // Prefixed commands (e.g. `!todo remove 1`) legitimately contain these words as
    // subcommands/arguments, so only plain chat is neutralised here.
    const isPrefixed = /^[^\p{L}\p{N}\s<]/u.test(first || '');
    const commandIndex = parts.findIndex((part) => COMMANDS.has(part.toLowerCase()));
    if (!isPrefixed && commandIndex > 0) {
      message.content = '';
      return;
    }
    if (!COMMANDS.has(first)) return;
    const permission = PERMISSIONS.get(first);
    const member = message.member;
    if (permission && member && !member.permissions.has(permission) && message.guild.ownerId !== member.id) {
      message.content = '';
    }
  },
};
