import { MessageFlags } from 'discord.js';
import { STORE_BUTTON_PREFIX, storeHelpEmbed, inventoryEmbed, purchase } from '../../../services/cc/storeUi.js';
import { getProfile } from '../../../services/cc/ccService.js';
import { ccProfileEmbed } from '../../../commands/Games/cc.js';
import { ccTopEmbed } from '../../../commands/Games/cctop.js';

// Buttons of the store panel and of the buy confirmation (`storepanel:<action>`). The panel answers
// privately so the store room stays clean. The confirmation buttons carry the buyer's ID and only
// work for them: `storepanel:confirm:<itemId>:<quantity>:<userId>` and `storepanel:cancel:<userId>`.
const PRESS_COOLDOWN_MS = 2_000;
const lastPress = new Map();

function onCooldown(userId) {
    const now = Date.now();
    if (now - (lastPress.get(userId) || 0) < PRESS_COOLDOWN_MS) return true;
    lastPress.set(userId, now);
    return false;
}

const privately = (interaction, payload) => interaction.reply({ ...payload, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral }).catch(() => {});

async function execute(interaction, client, [action, ...args]) {
    if (!interaction.inGuild()) return;

    if (action === 'confirm' || action === 'cancel') {
        const ownerId = args[args.length - 1];
        if (ownerId !== interaction.user.id) return privately(interaction, { content: '❌ الزرار ده مش ليك.' });
        if (action === 'cancel') {
            return interaction.update({ content: '✖️ اتلغى الشراء.', embeds: [], components: [] }).catch(() => {});
        }
        if (onCooldown(interaction.user.id)) return privately(interaction, { content: '⏳ استنى ثانية.' });
        await interaction.deferUpdate().catch(() => {});
        const [itemId, quantity] = args;
        const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);
        const { payload } = await purchase(client, member, itemId, Number(quantity) || 1);
        await interaction.editReply(payload).catch(() => {});
        return;
    }

    if (action === 'help') return privately(interaction, { embeds: [storeHelpEmbed()] });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let embed = null;
    if (action === 'balance') embed = await ccProfileEmbed(client, interaction.guildId, interaction.user);
    if (action === 'inventory') embed = inventoryEmbed(interaction.user, (await getProfile(client, interaction.guildId, interaction.user.id)).inventory);
    if (action === 'top') embed = await ccTopEmbed(client, interaction.guild, interaction.user.id);
    await interaction.editReply(embed ? { embeds: [embed], allowedMentions: { parse: [] } } : { content: 'الزرار ده مبقاش شغال.' });
}

export default { name: STORE_BUTTON_PREFIX, execute };
