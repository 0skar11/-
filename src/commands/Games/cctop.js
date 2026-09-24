import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../../services/cc/ccService.js';
import { CC, ccEmbed } from '../../config/cc.js';
import { MEDALS } from '../../services/games/text.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PAGE_SIZE = 15;

/**
 * The CC leaderboard (`top cc` / `cctop` / `توب cc`, the games panel and the live board in the games
 * channel). With a `userId` their rank is shown under the list; the live board passes none.
 */
export async function ccTopEmbed(client, guild, userId = null) {
    const board = await getLeaderboard(client, guild.id);
    const lines = board.slice(0, PAGE_SIZE).map((row, index) => `${MEDALS[index] || `**#${index + 1}**`} <@${row.userId}> — **${row.cc.toLocaleString('en-US')}** ${CC.short}`);
    const total = board.reduce((sum, row) => sum + row.cc, 0);
    const summary = [`👥 ${board.length} عضو`, `🌀 ${total.toLocaleString('en-US')} ${CC.short} في السيرفر`];
    if (userId) {
        const rank = board.findIndex((row) => row.userId === userId) + 1;
        summary.unshift(`👤 ترتيبك: ${rank ? `**#${rank}**` : '—'}`);
    }

    return ccEmbed(`${CC.emoji} Top CC — ${guild.name}`, [
        lines.join('\n') || 'لسه محدش معاه CC. ابدأوا بـ `يومي` والألعاب!',
        '',
        summary.join(' • '),
    ].join('\n'));
}

export default {
    data: new SlashCommandBuilder()
        .setName('cctop')
        .setDescription(`${CC.name} (${CC.short}) leaderboard`)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        const embed = await ccTopEmbed(client, interaction.guild, interaction.user.id);
        await InteractionHelper.safeReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    },
};
