import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard } from '../../services/cc/ccService.js';
import { CC, ccEmbed } from '../../config/cc.js';
import { MEDALS } from '../../services/games/text.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const PAGE_SIZE = 15;

/** The CC leaderboard with `userId`'s rank under it (`top cc` / `cctop` / `توب cc` and the games panel). */
export async function ccTopEmbed(client, guild, userId) {
    const board = await getLeaderboard(client, guild.id);
    const rank = board.findIndex((row) => row.userId === userId) + 1;
    const lines = board.slice(0, PAGE_SIZE).map((row, index) => `${MEDALS[index] || `**#${index + 1}**`} <@${row.userId}> — **${row.cc.toLocaleString('en-US')}** ${CC.short}`);
    const total = board.reduce((sum, row) => sum + row.cc, 0);

    return ccEmbed(`${CC.emoji} Top CC — ${guild.name}`, [
        lines.join('\n') || 'لسه محدش معاه CC. ابدأوا بـ `يومي` و `العاب`!',
        '',
        `👤 ترتيبك: ${rank ? `**#${rank}**` : '—'} • 👥 ${board.length} عضو • 🌀 ${total.toLocaleString('en-US')} ${CC.short} في السيرفر`,
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
