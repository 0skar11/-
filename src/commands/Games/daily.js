import { SlashCommandBuilder } from 'discord.js';
import { claimDaily } from '../../services/cc/ccService.js';
import { CC, formatCC, ccEmbed } from '../../config/cc.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

/** Claims `member`'s daily CC and returns the embed to show. */
export async function dailyEmbed(client, member, guildConfig) {
    const premiumRoleId = guildConfig?.premiumRoleId;
    const premium = Boolean(premiumRoleId && member?.roles?.cache?.has(premiumRoleId));
    const result = await claimDaily(client, member.guild.id, member.id, { premium });

    if (!result.ok) {
        const nextAt = Math.floor((Date.now() + result.remaining) / 1000);
        return ccEmbed(`${CC.emoji} Daily`, `⏳ خدت اليومي بتاعك خلاص.\nتقدر تاخده تاني <t:${nextAt}:R>.\n\n🎮 عايز CC دلوقتي؟ العب في روم الألعاب.`, { color: 'warning' });
    }
    const bonus = result.bonus ? `\n✨ بونص البريميوم: +${formatCC(result.bonus)}` : '';
    return ccEmbed(`${CC.emoji} Daily`, `✅ ${member} خد +${formatCC(result.amount)}${bonus}\n\n💰 رصيدك: ${formatCC(result.balance)}\n⏳ اليومي الجاي <t:${Math.floor(result.nextAt / 1000)}:R>`);
}

// `daily` / `يومي`: the only way to get CC outside the games.
export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription(`Claim your daily ${CC.name} (${CC.short})`)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        await InteractionHelper.safeReply(interaction, {
            embeds: [await dailyEmbed(client, interaction.member, config)],
            allowedMentions: { parse: [] },
        });
    },
};
