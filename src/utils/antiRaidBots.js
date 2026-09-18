import { AuditLogEvent } from 'discord.js';
import { isTrusted, latestExecutor } from './antiRaid.js';
import { logger } from './logger.js';

const TRUST_KEY = guildId => `guild:${guildId}:antiRaidTrust`;

async function getTrust(guild) {
  const value = await guild.client.db?.get?.(TRUST_KEY(guild.id), {
async function isTrustedBot(member) {
  const trust = await member.guild.client.db?.get?.(`guild:${member.guild.id}:antiRaidTrust`, {
trustedUserIds: [],
trustedRoleIds: [],
});
  const trustedUserIds = Array.isArray(trust?.trustedUserIds) ? trust.trustedUserIds : [];
  const trustedRoleIds = Array.isArray(trust?.trustedRoleIds) ? trust.trustedRoleIds : [];

  return {
    trustedUserIds: Array.isArray(value?.trustedUserIds) ? value.trustedUserIds : [],
    trustedRoleIds: Array.isArray(value?.trustedRoleIds) ? value.trustedRoleIds : [],
  };
  return trustedUserIds.includes(member.id)
    || member.roles.cache.some(role => trustedRoleIds.includes(role.id));
}

async function isTrustedBot(member) {
  const trust = await getTrust(member.guild);
  return trust.trustedUserIds.includes(member.id)
    || member.roles.cache.some(role => trust.trustedRoleIds.includes(role.id));
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
@@ -29,6 +34,11 @@ export async function handleUntrustedBotJoin(member) {
if (!guild || !user?.bot || user.id === guild.client.user?.id) return false;
if (await isTrustedBot(member)) return false;

  // Trust belongs to the person who invited the bot, not to the bot's ID.
  // This lets a trusted user add any bot without having to pre-register it.
  const inviter = await findBotInviter(guild, member.id);
  if (inviter && (inviter.id === guild.ownerId || await isTrusted(guild, inviter.id))) return false;

const botMember = guild.members.me;
if (!botMember) return false;
