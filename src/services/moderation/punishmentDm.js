import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getServerInviteUrl } from '../../commands/Moderation/dm.js';

// Ban and kick only (report #133): the member gets a DM that says what happened and why, from the
// server's staff (never naming the moderator). It is sent before the ban/kick, because afterwards
// the bot no longer shares a server with them and Discord refuses the DM. A kicked member gets a
// button back to the server; a banned one can't rejoin, so there is none.
const ACTIONS = {
    ban: { title: '🔨 اتعملك بان', line: (guild) => `اتعملك **بان** من سيرفر **${guild.name}**.`, color: 0xed4245 },
    kick: { title: '👢 اتعملك كيك', line: (guild) => `اتعملك **كيك** (طرد) من سيرفر **${guild.name}**.`, color: 0xfaa61a },
};

export function buildPunishmentDm(guild, action, reason, inviteUrl = null) {
    const { title, line, color } = ACTIONS[action];
    const embed = {
        color,
        author: { name: guild.name, ...(guild.iconURL?.() ? { icon_url: guild.iconURL() } : {}) },
        title,
        description: `${line(guild)}\n\n📝 **السبب:** ${reason || 'من غير سبب'}`,
        footer: { text: 'الرسالة دي من إدارة السيرفر' },
        timestamp: new Date().toISOString(),
    };
    const components = action === 'kick' && inviteUrl
        ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(inviteUrl).setLabel('ارجع للسيرفر').setEmoji('🔗'))]
        : [];
    return { embeds: [embed], components };
}

/** DMs `user` about a ban or kick. Never throws: closed DMs must not stop the punishment. Returns true when sent. */
export async function sendPunishmentDm(guild, user, action, reason) {
    if (!user || user.bot || !ACTIONS[action]) return false;
    try {
        const inviteUrl = action === 'kick' ? await getServerInviteUrl(guild).catch(() => null) : null;
        await user.send(buildPunishmentDm(guild, action, reason, inviteUrl));
        return true;
    } catch (error) {
        logger.debug(`Could not DM ${user.tag || user.id} about the ${action}: ${error.message}`);
        return false;
    }
}
