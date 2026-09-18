import { logger } from './logger.js';

const TRUST_KEY = guildId => `guild:${guildId}:antiRaidTrust`;

async function getTrust(guild) {
  const value = await guild.client.db?.get?.(TRUST_KEY(guild.id), {
    trustedUserIds: [],
    trustedRoleIds: [],
  });

  return {
    trustedUserIds: Array.isArray(value?.trustedUserIds) ? value.trustedUserIds : [],
    trustedRoleIds: Array.isArray(value?.trustedRoleIds) ? value.trustedRoleIds : [],
  };
}

async function isTrustedBot(member) {
  const trust = await getTrust(member.guild);
  return trust.trustedUserIds.includes(member.id)
    || member.roles.cache.some(role => trust.trustedRoleIds.includes(role.id));
}

/**
 * Remove every role Discord allows the bot to manage, then ban an untrusted bot.
 * @returns {Promise<boolean>} whether the bot was handled by this guard
 */
export async function handleUntrustedBotJoin(member) {
  const { guild, user } = member;
  if (!guild || !user?.bot || user.id === guild.client.user?.id) return false;
  if (await isTrustedBot(member)) return false;

  const botMember = guild.members.me;
  if (!botMember) return false;

  // Discord cannot modify @everyone, managed/integration roles, or roles at/above
  // the bot's highest role. In that case, leave the bot untouched as requested.
  const botHighest = botMember.roles.highest;
  if (member.roles.highest.position >= botHighest.position) {
    logger.warn(`Anti-raid skipped untrusted bot ${user.tag}: its highest role is not below this bot.`);
    return false;
  }

  const removableRoles = member.roles.cache.filter(role =>
    role.id !== guild.id
    && !role.managed
    && role.position < botHighest.position,
  );

  try {
    if (removableRoles.size > 0) {
      await member.roles.remove(
        removableRoles,
        'Anti-raid: untrusted bot joined; remove all manageable roles',
      );
    }

    await member.ban({
      deleteMessageSeconds: 0,
      reason: 'Anti-raid: untrusted bot joined the server',
    });

    logger.warn(`Anti-raid removed roles and banned untrusted bot ${user.tag} (${user.id}) in ${guild.name}`);
    return true;
  } catch (error) {
    logger.error(`Anti-raid failed to contain untrusted bot ${user.tag} in ${guild.name}:`, error);
    return false;
  }
}
