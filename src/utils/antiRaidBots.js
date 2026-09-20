import { AuditLogEvent, Events } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';

const GLOBAL_LOG_CHANNEL_ID = '1550564287129456810';

async function getBotAddExecutor(guild, botId) {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 }).catch(() => null);
  return logs?.entries.find((entry) => (
    entry.target?.id === botId && Date.now() - entry.createdTimestamp < 15_000
  )) || null;
}

async function isTrustedMember(guild, config, member) {
  if (!member) return false;
  if (member.id === guild.ownerId || member.id === guild.client.user?.id) return true;
  if (config?.antiNukeTrustedUsers?.includes(member.id)) return true;

  const trustedRoles = new Set([
    ...(config?.antiNukeTrustedRoles || []),
    ...(config?.antiRaidTrustedRoles || []),
  ]);
  return member.roles.cache.some((role) => trustedRoles.has(role.id));
}

export async function handleUntrustedBotJoin(member) {
  if (!member?.guild || !member.user?.bot) return false;
  if (member.id === member.guild.client.user?.id) return false;

  const config = await getGuildConfig(member.client, member.guild.id).catch(() => null);
  const entry = await getBotAddExecutor(member.guild, member.id);
  const executor = entry?.executor
    ? await member.guild.members.fetch(entry.executor.id).catch(() => null)
    : null;

  // If Discord has not exposed the audit entry yet, the bot is still removed;
  // the inviter is only acted on when Discord identifies them safely.
  const trusted = await isTrustedMember(member.guild, config, executor);
  if (trusted) return false;

  const botRemoved = member.kickable
    ? await member.kick('Anti-Nuke: untrusted bot join').then(() => true).catch(() => false)
    : false;
  const inviterRemoved = executor && executor.id !== member.guild.ownerId && executor.kickable
    ? await executor.kick('Anti-Nuke: invited an untrusted bot').then(() => true).catch(() => false)
    : false;

  await sendAntiNukeLog(member.guild, {
    action: 'Untrusted bot blocked',
    target: `${member.user.tag} (${member.id})`,
    executor: executor?.user || member.guild.client.user,
    auditLogId: entry?.id,
    severity: 'HIGH',
    channelId: GLOBAL_LOG_CHANNEL_ID,
    details: [
      ['Bot removed', botRemoved ? 'Yes' : 'No'],
      ['Inviter', executor ? `${executor.user.tag} (${executor.id})` : 'Unknown'],
      ['Inviter removed', inviterRemoved ? 'Yes' : 'No'],
      ['Reason', 'Inviter and bot were not trusted'],
    ],
  });

  return botRemoved || inviterRemoved;
}

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await handleUntrustedBotJoin(member);
  },
};
