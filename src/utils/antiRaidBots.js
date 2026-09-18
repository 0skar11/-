import { AuditLogEvent } from 'discord.js';
import { isTrusted, latestExecutor } from './antiRaid.js';
import { logger } from './logger.js';

async function isTrustedBot(member) {
  const trust = await member.guild.client.db?.get?.(`guild:${member.guild.id}:antiRaidTrust`, {
    trustedUserIds: [],
    trustedRoleIds: [],
  });
  const trustedUserIds = Array.isArray(trust?.trustedUserIds) ? trust.trustedUserIds : [];
  const trustedRoleIds = Array.isArray(trust?.trustedRoleIds) ? trust.trustedRoleIds : [];

  return trustedUserIds.includes(member.id)
    || member.roles.cache.some(role => trustedRoleIds.includes(role.id));
}

async function findBotInviter(guild, botId) {
  // Audit-log entries can arrive a moment after GuildMemberAdd.
  // Retry briefly so a trusted inviter is not mistaken for an untrusted one.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inviter = await latestExecutor(guild, AuditLogEvent.BotAdd, botId);
    if (inviter) return inviter;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

/**
 * Remove every role Discord allows the bot to manage, then ban an untrusted bot.
 * @returns {Promise<boolean>} whether the bot was handled by this guard
 */
export async function handleUntrustedBotJoin(member) {
  const { guild, user } = member;
  if (!guild || !user?.bot || user.id === guild.client.user?.id) return false;
  if (await isTrustedBot(member)) return false;

  // Trust belongs to the person who invited the bot, not to the bot's ID.
  // This lets a trusted user add any bot without having to pre-register it.
  const inviter = await findBotInviter(guild, member.id);
  if (inviter && (inviter.id === guild.ownerId || await isTrusted(guild, inviter.id))) return false;

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
