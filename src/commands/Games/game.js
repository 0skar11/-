import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { withChannelGame, getActiveGame, gameEmbed, rewardsLine } from '../../services/games/session.js';
import { ROUND_GAMES, ROUND_LIMITS, runRoundGame } from '../../services/games/roundGames.js';
import { runRoulette, ROULETTE_LIMITS } from '../../services/games/roulette.js';
import { runChairs, CHAIRS_LIMITS } from '../../services/games/chairs.js';
import { runMafia, MAFIA_LIMITS } from '../../services/games/mafia.js';
import { CC } from '../../config/cc.js';

// Group games: the whole server can play and the top 3 win CC (more players = bigger rewards).
// Prefix words (روليت، كراسي، مافيا، اسئلة، خمن، اسرع، فكك، رتب، حساب، العاب، وقف) are in commandAliases.js.

const LOBBY_GAMES = {
    roulette: { run: runRoulette, name: 'روليت' },
    chairs: { run: runChairs, name: 'كراسي' },
    mafia: { run: runMafia, name: 'مافيا' },
};

function addRoundsOption(subcommand, max = ROUND_LIMITS.max) {
    return subcommand.addIntegerOption((option) => option
        .setName('rounds')
        .setDescription('Number of rounds')
        .setMinValue(1)
        .setMaxValue(max)
        .setRequired(false));
}

export function gamesListEmbed() {
    return gameEmbed(`🎮 ألعاب السيرفر — ${CC.emoji} ${CC.name}`, [
        `الطريقة الوحيدة تجمع **${CC.short}** غير \`يومي\` هي الألعاب!`,
        '',
        '**👥 ألعاب جماعية** (أعلى 3 بياخدوا CC، والجايزة بتكبر مع عدد اللاعبين)',
        `\`روليت\` — 🎡 العجلة بتختار لاعب يطلّع حد، آخر واحد يكسب (${ROULETTE_LIMITS.min}-${ROULETTE_LIMITS.max} لاعب)`,
        `\`كراسي\` — 🪑 الكراسي الموسيقية، اللي مايلاقيش كرسي يطلع (${CHAIRS_LIMITS.min}-${CHAIRS_LIMITS.max} لاعب)`,
        `\`مافيا\` — 🕵️ مافيا ودكتور ومحقق ومواطنين (${MAFIA_LIMITS.min}-${MAFIA_LIMITS.max} لاعب)`,
        '`اسئلة` — ❓ أسئلة عامة، أول إجابة صح تاخد الجولة',
        '`خمن` — 🔢 خمن الرقم من 1 لـ 100',
        '`اسرع` — ⚡ أول واحد يكتب الكلمة',
        '`فكك` — ✂️ فكك الكلمة لحروف',
        '`رتب` — 🔀 رتب الحروف وطلع الكلمة',
        '`حساب` — 🧮 حساب سريع',
        'تقدر تحدد عدد الجولات: `اسئلة 5`',
        '',
        `🌀 الجوايز: 3 لاعبين ← ${rewardsLine(3)}\n10 لاعبين ← ${rewardsLine(10)}\n30+ لاعب ← ${rewardsLine(30)}`,
        '',
        `**🙋 ألعاب فردية** (${CC.solo.win} ${CC.short} للفوز، بحد أقصى ${CC.solo.dailyCap} ${CC.short} في اليوم)`,
        '`سؤال` • `رقم` • `سلوت` • `حجر` • `اكس @عضو`',
        '',
        '**🌀 العملات**',
        '`يومي` — CC كل 24 ساعة • `رصيد` — رصيدك • `top cc` — الترتيب',
        '`وقف` — يوقف اللعبة الشغالة (صاحبها أو الإدارة)',
    ].join('\n'));
}

export default {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Start a group game the whole server can play (top 3 win CC)')
        .setDMPermission(false)
        .addSubcommand((sub) => sub.setName('roulette').setDescription('Roulette: the wheel picks who kicks someone out'))
        .addSubcommand((sub) => sub.setName('chairs').setDescription('Musical chairs'))
        .addSubcommand((sub) => sub.setName('mafia').setDescription('Mafia with doctor, detective and citizens'))
        .addSubcommand((sub) => addRoundsOption(sub.setName('trivia').setDescription('General knowledge questions')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('guess').setDescription('Guess the number from 1 to 100'), ROUND_GAMES.guess.maxRounds))
        .addSubcommand((sub) => addRoundsOption(sub.setName('fast').setDescription('First to type the word wins the round')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('fakkek').setDescription('Split the word into its letters')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('scramble').setDescription('Unscramble the letters')))
        .addSubcommand((sub) => addRoundsOption(sub.setName('math').setDescription('Quick math')))
        .addSubcommand((sub) => sub.setName('list').setDescription('All games, rewards and commands'))
        .addSubcommand((sub) => sub.setName('stop').setDescription('Stop the game running in this channel')),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            await InteractionHelper.safeReply(interaction, { embeds: [gamesListEmbed()] });
            return;
        }

        if (subcommand === 'stop') {
            const running = getActiveGame(interaction.channel.id);
            if (!running) {
                await InteractionHelper.safeReply(interaction, { content: 'مفيش لعبة شغالة في الروم ده.', flags: MessageFlags.Ephemeral });
                return;
            }
            const canStop = running.hostId === interaction.user.id
                || interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
            if (!canStop) {
                await InteractionHelper.safeReply(interaction, { content: 'صاحب اللعبة أو الإدارة بس اللي يقدروا يوقفوها.', flags: MessageFlags.Ephemeral });
                return;
            }
            running.stop();
            await InteractionHelper.safeReply(interaction, { content: `🛑 ${interaction.user} وقف اللعبة.`, allowedMentions: { parse: [] } });
            return;
        }

        if (!interaction.channel?.isTextBased?.()) return;

        const lobbyGame = LOBBY_GAMES[subcommand];
        if (lobbyGame) {
            await withChannelGame(interaction, lobbyGame.name, (session) => lobbyGame.run(interaction, client, session));
            return;
        }

        if (ROUND_GAMES[subcommand]) {
            const rounds = interaction.options.getInteger('rounds');
            await withChannelGame(interaction, ROUND_GAMES[subcommand].title, (session) => runRoundGame(interaction, client, session, subcommand, rounds));
        }
    },
};
