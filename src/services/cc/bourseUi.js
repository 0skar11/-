// bourseUi.js — the bourse's embeds and buttons, shared by the `bourse` command
// (src/commands/Games/bourse.js) and its confirm buttons (src/interactions/buttons/store/bourse.js).
// Plain embed objects so the emojis stay. Each line starts with Arabic so Discord doesn't reorder it.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CC, ccEmbed, formatCC } from '../../config/cc.js';
import { bourseSettings } from '../../config/store/bourse.js';
import { sellFee } from './bourseService.js';

export const BOURSE_BUTTON_PREFIX = 'bourse';

const number = (value) => Number(value || 0).toLocaleString('en-US');

function assetLabel(asset) {
    return `${asset.emoji} ${asset.name}`;
}

/** `🟢 ▲ 6.1%`, `🔴 ▼ 1.2%`, or '' when the price didn't move. */
export function changeArrow(changePercent) {
    if (changePercent > 0) return `🟢 ▲ ${changePercent}%`;
    if (changePercent < 0) return `🔴 ▼ ${Math.abs(changePercent)}%`;
    return '';
}

function signedCC(amount) {
    if (amount > 0) return `🟢 مكسب ${formatCC(amount)}`;
    if (amount < 0) return `🔴 خسارة ${formatCC(-amount)}`;
    return '⚪ لا مكسب ولا خسارة';
}

/**
 * `اسعار`: a grid of cards (3 per row on a computer), one per asset with its price and its move since
 * last hour, then a card with how to buy and sell. The rules are in the small footer.
 */
