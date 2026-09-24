// chairs.js — `كراسي` (musical chairs): the music plays, then stops at a random moment and there is
// one chair less than players. Whoever doesn't get a chair is out. Last one sitting wins.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { gameEmbed, runLobby, stopOnAbort, wait, finishGroupGame, sendGameMessage } from './session.js';
import { randomInt, shuffle } from './text.js';

const TITLE = '🪑 الكراسي الموسيقية';
const SIT_MS = 10_000;
export const CHAIRS_LIMITS = { min: 3, max: 25 };

function chairRows(chairs, seats, disabled = false) {
    const buttons = Array.from({ length: chairs }, (_, index) => {
        const taken = seats.get(index);
        return new ButtonBuilder()
            .setCustomId(`chair_${index}`)
            .setEmoji('🪑')
            .setLabel(taken ? (taken.globalName || taken.username).slice(0, 80) : `${index + 1}`)
            .setStyle(taken ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || Boolean(taken));
    });
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return rows;
}

/** Final order from the rounds: survivors first, then each round's losers, the latest round first. */
export function rankChairs(survivors, roundsOut) {
    return [...survivors, ...[...roundsOut].reverse().flatMap((round) => shuffle(round))];
}

export async function runChairs(interaction, client, session) {
    const players = await runLobby(interaction, session, {
        title: TITLE,
        description: 'ادخلوا اللعبة! لما الموسيقى تقف دوسوا بسرعة على كرسي فاضي 🪑. الكراسي دايمًا أقل من اللاعبين بواحد، واللي مايلاقيش كرسي بيطلع.',
        minPlayers: CHAIRS_LIMITS.min,
        maxPlayers: CHAIRS_LIMITS.max,
    });
    if (!players) return;

    const channel = interaction.channel;
    let alive = [...players];
    const roundsOut = [];
    let round = 0;

    while (alive.length > 1 && !session.signal.aborted) {
        round += 1;
        const chairs = alive.length - 1;
        const message = await sendGameMessage(session, channel, { embeds: [gameEmbed(`${TITLE} — الجولة ${round}`, `🎶 الموسيقى شغالة... لفوا حوالين ${chairs} ${chairs === 1 ? 'كرسي' : 'كراسي'}!\n\n👥 ${alive.map((user) => `${user}`).join('، ')}`)] });
        await wait(randomInt(3000, 9000), session.signal);
        if (session.signal.aborted) break;

        const seats = new Map();
        const seated = new Set();
        await message.edit({
            embeds: [gameEmbed(`${TITLE} — الجولة ${round}`, `🛑 **الموسيقى وقفت! اقعدوا بسرعة!**\n⏱️ ${SIT_MS / 1000} ثواني`)],
            components: chairRows(chairs, seats),
        });

        await new Promise((resolve) => {
            const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: SIT_MS });
            stopOnAbort(collector, session.signal);
            collector.on('collect', async (button) => {
                const ephemeral = (content) => button.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
                const player = alive.find((user) => user.id === button.user.id);
                if (!player) return ephemeral('انت مش في اللعبة دي.');
                if (seated.has(player.id)) return ephemeral('انت قاعد خلاص 😄');
                const index = Number(button.customId.split('_')[1]);
                if (!Number.isInteger(index) || index < 0 || index >= chairs) return button.deferUpdate().catch(() => {});
                if (seats.has(index) || seats.size >= chairs) return ephemeral('الكرسي ده اتاخد! شوف غيره بسرعة.');
                seats.set(index, player);
                seated.add(player.id);
                if (seats.size >= chairs) collector.stop('full');
                await button.update({ components: chairRows(chairs, seats) }).catch(() => {});
            });
            collector.on('end', resolve);
        });
        if (session.signal.aborted) break;

        const out = alive.filter((user) => !seated.has(user.id));
        alive = alive.filter((user) => seated.has(user.id));
        roundsOut.push(out.map((user) => user.id));
        await message.edit({
            embeds: [gameEmbed(`${TITLE} — الجولة ${round}`, `❌ طلعوا: ${out.map((user) => `${user}`).join('، ') || 'محدش'}\n✅ فضلوا: ${alive.length}`)],
            components: chairRows(chairs, seats, true),
        }).catch(() => {});
        if (alive.length > 1) await wait(2500, session.signal);
    }

    // Stopped with `وقف`: withChannelGame deletes the game's messages.
    if (session.signal.aborted) return;

    const ranking = rankChairs(alive.map((user) => user.id), roundsOut);
    await finishGroupGame(client, channel, {
        game: 'chairs',
        title: TITLE,
        ranking,
        playerIds: players.map((user) => user.id),
        summary: alive.length ? `👑 ${alive[0]} قعد على آخر كرسي!` : 'محدش لحق يقعد في آخر جولة!',
    });
}
