import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getServerInviteUrl } from '../../commands/Moderation/dm.js';

// Ban and kick only (report #133): the member gets a DM with a mention of them that says what happened
// and why, and names the moderator (with a mention) to talk to if they feel it was unfair. It is sent
// before the ban/kick, because afterwards
// the bot no longer shares a server with them and Discord refuses the DM. A kicked member gets a
// button back to the server; a banned one can't rejoin, so there is none.
const ACTIONS = {
    ban: { title: '🔨 اتعملك بان', line: (guild) => `اتعملك **بان** من سيرفر **${guild.name}**.`, color: 0xed4245 },
    kick: { title: '👢 اتعملك كيك', line: (guild) => `اتعملك **كيك** (طرد) من سيرفر **${guild.name}**.`, color: 0xfaa61a },
};

function moderatorLabel(moderator) {
    if (!moderator?.id) return null;
    const tag = moderator.user?.tag || moderator.tag || moderator.user?.username || moderator.username;
    return tag ? `<@${moderator.id}> (${tag})` : `<@${moderator.id}>`;
}

export function buildPunishmentDm(guild, action, reason, inviteUrl = null, { user = null, moderator = null } = {}) {
    const { title, line, color } = ACTIONS[action];
    const staff = moderatorLabel(moderator);
    const lines = [
        `${user ? `${user} ` : ''}${line(guild)}`,
        '',
        `📝 **السبب:** ${reason || 'من غير سبب'}`,
        ...(staff ? [`👮 **الإداري:** ${staff}`, '', `⚖️ لو حاسس إنك مظلوم، اتفاهم مع الإداري ${staff}.`] : []),
    ];
    const embed = {
        color,
        author: { name: guild.name, ...(guild.iconURL?.() ? { icon_url: guild.iconURL() } : {}) },
        title,
        description: lines.join('\n'),
        footer: { text: 'الرسالة دي من إدارة السيرفر' },
        timestamp: new Date().toISOString(),
    };
    const components = action === 'kick' && inviteUrl
        ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(inviteUrl).setLabel('ارجع للسيرفر').setEmoji('🔗'))]
        : [];
    return { embeds: [embed], components };
}

/** DMs `user` about a ban or kick. Never throws: closed DMs must not stop the punishment. Returns true when sent. */
export async function sendPunishmentDm(guild, user, action, reason, moderator = null) {
    if (!user || user.bot || !ACTIONS[action]) return false;
    try {
        const inviteUrl = action === 'kick' ? await getServerInviteUrl(guild).catch(() => null) : null;
        // The member's own mention on top, so the DM is clearly for them.
        await user.send({ content: `${user}`, ...buildPunishmentDm(guild, action, reason, inviteUrl, { user, moderator }) });
        return true;
    } catch (error) {
        logger.debug(`Could not DM ${user.tag || user.id} about the ${action}: ${error.message}`);
        return false;
    }
}
