// storeUi.js — the store's embeds and buttons, shared by the `store` command
// (src/commands/Games/store.js), the store room panel (storeChannel.js) and its buttons
// (src/interactions/buttons/store/storePanel.js). Plain embed objects so the emojis stay.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { CC, ccEmbed, formatCC } from '../../config/cc.js';
import { ccStoreItems, ccStoreDemoItems, ccStoreSettings, storeRoomSettings } from '../../config/store/ccStoreItems.js';
import { storeMode, storeCatalog, buyItem } from './ccStoreService.js';

export const STORE_BUTTON_PREFIX = 'storepanel';
// The footer of the panel's commands card; it marks the panel so a restart edits it instead of posting a new one.
export const STORE_PANEL_FOOTER = '📌 أوامر المتجر بس هنا ・ أي رسالة تانية بتتمسح';
// Footers of older panels, so they are still found and edited.
const OLD_PANEL_FOOTERS = [`🛒 متجر ${CC.short} • الرسالة دي بتنزل تاني كل ${storeRoomSettings.repostEvery} رسايل`];
const PANEL_COMMANDS_COLOR = 0x80848e;
const TRIAL_LINE = '🧪 **المتجر تجريبي دلوقتي**: الشراء بيتجرب بس، ومفيش CC بيتخصم ولا حاجة بتتسلم.';
const CLOSED_LINE = '🔒 **المتجر مقفول دلوقتي**، هيفتح قريب.';

// Shown as cards side by side (inline fields, 3 per row). Each line starts with Arabic and never
// mixes a command with its explanation, so Discord doesn't reorder the words.
export const STORE_COMMANDS = [
    ['🛍️ متجر', 'يعرض المنتجات وأسعارها'],
    ['🛒 شراء 1', 'تشتري المنتج رقم 1'],
    ['🎒 مخزني', 'الحاجات اللي اشتريتها'],
    ['💰 رصيد', 'تعرف رصيدك'],
    ['🏆 توب cc', 'ترتيب السيرفر'],
    ['🔢 شراء 1 3', 'تشتري 3 قطع مرة واحدة'],
];

// The short commands card under the panel (the full list is in ❓ المساعدة).
const PANEL_COMMANDS = [
    ['متجر', 'المنتجات'],
    ['شراء 1', 'تشتري منتج'],
    ['مخزني', 'مشترياتك'],
];

export function isStorePanelFooter(text) {
    return text === STORE_PANEL_FOOTER || OLD_PANEL_FOOTERS.includes(text);
}

/** The commands as a header field plus one card (inline field) per command. */
export function commandFields(header = 'اكتب الأمر هنا في الروم 👇') {
    return [
        { name: '⌨️ الأوامر', value: header },
        ...STORE_COMMANDS.map(([name, value]) => ({ name, value, inline: true })),
    ];
}

function modeLine(mode = storeMode()) {
    if (mode === 'trial') return TRIAL_LINE;
    return mode === 'closed' ? CLOSED_LINE : '';
}

function itemLabel(item) {
    return `${item.emoji ? `${item.emoji} ` : ''}${item.name}`;
}

/** Each item as its name, then its price and description on their own lines (so nothing is reordered). */
export function itemLines(items) {
    return items.map((item, index) => [
        `**${index + 1}.** ${item.emoji || '🔹'} **${item.name}**`,
        `> السعر: ${formatCC(item.price)}`,
        `> ${item.description || '—'}${item.maxOwned ? ` ・ أقصى عدد: ${item.maxOwned}` : ''}`,
    ].join('\n'));
}

/** One full-width field per item: `1 ・ 💎 رتبة VIP`, then its price and description on their own lines. */
function itemFields(items) {
    if (!items.length) return [{ name: '🛍️ المنتجات', value: '> لسه مفيش منتجات، هتتضاف قريب.' }];
    return items.slice(0, 20).map((item, index) => ({
        name: `${index + 1} ・ ${itemLabel(item)}`.slice(0, 256),
        value: [`> السعر: ${CC.emoji} ${item.price.toLocaleString('en-US')}`, `> ${item.description || '—'}`].join('\n').slice(0, 1024),
    }));
}