export function pricesEmbed({ quotes, nextChangeAt }) {
    const next = Math.floor(nextChangeAt / 1000);
    const cards = quotes.map(({ asset, price, changePercent, raised }) => ({
        name: `${asset.emoji} ${asset.name}`,
        value: [`**${number(price)}** ${CC.emoji}`, [changeArrow(changePercent), raised ? '🔥' : ''].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
        inline: true,
    }));
    const embed = ccEmbed('📈 البورصة', `⏰ الأسعار الجاية <t:${next}:R>`, {
        fields: [
            ...cards,
            { name: '🛒 ازاي تشتري', value: '`شراء عربية`\n`بيع عربية`\n`ممتلكاتي`', inline: true },
        ],
    });
    embed.footer = {
        text: `رسوم البيع ${bourseSettings.sellFeePercent}% ・ أقصى ${bourseSettings.maxOwnedPerAsset} قطع من كل حاجة ・ 🔥 = عليها طلب`,
    };
    return embed;
}

/** `ممتلكاتي`: what the member owns, what they paid and what they'd get selling now. */
export function holdingsEmbed(user, { rows, totalValue, totalPaid, totalIfSold }) {
    if (!rows.length) {
        return ccEmbed('💼 ممتلكاتي', `${user}\n\nمعندكش حاجة لسه. اكتب \`اسعار\` وشوف تشتري إيه 📈`);
    }
    const lines = rows.map((row) => [
        `${row.asset.emoji} **${row.asset.name}** × ${row.qty}`,
        `> دفعت: ${formatCC(row.paid)} ・ قيمتها دلوقتي: ${formatCC(row.value)}`,
        `> لو بعت: ${formatCC(row.ifSold)} ・ ${signedCC(row.profit)}`,
    ].join('\n'));
    return ccEmbed('💼 ممتلكاتي', [`${user}`, '', lines.join('\n\n')].join('\n'), {
        fields: [
            { name: '💵 دفعت', value: formatCC(totalPaid), inline: true },
            { name: '📊 قيمتها', value: formatCC(totalValue), inline: true },
            { name: '🧾 لو بعت كله', value: `${formatCC(totalIfSold)}\n${signedCC(totalIfSold - totalPaid)}`, inline: true },
        ],
        thumbnail: user.displayAvatarURL?.() || null,
    });
}

function confirmRow(action, asset, quantity, price, userId, { label, disabled = false }) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${BOURSE_BUTTON_PREFIX}:${action}:${asset.id}:${quantity}:${price}:${userId}`)
            .setLabel(label)
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder().setCustomId(`${BOURSE_BUTTON_PREFIX}:cancel:${userId}`).setLabel('إلغاء').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );
}

/** The "are you sure?" step before buying, at `price`. The buttons only work for `userId`. */
export function confirmInvestPayload(asset, quantity, price, userId, balance, { note = '' } = {}) {
    const cost = price * quantity;
    const after = balance - cost;
    const embed = ccEmbed('💰 تأكيد الاستثمار', [
        ...(note ? [note, ''] : []),
        `${assetLabel(asset)} × ${quantity}`,
        '',
        `🏷️ سعر القطعة: ${formatCC(price)}`,
        `💵 الإجمالي: ${formatCC(cost)}`,
        `💰 رصيدك: ${formatCC(balance)}`,
        after >= 0 ? `📉 بعد الشراء: ${formatCC(after)}` : `❌ ناقصك ${formatCC(-after)}`,
        '',
        '⏰ السعر ده لحد آخر الساعة بس.',
    ].join('\n'));
    return {
        content: '',
        embeds: [embed],
        components: [confirmRow('buy', asset, quantity, price, userId, { label: 'اشتري', disabled: after < 0 })],
        allowedMentions: { parse: [] },
    };
}

/** The "are you sure?" step before selling `quantity` of the `owned` pieces (that cost `paid`) at `price`. */
export function confirmSellPayload(asset, quantity, price, userId, { owned, paid }, { note = '' } = {}) {
    const gross = price * quantity;
    const fee = sellFee(gross);
    const received = gross - fee;
    const soldCost = owned === quantity ? paid : Math.round((paid * quantity) / owned);
    const embed = ccEmbed('💸 تأكيد البيع', [
        ...(note ? [note, ''] : []),
        `${assetLabel(asset)} × ${quantity} (معاك ${owned})`,
        '',
        `🏷️ سعر القطعة: ${formatCC(price)}`,
        `💵 الإجمالي: ${formatCC(gross)}`,
        `🧾 رسوم البيع (${bourseSettings.sellFeePercent}%): ${formatCC(fee)}`,
        `✅ هتاخد: ${formatCC(received)}`,
        `📊 ${signedCC(received - soldCost)}`,
    ].join('\n'));
    return {
        content: '',
        embeds: [embed],
        components: [confirmRow('sell', asset, quantity, price, userId, { label: 'بيع' })],
        allowedMentions: { parse: [] },
    };
}

const balanceField = (before, after) => ({ name: '💰 رصيدك', value: `قبل: ${formatCC(before)}\nدلوقتي: ${formatCC(after)}`, inline: true });

/** After buying: what was bought on top, then the numbers as cards (3 per row on a computer). */
export function investReceiptEmbed(user, result) {
    return ccEmbed('✅ تم الاستثمار', `${user} اشترى **${assetLabel(result.asset)} × ${result.quantity}**`, {
        color: 'success',
        fields: [
            { name: '🏷️ سعر القطعة', value: formatCC(result.price), inline: true },
            { name: '💵 اتخصم', value: formatCC(result.cost), inline: true },
            { name: '💼 معاك دلوقتي', value: `${result.owned}`, inline: true },
            balanceField(result.before, result.balance),
        ],
    });
}

/** After selling: what was sold on top, then the numbers as cards. */
export function sellReceiptEmbed(user, result) {
    return ccEmbed('✅ تم البيع', `${user} باع **${assetLabel(result.asset)} × ${result.quantity}**\n${signedCC(result.profit)}`, {
        color: 'success',
        fields: [
            { name: '🏷️ سعر القطعة', value: formatCC(result.price), inline: true },
            { name: '🧾 الرسوم', value: formatCC(result.fee), inline: true },
            { name: '✅ وصلك', value: formatCC(result.received), inline: true },
            { name: '💼 فاضل معاك', value: `${result.owned}`, inline: true },
            balanceField(result.before, result.balance),
        ],
    });
}

const FAILURE_TEXT = {
    not_found: '❌ المنتج ده مش في البورصة. اكتب `اسعار` وشوف الأرقام.',
    bad_quantity: `❌ العدد لازم يكون من 1 لـ ${bourseSettings.maxOwnedPerAsset}.`,
};

/** The reason a purchase or a sale failed, as a message. */
export function bourseFailureText(result) {
    if (result.reason === 'no_cc') return `❌ رصيدك ${formatCC(result.balance ?? 0)} مش كفاية.`;
    if (result.reason === 'max_owned') {
        return `❌ أقصى حاجة ${bourseSettings.maxOwnedPerAsset} قطع من ${result.asset ? assetLabel(result.asset) : 'المنتج ده'}، ومعاك ${result.owned}.`;
    }
    if (result.reason === 'not_owned') {
        return result.owned
            ? `❌ معاك ${result.owned} بس من ${assetLabel(result.asset)}.`
            : `❌ معندكش ${result.asset ? assetLabel(result.asset) : 'المنتج ده'}. اكتب \`ممتلكاتي\` وشوف اللي معاك.`;
    }
    return FAILURE_TEXT[result.reason] || '❌ حصلت مشكلة، جرب تاني.';
}

export const PRICE_CHANGED_NOTE = '⚠️ **السعر اتغير!** ده السعر الجديد، أكد تاني لو لسه عايز.';
