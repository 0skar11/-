import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { GAMES_BOTS_CHANNEL_ID } from '../../config/games.js';
import { isGamesBotsChannel } from '../../services/cc/gamesBotChannel.js';
import { CC } from '../../config/cc.js';
import { bourseSettings } from '../../config/store/bourse.js';
import { getProfile } from '../../services/cc/ccService.js';
import { findAsset, getMarket, getHoldings } from '../../services/cc/bourseService.js';
import { pricesEmbed, holdingsEmbed, confirmInvestPayload, confirmSellPayload, bourseFailureText } from '../../services/cc/bourseUi.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// The CC bourse: `اسعار` (prices of the hour), `استثمار عربية` / `استثمار 3 2` (buy), `بيع عربية` /
// `بيع 3 2` (sell) and `ممتلكاتي` (holdings). Buying and selling are confirmed with a button
// (src/interactions/buttons/store/bourse.js). The rules are src/config/store/bourse.js.
const assetOption = (option) => option.setName('asset').setDescription('Asset number or name (see /bourse prices)').setRequired(true);
const quantityOption = (option) => option
    .setName('quantity')
    .setDescription('How many (default 1)')
    .setMinValue(1)
    .setMaxValue(bourseSettings.maxOwnedPerAsset)
    .setRequired(false);

const WRONG_CHANNEL_DELETE_MS = 5_000;

async function sendToBourseChannel(interaction, reply) {
    const content = `📈 البورصة في <#${GAMES_BOTS_CHANNEL_ID}> بس.`;
    const source = interaction._sourceMessage;
    if (!source) return reply({ content, flags: MessageFlags.Ephemeral });
    // Prefix form: the command and the notice both disappear after a few seconds.
    const notice = await source.channel.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
    setTimeout(() => {
        notice?.delete().catch(() => {});
        source.delete().catch(() => {});
    }, WRONG_CHANNEL_DELETE_MS).unref?.();
}

export default {
    data: new SlashCommandBuilder()
        .setName('bourse')
        .setDescription(`The ${CC.name} (${CC.short}) bourse: prices change every hour`)
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('prices').setDescription('Prices of the hour'))
        .addSubcommand((sub) => sub.setName('invest').setDescription('Buy an asset at the price of the hour').addStringOption(assetOption).addIntegerOption(quantityOption))
        .addSubcommand((sub) => sub.setName('sell').setDescription('Sell an asset at the price of the hour').addStringOption(assetOption).addIntegerOption(quantityOption))
        .addSubcommand((sub) => sub.setName('holdings').setDescription('What you own and what it is worth')),

    // `بورصة` alone shows the prices, and so do `استثمار` / `بيع` without an asset. A name of several
    // words (`بيع سبيكة دهب 2`) is kept together as the asset.
    normalizePrefixArgs(args) {
        const [sub, ...rest] = args;
        if (!args.length || ((sub === 'invest' || sub === 'sell') && !rest.length)) return ['prices'];
        if (sub !== 'invest' && sub !== 'sell') return args;
        const quantity = rest.length > 1 && /^\d+$/u.test(rest[rest.length - 1]) ? [rest.pop()] : [];
        return [sub, rest.join(' '), ...quantity];
    },

    async execute(interaction, config, client) {
        const reply = (payload) => InteractionHelper.safeReply(interaction, { allowedMentions: { parse: [] }, ...payload });
        // The bourse works only in the games bots channel (report #121), so it doesn't flood the chat.
        if (!isGamesBotsChannel(interaction.channel, interaction.channelId)) return sendToBourseChannel(interaction, reply);
        const sub = interaction.options.getSubcommand();
        const { guildId, user } = interaction;

        if (sub === 'prices') return reply({ embeds: [pricesEmbed(await getMarket(client, guildId))] });
        if (sub === 'holdings') return reply({ embeds: [holdingsEmbed(user, await getHoldings(client, guildId, user.id))] });

        const asset = findAsset(interaction.options.getString('asset'));
        if (!asset) return reply({ content: bourseFailureText({ reason: 'not_found' }) });
        const quantity = interaction.options.getInteger('quantity') || 1;
        if (quantity < 1 || quantity > bourseSettings.maxOwnedPerAsset) return reply({ content: bourseFailureText({ reason: 'bad_quantity' }) });

        const { rows, quotes } = await getHoldings(client, guildId, user.id);
        const held = rows.find((row) => row.asset.id === asset.id);
        const owned = held?.qty || 0;
        const { price } = quotes.find((entry) => entry.asset.id === asset.id);

        if (sub === 'invest') {
            if (owned + quantity > bourseSettings.maxOwnedPerAsset) return reply({ content: bourseFailureText({ reason: 'max_owned', asset, owned }) });
            const { cc } = await getProfile(client, guildId, user.id);
            return reply(confirmInvestPayload(asset, quantity, price, user.id, cc));
        }

        if (owned < quantity) return reply({ content: bourseFailureText({ reason: 'not_owned', asset, owned }) });
        return reply(confirmSellPayload(asset, quantity, price, user.id, { owned, paid: held.paid }));
    },
};