function modeTag(mode) {
    if (mode === 'trial') return '🧪 **تجريبي** ・ الشراء بيتجرب بس ومفيش CC بيتخصم';
    return mode === 'closed' ? CLOSED_LINE : '';
}

/**
 * The pinned panel of the store room: a card with the items, a small grey card with the main
 * commands under it, then the buy menu and the buttons.
 */
export function buildStorePanel(guild, { settings = ccStoreSettings } = {}) {
    const mode = storeMode(settings);
    const items = storeCatalog(settings);
    const itemsEmbed = ccEmbed(`🛒 متجر ${CC.name}`, modeTag(mode), { fields: itemFields(items) });
    const commandsEmbed = ccEmbed('⌨️ الأوامر', '', {
        color: PANEL_COMMANDS_COLOR,
        fields: PANEL_COMMANDS.map(([name, value]) => ({ name, value, inline: true })),
    });
    commandsEmbed.footer = { text: STORE_PANEL_FOOTER };

    return {
        content: '',
        embeds: [itemsEmbed, commandsEmbed],
        components: storePanelComponents(items, mode),
        allowedMentions: { parse: [] },
    };
}

function storePanelComponents(items, mode) {
    const rows = [];
    if (items.length && mode !== 'closed') {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`${STORE_BUTTON_PREFIX}:buy`)
                .setPlaceholder(mode === 'trial' ? '🧪 اختار منتج تجرب تشتريه...' : '🛍️ اختار منتج تشتريه...')
                .addOptions(items.slice(0, 25).map((item, index) => ({
                    label: `${index + 1}. ${item.name}`.slice(0, 100),
                    description: `${item.price.toLocaleString('en-US')} ${CC.short} ・ ${item.description || ''}`.slice(0, 100),
                    value: item.id,
                    ...(item.emoji ? { emoji: item.emoji } : {}),
                }))),
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:balance`).setLabel('رصيدي').setEmoji('💰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:inventory`).setLabel('مخزني').setEmoji('🎒').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:top`).setLabel('توب CC').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:help`).setLabel('المساعدة').setEmoji('❓').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
}

/** `متجر`: the items and their prices. */
export function storeListEmbed(settings = ccStoreSettings) {
    const mode = storeMode(settings);
    const items = storeCatalog(settings);
    return ccEmbed('🛍️ منتجات المتجر', [
        ...(modeLine(mode) ? [modeLine(mode), ''] : []),
        itemLines(items).join('\n') || 'لسه مفيش منتجات، هتتضاف قريب.',
        '',
        items.length ? '🛒 للشراء اكتب شراء وبعدها رقم المنتج، أو اختاره من القايمة في الرسالة المثبتة.' : '',
    ].join('\n').trim());
}

export function storeHelpEmbed() {
    return ccEmbed('❓ ازاي تستخدم المتجر', [
        '🛒 تقدر تشتري من القايمة اللي في الرسالة المثبتة، وبعدها تأكد بزرار ✅.',
        ...(modeLine() ? ['', modeLine()] : []),
    ].join('\n'), {
        fields: [
            ...commandFields('ودي الأوامر اللي تقدر تكتبها 👇'),
            { name: `💡 ازاي تكسب ${CC.short}`, value: '🎮 تكسب في الألعاب\n📈 لما تعلى لفل\n🔁 لما حد يحوّلك' },
        ],
    });
}

