import { MessageFlags } from 'discord.js';
import { getProfile } from '../../../services/cc/ccService.js';
import { invest, sell, getHoldings } from '../../../services/cc/bourseService.js';
import {
    BOURSE_BUTTON_PREFIX,
    PRICE_CHANGED_NOTE,
    bourseFailureText,
    confirmInvestPayload,
    confirmSellPayload,
    investReceiptEmbed,
    sellReceiptEmbed,
} from '../../../services/cc/bourseUi.js';

// The bourse confirm buttons: `bourse:buy|sell:<assetId>:<quantity>:<price>:<userId>` and
// `bourse:cancel:<userId>`. They only work for the member who asked. When the price changed since
// (a new hour started) nothing is bought or sold and the confirmation is shown again at the new price.
const PRESS_COOLDOWN_MS = 2_000;
const lastPress = new Map();

function onCooldown(userId) {
    const now = Date.now();
    if (now - (lastPress.get(userId) || 0) < PRESS_COOLDOWN_MS) return true;
    lastPress.set(userId, now);
    return false;
}

const privately = (interaction, content) => interaction.reply({ content, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral }).catch(() => {});
const failed = (content) => ({ content, embeds: [], components: [], allowedMentions: { parse: [] } });

async function execute(interaction, client, [action, ...args]) {
    if (!interaction.inGuild()) return;
    const ownerId = args[args.length - 1];
    if (ownerId !== interaction.user.id) return privately(interaction, '❌ الزرار ده مش ليك.');
    if (action === 'cancel') return interaction.update(failed('✖️ اتلغى.')).catch(() => {});
    if (action !== 'buy' && action !== 'sell') return privately(interaction, 'الزرار ده مبقاش شغال.');
    if (onCooldown(interaction.user.id)) return privately(interaction, '⏳ استنى ثانية.');

    await interaction.deferUpdate().catch(() => {});
    const [assetId, quantityText, priceText] = args;
    const quantity = Number(quantityText) || 1;
    const expectedPrice = Number(priceText);
    const { guildId, user } = interaction;

    const trade = action === 'buy' ? invest : sell;
    const result = await trade(client, guildId, user.id, assetId, quantity, { expectedPrice });

    let payload;
    if (result.ok) {
        const embed = action === 'buy' ? investReceiptEmbed(user, result) : sellReceiptEmbed(user, result);
        payload = { content: '', embeds: [embed], components: [], allowedMentions: { parse: [] } };
    } else if (result.reason === 'price_changed') {
        payload = await reconfirm(client, guildId, user.id, action, result);
    } else {
        payload = failed(bourseFailureText(result));
    }
    await interaction.editReply(payload).catch(() => {});
}

/** The confirmation again, at the new price. */
async function reconfirm(client, guildId, userId, action, { asset, quantity, price }) {
    if (action === 'buy') {
        const { cc } = await getProfile(client, guildId, userId);
        return confirmInvestPayload(asset, quantity, price, userId, cc, { note: PRICE_CHANGED_NOTE });
    }
    const held = (await getHoldings(client, guildId, userId)).rows.find((row) => row.asset.id === asset.id);
    if (!held || held.qty < quantity) return failed(bourseFailureText({ reason: 'not_owned', asset, owned: held?.qty || 0 }));
    return confirmSellPayload(asset, quantity, price, userId, { owned: held.qty, paid: held.paid }, { note: PRICE_CHANGED_NOTE });
}

export default { name: BOURSE_BUTTON_PREFIX, execute };
