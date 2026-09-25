import { SlashCommandBuilder } from 'discord.js';
import { CC } from '../../config/cc.js';
import { ccStoreSettings } from '../../config/store/ccStoreItems.js';
import { getProfile } from '../../services/cc/ccService.js';
import { storeCatalog, findStoreItem, storeMode } from '../../services/cc/ccStoreService.js';
import { storeListEmbed, inventoryEmbed, confirmPurchasePayload, purchaseFailureText } from '../../services/cc/storeUi.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// The CC store: `متجر` (list), `شراء 1` / `شراء 1 3` (buy, confirmed with a button), `مخزني`
// (inventory). The store room and its pinned panel are src/services/cc/storeChannel.js.
export default {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription(`The ${CC.name} (${CC.short}) store`)
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('list').setDescription('Show what the store sells'))
        .addSubcommand((sub) => sub
            .setName('buy')
            .setDescription('Buy an item from the store')
            .addStringOption((option) => option.setName('item').setDescription('Item number or id').setRequired(true))
            .addIntegerOption((option) => option
                .setName('quantity')
                .setDescription('How many (default 1)')
                .setMinValue(1)
                .setMaxValue(ccStoreSettings.maxQuantity)
                .setRequired(false)))
        .addSubcommand((sub) => sub.setName('inventory').setDescription('What you bought')),

    // `store` / `shop` alone shows the list.
    normalizePrefixArgs(args) {
        return args.length ? args : ['list'];
    },

    async execute(interaction, config, client) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { allowedMentions: { parse: [] }, ...payload });
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') return reply({ embeds: [storeListEmbed()] });

        if (sub === 'inventory') {
            const { inventory } = await getProfile(client, interaction.guildId, interaction.user.id);
            return reply({ embeds: [inventoryEmbed(interaction.user, inventory)] });
        }

        if (storeMode() === 'closed') return reply({ content: purchaseFailureText({ reason: 'closed' }) });
        const item = findStoreItem(interaction.options.getString('item'), storeCatalog());
        if (!item) return reply({ content: purchaseFailureText({ reason: 'not_found' }) });
        const quantity = interaction.options.getInteger('quantity') || 1;
        if (quantity < 1 || quantity > ccStoreSettings.maxQuantity || (item.type === 'role' && quantity !== 1)) {
            return reply({ content: purchaseFailureText({ reason: 'bad_quantity' }) });
        }
        const { cc } = await getProfile(client, interaction.guildId, interaction.user.id);
        return reply(confirmPurchasePayload(item, quantity, interaction.user.id, cc));
    },
};
