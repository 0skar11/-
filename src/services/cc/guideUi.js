// guideUi.js — `شرح`: a short, simple guide to CC, the store and the bourse, sent to the member in DM
// (src/commands/Games/guide.js). Every number comes from the config, so the guide never goes stale.
// Plain embed objects so the emojis stay.

import { CC, ccEmbed, ccBoostLine } from '../../config/cc.js';
import { bourseSettings } from '../../config/store/bourse.js';
import { INVITE_REWARDS } from '../../config/inviteRewards.js';
import { GAMES_BOTS_CHANNEL_ID } from '../../config/games.js';

const n = (value) => Number(value || 0).toLocaleString('en-US');

export function buildGuideEmbeds({ boostLine = ccBoostLine() } = {}) {
    const { demand } = bourseSettings;
    const { transfer, gamesBot, levelUp } = CC;
    return [
        ccEmbed(`${CC.emoji} شرح ${CC.short} والمتجر والبورصة`, [
            `**${CC.short}** هي فلوس السيرفر. بتجمعها وتصرفها في المتجر أو تستثمرها في البورصة.`,
            '',
            '💰 `رصيد` ← تعرف رصيدك',
            '🏆 `توب cc` ← ترتيب السيرفر',
            ...(boostLine ? ['', boostLine] : []),
        ].join('\n')),
        ccEmbed('💡 تكسب CC ازاي؟', [
            `🎮 **الألعاب** في <#${GAMES_BOTS_CHANNEL_ID}>: الفوز في لعبة جماعية **${n(gamesBot.win)}**، وأول واحد يكتب الإجابة **${n(gamesBot.answer)}**`,
            `⭐ **اللفل**: كل لفل جديد بيديك (رقم اللفل × ${n(levelUp.perLevel)})، يعني لفل 10 = ${n(levelUp.perLevel * 10)}`,
            `📨 **الدعوات**: **${n(INVITE_REWARDS.reward)}** لكل حد تدعوه ويوصل لفل ${INVITE_REWARDS.level} ويقعد ${INVITE_REWARDS.minStayDays} أيام`,
            '🔁 **التحويل**: صحابك يقدروا يحوّلولك',
        ].join('\n\n'), { color: 'success' }),
        ccEmbed('🛒 المتجر', [
            '🛍️ `متجر` ← يفتح المتجر بالمنتجات والأسعار، وتشتري من القايمة على طول',
            '🛒 `متجر 1` أو `متجر اسم المنتج` ← تشتري منتج',
            '🔢 `متجر 1 3` ← تشتري 3 قطع مرة واحدة',
            '🎒 `مخزني` ← الحاجات اللي اشتريتها',
            '',
            'قبل أي شراء بيجيلك زرار ✅ تأكد بيه.',
        ].join('\n')),
        ccEmbed('📈 البورصة (الاستثمار)', [
            `حاجات زي العربية والشقة والطيارة، بتشتريها وتبيعها في <#${GAMES_BOTS_CHANNEL_ID}>.`,
            `**السعر بيتغير كل ساعة**، ممكن يزيد أو يقل لحد **${bourseSettings.maxMovePercent}%**.`,
            '',
            '📊 `اسعار` ← أسعار الساعة دي',
            '💵 `شراء عربية` أو `استثمار عربية` ← تشتري (ولو عايز 2: `شراء عربية 2`)',
            '💸 `بيع عربية` ← تبيع بسعر الساعة',
            '💼 `ممتلكاتي` ← اللي معاك ومكسبك أو خسارتك',
            '',
            '🧠 **الفكرة:** اشتري والسعر واطي، وبيع لما يعلى.',
            `🔥 لو الناس اشتروا **${demand.guaranteedRiseUnits} قطعة أو أكتر** من حاجة في نفس الساعة، سعرها **لازم يزيد** الساعة الجاية.`,
            `🧾 البيع عليه رسوم **${bourseSettings.sellFeePercent}%**، وأقصى حاجة **${bourseSettings.maxOwnedPerAsset} قطع** من كل حاجة.`,
        ].join('\n'), { color: 'info' }),
        ccEmbed('🔁 التحويل', [
            '`تحويل @صاحبك 100` ← تبعتله 100',
            `أول ${transfer.cheapPerWeek} تحويلات في الأسبوع عليهم ضريبة **${transfer.taxPercent}%**، وبعدها الضريبة بتزيد (لحد ${transfer.maxTaxPercent}%).`,
            `أقل تحويل ${n(transfer.minAmount)} ${CC.short}.`,
        ].join('\n')),
    ];
}
