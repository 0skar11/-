import { SlashCommandBuilder } from 'discord.js';
import { claimDaily } from '../../services/cc/ccService.js';
import { CC, formatCC, ccEmbed } from '../../config/cc.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// `daily` / `يومي`: the only way to get CC outside the games.
export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription(`Claim your daily ${CC.name} (${CC.short})`)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        const premiumRoleId = config?.premiumRoleId;
        const premium = Boolean(premiumRoleId && interaction.member?.roles?.cache?.has(premiumRoleId));
        const result = await claimDaily(client, interaction.guildId, interaction.user.id, { premium });

        if (!result.ok) {
            const nextAt = Math.floor((Date.now() + result.remaining) / 1000);
            await InteractionHelper.safeReply(interaction, {
                embeds: [ccEmbed(`${CC.emoji} Daily`, `⏳ خدت اليومي بتاعك خلاص.\nتقدر تاخده تاني <t:${nextAt}:R>.\n\n🎮 عايز CC دلوقتي؟ العب \`العاب\`.`, { color: 'warning' })],
            });
            return;
        }

        const bonus = result.bonus ? `\n✨ بونص البريميوم: +${formatCC(result.bonus)}` : '';
        await InteractionHelper.safeReply(interaction, {
            embeds: [ccEmbed(`${CC.emoji} Daily`, `✅ ${interaction.user} خد +${formatCC(result.amount)}${bonus}\n\n💰 رصيدك: ${formatCC(result.balance)}\n⏳ اليومي الجاي <t:${Math.floor(result.nextAt / 1000)}:R>`)],
            allowedMentions: { parse: [] },
        });
    },
};
