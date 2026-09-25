import { SlashCommandBuilder } from 'discord.js';
import { getProfile, getLeaderboard } from '../../services/cc/ccService.js';
import { CC, formatCC, ccEmbed, ccBoostLine } from '../../config/cc.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/** A member's CC balance, rank and game stats (`cc` / `رصيد` and the games panel). */
export async function ccProfileEmbed(client, guildId, target) {
    const [{ cc, stats }, board] = await Promise.all([
        getProfile(client, guildId, target.id),
        getLeaderboard(client, guildId),
    ]);
    const rank = board.findIndex((row) => row.userId === target.id) + 1;

    const boost = ccBoostLine();
    return ccEmbed(`${CC.emoji} ${CC.name}`, `${target}\n\n💰 الرصيد: ${formatCC(cc)}\n🏆 الترتيب: ${rank ? `#${rank} من ${board.length}` : '—'}${boost ? `\n\n${boost}` : ''}`, {
        thumbnail: target.displayAvatarURL?.() || null,
        fields: [
            { name: '📈 اتجمع', value: `${stats.earned.toLocaleString('en-US')}`, inline: true },
            { name: '🛒 اتصرف', value: `${stats.spent.toLocaleString('en-US')}`, inline: true },
            { name: '🎮 ألعاب جماعية', value: `${stats.gamesPlayed}`, inline: true },
            { name: '🥇 مركز أول', value: `${stats.groupWins}`, inline: true },
            { name: '🏅 توب 3', value: `${stats.podiums}`, inline: true },
            { name: '🙋 فوز فردي', value: `${stats.soloWins}`, inline: true },
        ],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('cc')
        .setDescription(`Show your ${CC.name} (${CC.short}) or another member's`)
        .setDMPermission(false)
        .addUserOption((option) => option.setName('user').setDescription('Member to check').setRequired(false)),

    async execute(interaction, config, client) {
        const target = interaction.options.getUser('user') || interaction.user;
        if (target.bot) {
            await InteractionHelper.safeReply(interaction, { content: 'البوتات مالهاش CC 🤖' });
            return;
        }

        const embed = await ccProfileEmbed(client, interaction.guildId, target);
        await InteractionHelper.safeReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    },
};
