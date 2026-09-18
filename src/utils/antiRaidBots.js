import { PermissionFlagsBits } from 'discord.js';
import { isTrusted } from './antiRaid.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';

export async function handleUntrustedBotJoin(member) {
  if (!member.guild || !member.user?.bot) return false;

  const me = member.guild.members.me;
  if (!me || member.id === me.id) return false;

  if (await isTrusted(member.guild, member.id, { member })) {
    return false;
  }

  const myPermissions = me.permissions;
  const removableRoles = member.roles.cache.filter(
    role => role.id !== member.guild.id && !role.managed && role.position < me.roles.highest.position,
  );

  if (myPermissions.has(PermissionFlagsBits.ManageRoles) && removableRoles.size > 0) {
    await member.roles.remove(removableRoles, 'Anti-raid: untrusted bot joined').catch(() => {});
  }

  let actionTaken = 'None';
  if (myPermissions.has(PermissionFlagsBits.BanMembers) && member.bannable) {
    await member.ban({ reason: 'Anti-raid: untrusted bot joined' }).catch(() => {});
    actionTaken = 'Ban';
  } else if (myPermissions.has(PermissionFlagsBits.KickMembers) && member.kickable) {
    await member.kick('Anti-raid: untrusted bot joined').catch(() => {});
    actionTaken = 'Kick';
  }

  await sendAntiNukeLog(member.guild, {
    action: 'Untrusted Bot Join Blocked',
    executor: null,
    target: `${member.user.tag} (${member.id})`,
    details: [
      ['Roles Removed', `${removableRoles.size}`],
      ['Action Taken', actionTaken],
      ['Trust Status', 'Not trusted'],
    ],
    severity: 'CRITICAL',
  });

  return actionTaken !== 'None';
}
