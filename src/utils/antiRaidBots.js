import { AuditLogEvent, Events, PermissionFlagsBits } from 'discord.js';
import { isTrusted } from './antiRaid.js';
import { sendAntiNukeLog } from './antiNukeLogging.js';

const handled = new Set();

async function getAdder(guild, botId) {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 }).catch(() => null);
  return logs?.entries.find(entry => entry.target?.id === botId && Date.now() - entry.createdTimestamp < 20_000)?.executor || null;
}

export async function handleUntrustedBotJoin(member) {
  if (!member.guild || !member.user?.bot || handled.has(member.id)) return false;
  handled.add(member.id);
  setTimeout(() => handled.delete(member.id), 60_000);

  const { guild } = member;
  const adder = await getAdder(guild, member.id);
  const trusted = adder && await isTrusted(guild, adder.id);
  if (trusted) {
    await sendAntiNukeLog(guild, { action: 'إضافة بوت مسموحة', executor: adder, target: `${member.user.tag} (${member.id})`, details: [['السبب', 'المنفذ موجود في قائمة Trust']], severity: 'INFO' });
    return false;
  }

  const botMember = guild.members.me;
  const canKickBot = botMember?.permissions.has(PermissionFlagsBits.KickMembers);
  const canKickAdder = botMember?.permissions.has(PermissionFlagsBits.KickMembers);
  let botAction = 'تعذر طرد البوت';
  let adderAction = 'تعذر طرد المدخل';
  if (canKickBot && member.kickable) {
    await member.kick('Anti-Nuke: unauthorized bot added').then(() => { botAction = 'تم طرد البوت'; }).catch(() => {});
  }
  if (adder && !adder.bot && adder.id !== guild.ownerId) {
    const adderMember = await guild.members.fetch(adder.id).catch(() => null);
    if (canKickAdder && adderMember?.kickable) {
      await adderMember.kick('Anti-Nuke: unauthorized bot addition').then(() => { adderAction = 'تم طرد الشخص'; }).catch(() => {});
    }
  }
  await sendAntiNukeLog(guild, { action: 'إضافة بوت بدون صلاحية', executor: adder, target: `${member.user.tag} (${member.id})`, details: [['إجراء البوت', botAction], ['إجراء المدخل', adderAction], ['القاعدة', 'يجب أن يكون المدخل Owner/Admin أو Trusted']], severity: 'CRITICAL', mentionEveryone: true });
  return true;
}

export default {
  name: Events.GuildMemberAdd,
  execute: handleUntrustedBotJoin,
};
