import { Events, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';

function hasManageGuild(message) {
  return message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)
    || message.guild?.ownerId === message.author?.id;
}

function parseTarget(content) {
  const match = String(content || '').trim().match(/^(تراست|انتراست)\s+(?:رول|رتبة)\s+<@&(\d+)>$/u);
  return match ? { action: match[1], roleId: match[2] } : null;
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;

    const target = parseTarget(message.content);
    if (!target) return;

    // Prevent the legacy user-only shortcut handler from processing this
    // role-targeted form as a user trust command as well.
    message.content = '';

    if (!hasManageGuild(message)) {
      await message.channel.send('❌ ليس لديك صلاحية Manage Server.').catch(() => {});
      return;
    }

    const role = await message.guild.roles.fetch(target.roleId).catch(() => null);
    if (!role || role.managed || role.id === message.guild.id) {
      await message.channel.send('❌ الرتبة غير موجودة أو لا يمكن الوثوق بها.').catch(() => {});
      return;
    }

    const config = await getGuildConfig(message.client, message.guild.id);
    const trustedRoles = new Set(Array.isArray(config?.antiNukeTrustedRoles) ? config.antiNukeTrustedRoles : []);

    if (target.action === 'تراست') {
      trustedRoles.add(role.id);
    } else {
      trustedRoles.delete(role.id);
    }

    await updateGuildConfig(message.client, message.guild.id, {
      antiNukeTrustedRoles: [...trustedRoles],
    });

    await message.channel.send(
      target.action === 'تراست'
        ? `🛡️ تم إعطاء رتبة **${role.name}** حماية من Anti-Nuke.`
        : `✅ تم إزالة رتبة **${role.name}** من قائمة الحماية.`,
    ).catch(() => {});
  },
};
