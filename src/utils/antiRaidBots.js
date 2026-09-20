import { AuditLogEvent, Events } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';

const BOT_OWNER_ID = '1159601661392715906';
const GLOBAL_LOG_CHANNEL_ID = '1550564287129456810';

async function getBotAddExecutor(guild, botId) {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 }).catch(() => null);
  return logs?.entries.find((entry) => (
    entry.target?.id === botId && Date.now() - entry.createdTimestamp < 30_000
  )) || null;
}

function isExplicitlyTrusted(config, member) {
  if (!member) return false;
  return member.id === BOT_OWNER_ID
    || config?.antiNukeTrustedUsers?.includes(member.id) === true;
}

export async function handleUntrustedBotJoin(member) {
  if (!member?.guild || !member.user?.bot) return false;
  if (member.id === member.guild.client.user?.id) return false;

  const config = await getGuildConfig(member.client, member.guild.id).catch(() => null);
  const entry = await getBotAddExecutor(member.guild, member.id);
  const inviter = entry?.executor
    ? await member.guild.members.fetch(entry.executor.id).catch(() => null)
    : null;

  // A role named Owner is not trusted automatically. Only the bot owner or an
  // explicitly trusted user may invite bots without enforcement.
  const trusted = isExplicitlyTrusted(config, inviter);
  if (trusted) return false;

  const botRemoved = member.kickable
    ? await member.kick('Anti-Raid: untrusted bot added').then(() => true).catch(() => false)
    : false;
  const inviterRemoved = inviter?.kickable
    ? await inviter.kick('Anti-Raid: invited an untrusted bot').then(() => true).catch(() => false)
    : false;

  await sendAntiNukeLog(member.guild, {
    action: 'Untrusted bot blocked',
    target: `${member.user.tag} (${member.id})`,
    executor: inviter?.user || member.guild.client.user,
    auditLogId: entry?.id,
    severity: 'HIGH',
    channelId: GLOBAL_LOG_CHANNEL_ID,
    details: [
      ['Bot removed', botRemoved ? 'Yes' : 'No'],
      ['Inviter', inviter ? `${inviter.user.tag} (${inviter.id})` : 'Unknown'],
      ['Inviter removed', inviterRemoved ? 'Yes' : 'No'],
      ['Reason', 'No explicit trust; role names do not bypass Anti-Raid'],
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
