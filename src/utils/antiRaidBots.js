import { Events } from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';

export async function handleUntrustedBotJoin(member) {
  if (!member?.guild || !member.user?.bot) return false;
  const config = await getGuildConfig(member.client, member.guild.id).catch(() => null);
  const trusted = new Set(config?.antiNukeTrustedUsers || []);
  if (trusted.has(member.id) || member.id === member.guild.client.user?.id) return false;

  if (member.kickable) {
    await member.kick('Anti-Nuke: untrusted bot join').catch(() => {});
    await sendAntiNukeLog(member.guild, {
      action: 'Untrusted bot blocked',
      target: `${member.user.tag} (${member.id})`,
      executor: member.guild.client.user,
      severity: 'HIGH',
    });
    return true;
  }
  return false;
}

export default { name: Events.GuildMemberAdd, async execute(member) { await handleUntrustedBotJoin(member); } };
