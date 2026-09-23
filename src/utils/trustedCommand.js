import { getGuildConfig } from '../services/config/guildConfig.js';

const OWNER_ID = '1159601661392715906';

async function reply(message, content) {
  await message.channel.send(content).catch(() => {});
  return true;
}

/** Lists the Anti-Nuke trusted members, bots and roles for the current guild. */
export async function handleTrustedListCommand(message, client) {
  if (message.author.id !== OWNER_ID) return reply(message, '❌ أمر Trust متاح للمالك فقط.');

  const config = await getGuildConfig(client, message.guild.id);
  const trustedUserIds = Array.isArray(config?.antiNukeTrustedUsers) ? config.antiNukeTrustedUsers : [];
  const trustedRoleIds = Array.isArray(config?.antiNukeTrustedRoles) ? config.antiNukeTrustedRoles : [];

  const users = [];
  const bots = [];
  for (const userId of [...new Set(trustedUserIds)]) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await client.users.fetch(userId).catch(() => null);
    const entry = `<@${userId}> (${user?.tag || user?.username || userId})`;
    if (user?.bot) bots.push(entry);
    else users.push(entry);
  }

  const roles = [];
  for (const roleId of [...new Set(trustedRoleIds)]) {
    const role = await message.guild.roles.fetch(roleId).catch(() => null);
    roles.push(role ? `<@&${role.id}> (${role.name})` : `<@&${roleId}> (رتبة غير موجودة)`);
  }

  return reply(message, [
    '🛡️ **قائمة Trusted في هذا السيرفر**',
    '',
    `**الأعضاء (${users.length}):**`, users.length ? users.join('\n') : 'لا يوجد',
    '',
    `**البوتات (${bots.length}):**`, bots.length ? bots.join('\n') : 'لا يوجد',
    '',
    `**الرتب (${roles.length}):**`, roles.length ? roles.join('\n') : 'لا يوجد',
  ].join('\n'));
}
