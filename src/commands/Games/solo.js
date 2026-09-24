import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getActiveGame } from '../../services/games/session.js';
import { playSoloQuestion, playSoloNumber, playSlots } from '../../services/games/solo.js';
import { CC } from '../../config/cc.js';

// Solo games: `سؤال`, `رقم`, `سلوت`. A win pays a few CC, capped per day (see config/cc.js).
const GAMES = { question: playSoloQuestion, number: playSoloNumber, slots: playSlots };
// Games that read the player's next messages; one at a time per member, and not while a group game runs in the channel.
const CHAT_GAMES = new Set(['question', 'number']);
const playing = new Set();

export default {
    abuseProtection: { enabled: true, maxAttempts: 3, windowMs: 30_000 },
    data: new SlashCommandBuilder()
        .setName('solo')
        .setDescription(`Play a solo game (a win gives ${CC.solo.win} CC, up to ${CC.solo.dailyCap} CC a day)`)
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('question').setDescription('Answer one general knowledge question'))
        .addSubcommand((sub) => sub.setName('number').setDescription('Guess the number from 1 to 50 in 6 tries'))
        .addSubcommand((sub) => sub.setName('slots').setDescription('Spin the slot machine')),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const play = GAMES[subcommand];
        if (!play || !interaction.channel?.isTextBased?.()) return;

        const readsChat = CHAT_GAMES.has(subcommand);
        if (readsChat) {
            if (getActiveGame(interaction.channel.id)) {
                await InteractionHelper.safeReply(interaction, { content: '⚠️ في لعبة جماعية شغالة في الروم ده، العب في روم تاني.', flags: MessageFlags.Ephemeral });
                return;
            }
            if (playing.has(interaction.user.id)) {
                await InteractionHelper.safeReply(interaction, { content: '⚠️ خلص لعبتك الأول.', flags: MessageFlags.Ephemeral });
                return;
            }
            playing.add(interaction.user.id);
        }
        try {
            await play(interaction, client);
        } finally {
            if (readsChat) playing.delete(interaction.user.id);
        }
    },
};