/** `مخزني`: what the member owns (real and demo item names are both known). */
export function inventoryEmbed(user, inventory = {}) {
    const known = [...ccStoreItems, ...ccStoreDemoItems];
    const lines = Object.entries(inventory)
        .filter(([, count]) => Number(count) > 0)
        .map(([id, count]) => {
            const item = known.find((entry) => entry.id === id);
            return `${item?.emoji || '📦'} **${item?.name || id}** × ${count}`;
        });
    return ccEmbed('🎒 مخزني', `${user}\n\n${lines.join('\n') || 'مخزنك فاضي لسه. اكتب `متجر` وشوف المنتجات 🛍️'}`, {
        thumbnail: user.displayAvatarURL?.() || null,
    });
}

/** The "are you sure?" step before buying. The buttons only work for `userId`. */
export function confirmPurchasePayload(item, quantity, userId, balance, mode = storeMode()) {
    const cost = item.price * quantity;
    const after = balance - cost;
    const embed = ccEmbed(`${mode === 'trial' ? '🧪 ' : ''}تأكيد الشراء`, [
        `${itemLabel(item)}${quantity > 1 ? ` × ${quantity}` : ''}`,
        `> ${item.description || '—'}`,
        '',
        `💵 السعر: ${formatCC(cost)}`,
        `💰 رصيدك: ${formatCC(balance)}`,
        after >= 0 ? `📉 بعد الشراء: ${formatCC(after)}` : `❌ ناقصك ${formatCC(-after)}`,
        ...(mode === 'trial' ? ['', TRIAL_LINE] : []),
    ].join('\n'));
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${STORE_BUTTON_PREFIX}:confirm:${item.id}:${quantity}:${userId}`)
            .setLabel(mode === 'trial' ? 'تجربة الشراء' : 'تأكيد')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(after < 0),
        new ButtonBuilder().setCustomId(`${STORE_BUTTON_PREFIX}:cancel:${userId}`).setLabel('إلغاء').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

const FAILURE_TEXT = {
    closed: CLOSED_LINE,
    not_found: '❌ المنتج ده مش موجود. اكتب `متجر` وشوف الأرقام.',
    bad_quantity: `❌ العدد لازم يكون من 1 لـ ${ccStoreSettings.maxQuantity} (والرتب قطعة واحدة بس).`,
    owned: '❌ الرتبة دي معاك أصلاً.',
    max_owned: '❌ وصلت لأقصى عدد تقدر تملكه من المنتج ده.',
    role_failed: '❌ معرفتش أديك الرتبة، ورجعتلك الـ CC بتاعتك. كلم الإدارة.',
};

export function purchaseFailureText(result) {
    if (result.reason === 'no_cc') return `❌ رصيدك ${formatCC(result.balance ?? 0)} مش كفاية.`;
    return FAILURE_TEXT[result.reason] || '❌ حصلت مشكلة، جرب تاني.';
}

/** The receipt after a (real or trial) purchase. */
export function purchaseReceiptEmbed(user, result) {
    const lines = [
        `${user}`,
        '',
        `${itemLabel(result.item)}${result.quantity > 1 ? ` × ${result.quantity}` : ''}`,
        `💵 ${result.trial ? 'كان هيتخصم' : 'اتخصم'}: ${formatCC(result.cost)}`,
        `💰 رصيدك ${result.trial ? 'لسه' : 'دلوقتي'}: ${formatCC(result.balance)}`,
    ];
    if (result.trial) lines.push('', '🧪 ده شراء تجريبي، مفيش CC اتخصم ولا حاجة اتسلمت.');
    return ccEmbed(result.trial ? '🧪 شراء تجريبي تم' : '✅ تم الشراء', lines.join('\n'), { color: 'success' });
}

/** Buys and returns the reply payload (receipt or the reason it failed). */
export async function purchase(client, member, itemId, quantity) {
    const result = await buyItem(client, member, itemId, quantity);
    if (!result.ok) return { ok: false, payload: { content: purchaseFailureText(result), embeds: [], components: [], allowedMentions: { parse: [] } } };
    return { ok: true, payload: { content: '', embeds: [purchaseReceiptEmbed(member.user || member, result)], components: [], allowedMentions: { parse: [] } } };
}
