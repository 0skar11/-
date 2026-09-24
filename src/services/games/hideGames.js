// hideGames.js — two grid games where players hide in squares the bot posts, then get found one pick at a time.
//
// `غميضه` (hide & seek): every turn a random player still in the game picks a square. Someone hiding
//   there is out; an empty square is just revealed. Last one hidden wins.
// `صيد` (hunt): one random player is the hunter, everyone else is a sheep hiding among fake sheep. The
//   hunter wins by catching every real sheep before the fake ones run out; the sheep win when every
//   fake sheep has been shot while real sheep are still hidden.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { gameEmbed, runLobby, stopOnAbort, wait, finishGroupGame, sendGameMessage } from './session.js';
import { pick, shuffle } from './text.js';

const HIDE_MS = 30_000;
const TURN_MS = 20_000;
const MAX_SPOTS = 25; // 5 rows × 5 buttons
export const HIDE_LIMITS = { min: 3, max: 12 };
export const HUNT_LIMITS = { min: 3, max: 12 };

/** Squares for hide & seek: twice the players (at least 9), so there are as many empty squares as hiders. */
export function hideSpotCount(playerCount) {
    return Math.min(MAX_SPOTS, Math.max(9, playerCount * 2));
}

/** Squares for the hunt: one per sheep plus as many fake sheep as real ones (+1). */
export function huntSpotCount(sheepCount) {
    return Math.min(MAX_SPOTS, sheepCount * 2 + 1);
}

export function createSpots(count) {
    return Array.from({ length: count }, (_value, index) => ({ index, occupant: null, revealed: false, result: null }));
}

/** Puts every player who didn't pick a square in a random free one. */
export function placeLeftovers(spots, playerIds, random = shuffle) {
    const hidden = new Set(spots.map((spot) => spot.occupant).filter(Boolean));
    const free = random(spots.filter((spot) => !spot.occupant));
    for (const id of playerIds) {
        if (hidden.has(id)) continue;
        const spot = free.shift();
        if (spot) spot.occupant = id;
    }
}

/** Opens square `index`: returns the player found there, or null for an empty / fake square. */
export function openSpot(spots, index) {
    const spot = spots[index];
    spot.revealed = true;
    spot.result = spot.occupant ? 'found' : 'empty';
    return spot.occupant;
}

/** Hunt result: 'hunter' when every sheep is caught, 'sheep' when the fake sheep ran out, otherwise null. */
export function huntOutcome({ sheepLeft, misses, fakeCount }) {
    if (sheepLeft === 0) return 'hunter';
    if (misses >= fakeCount) return 'sheep';
    return null;
}

const STYLE = {
    hide: { idle: '⬛', found: '💥', empty: '🕳️' },
    hunt: { idle: '🐑', found: '🎯', empty: '☁️' },
};

function gridRows(spots, mode, disabled = false) {
    const look = STYLE[mode];
    const rows = [];
    for (let i = 0; i < spots.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(spots.slice(i, i + 5).map((spot) => new ButtonBuilder()
            .setCustomId(`${mode}_spot_${spot.index}`)
            .setLabel(String(spot.index + 1))
            .setEmoji(spot.revealed ? look[spot.result] : look.idle)
            .setStyle(spot.result === 'found' ? ButtonStyle.Danger : spot.revealed ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(disabled || spot.revealed))));
    }
    return rows;
}

/** Hiding phase: players (not `excludedId`) click a square to hide there; they can move until time runs out. */
async function hidingPhase(channel, session, { mode, title, spots, hiders, excludedId, intro }) {
    const hiderIds = new Set(hiders.map((user) => user.id));
    const endsAt = Math.floor((Date.now() + HIDE_MS) / 1000);
    const hiddenCount = () => spots.filter((spot) => spot.occupant).length;
    const render = () => gameEmbed(title, `${intro}\n\n🙈 دوس على أي مربع عشان تستخبى فيه (محدش هيشوف انت اخترت إيه). تقدر تغير مكانك لحد ما الوقت يخلص.\n⏳ الاستخباية بتخلص <t:${endsAt}:R> — اللي ما يستخباش البوت بيخبيه في مكان عشوائي.\n\n✅ استخبوا: **${hiddenCount()}/${hiders.length}**`);

    const message = await sendGameMessage(session, channel, { embeds: [render()], components: gridRows(spots, mode) });
    await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: HIDE_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (button) => {
            const ephemeral = (content) => button.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
            if (button.user.id === excludedId) return ephemeral('🏹 انت الصياد، استنى لما الخرفان تستخبى.');
            if (!hiderIds.has(button.user.id)) return ephemeral('انت مش داخل اللعبة دي.');
            const spot = spots[Number(button.customId.split('_').pop())];
            if (spot.occupant && spot.occupant !== button.user.id) return ephemeral('المكان ده محجوز، اختار مربع تاني.');
            for (const other of spots) if (other.occupant === button.user.id) other.occupant = null;
            spot.occupant = button.user.id;
            await ephemeral(`🙈 استخبيت في المربع رقم **${spot.index + 1}**.`);
            await message.edit({ embeds: [render()] }).catch(() => {});
            if (hiddenCount() === hiders.length) collector.stop('all');
        });
        collector.on('end', resolve);
    });
    placeLeftovers(spots, hiders.map((user) => user.id));
    return message;
}

/** Waits for `picker` to open a square on `message`. Resolves to the square index, or null on AFK / stop. */
function waitForPick(message, session, picker, spots, { ownSpotBlocked }) {
    return new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: TURN_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (button) => {
            const ephemeral = (content) => button.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
            if (button.user.id !== picker.id) return ephemeral('مش دورك.');
            const index = Number(button.customId.split('_').pop());
            if (spots[index].revealed) return ephemeral('المربع ده اتفتح قبل كده.');
            if (ownSpotBlocked && spots[index].occupant === picker.id) return ephemeral('ده مكانك انت 😅 اختار مربع تاني.');
            await button.deferUpdate().catch(() => {});
            collector.stop('picked');
            resolve(index);
        });
        collector.on('end', (_collected, reason) => {
            if (reason !== 'picked') resolve(null);
        });
    });
}

const mentionList = (users) => users.map((user) => `${user}`).join('، ') || '—';

export async function runHideAndSeek(interaction, client, session) {
    const title = '🙈 غميضه';
    const players = await runLobby(interaction, session, {
        title,
        description: 'كل واحد بيستخبى في مربع من المربعات. كل دور البوت بيختار لاعب عشوائي يفتح مربع: لو لقى حد جواه بيطلع من اللعبة، ولو فاضي اللعبة بتكمل. آخر واحد مستخبي هو الفايز.',
        minPlayers: HIDE_LIMITS.min,
        maxPlayers: HIDE_LIMITS.max,
    });
    if (!players) return;

    const channel = interaction.channel;
    const spots = createSpots(hideSpotCount(players.length));
    const message = await hidingPhase(channel, session, { mode: 'hide', title, spots, hiders: players, intro: `👥 ${players.length} لاعبين و **${spots.length}** مربع.` });
    if (session.signal.aborted) return;

    let alive = [...players];
    const out = [];
    let log = '🔎 الكل استخبى، يلا ندوّر!';
    while (alive.length > 1 && !session.signal.aborted) {
        const seeker = pick(alive);
        await message.edit({
            content: `${seeker}`,
            embeds: [gameEmbed(title, `${log}\n\n🔦 الدور على ${seeker}: افتح مربع (مش مربعك).\n⏱️ عندك ${TURN_MS / 1000} ثانية، ولو ما اخترتش هتطلع AFK.\n\n👥 الباقيين (${alive.length}): ${mentionList(alive)}`)],
            components: gridRows(spots, 'hide'),
            allowedMentions: { users: [seeker.id] },
        }).catch(() => {});

        const index = await waitForPick(message, session, seeker, spots, { ownSpotBlocked: true });
        if (session.signal.aborted) break;
        if (index === null) {
            // AFK: the seeker is out and their square is left empty.
            for (const spot of spots) if (spot.occupant === seeker.id) spot.occupant = null;
            alive = alive.filter((user) => user.id !== seeker.id);
            out.push(seeker);
            log = `🚫 ${seeker} طلع بسبب AFK.`;
        } else {
            const foundId = openSpot(spots, index);
            const found = alive.find((user) => user.id === foundId);
            if (found) {
                alive = alive.filter((user) => user.id !== found.id);
                out.push(found);
                log = `💥 ${seeker} فتح المربع **${index + 1}** ولقى ${found}! ${found} طلع من اللعبة.`;
            } else {
                log = `🕳️ ${seeker} فتح المربع **${index + 1}**… المكان فاضي! اللعبة مكملة.`;
            }
        }
        if (alive.length > 1) await wait(1500, session.signal);
    }
    if (session.signal.aborted) return;

    await message.edit({
        content: null,
        embeds: [gameEmbed(title, `${log}\n\n👑 ${alive[0]} آخر واحد فضل مستخبي!`)],
        components: gridRows(spots, 'hide', true),
        allowedMentions: { parse: [] },
    }).catch(() => {});
    await finishGroupGame(client, channel, {
        game: 'hide',
        title,
        ranking: [alive[0].id, ...out.reverse().map((user) => user.id)],
        playerIds: players.map((user) => user.id),
        summary: `👑 ${alive[0]} كسب الغميضه!`,
    });
}

export async function runHunt(interaction, client, session) {
    const title = '🏹 صيد';
    const players = await runLobby(interaction, session, {
        title,
        description: 'واحد عشوائي بيبقى الصياد 🏹 والباقي خرفان 🐑 بيستخبوا وسط خرفان وهمية. الصياد كل دور بيختار خروف: لو حقيقي اتصاد، ولو وهمي راحت عليه. الصياد يكسب لو صاد كل الخرفان قبل الوهمية ما تخلص، والخرفان تكسب لو الوهمية خلصت وهما لسه مستخبيين.',
        minPlayers: HUNT_LIMITS.min,
        maxPlayers: HUNT_LIMITS.max,
    });
    if (!players) return;

    const channel = interaction.channel;
    const hunter = pick(players);
    const sheep = players.filter((user) => user.id !== hunter.id);
    const spots = createSpots(huntSpotCount(sheep.length));
    const fakeCount = spots.length - sheep.length;
    const intro = `🏹 الصياد هو ${hunter}!\n🐑 ${sheep.length} خرفان حقيقية مستخبية وسط **${fakeCount}** خروف وهمي.`;
    const message = await hidingPhase(channel, session, { mode: 'hunt', title, spots, hiders: sheep, excludedId: hunter.id, intro });
    if (session.signal.aborted) return;

    let alive = [...sheep];
    const caught = [];
    let misses = 0;
    let log = '🐑 الخرفان استخبت، يلا يا صياد!';
    let outcome = null;
    while (!outcome && !session.signal.aborted) {
        await message.edit({
            content: `${hunter}`,
            embeds: [gameEmbed(title, `${log}\n\n🏹 ${hunter} اختار خروف تصطاده.\n⏱️ عندك ${TURN_MS / 1000} ثانية، ولو ما اخترتش الطلقة بتروح عليك.\n\n🐑 خرفان حقيقية فاضلة: **${alive.length}** • ☁️ وهمية فاضلة: **${fakeCount - misses}**`)],
            components: gridRows(spots, 'hunt'),
            allowedMentions: { users: [hunter.id] },
        }).catch(() => {});

        const index = await waitForPick(message, session, hunter, spots, { ownSpotBlocked: false });
        if (session.signal.aborted) break;
        if (index === null) {
            misses += 1;
            log = `⏱️ ${hunter} ما صادش في الوقت، الطلقة راحت عليه.`;
        } else {
            const foundId = openSpot(spots, index);
            const found = alive.find((user) => user.id === foundId);
            if (found) {
                alive = alive.filter((user) => user.id !== found.id);
                caught.push(found);
                log = `🎯 ${hunter} صاد ${found} من المربع **${index + 1}**!`;
            } else {
                misses += 1;
                log = `☁️ المربع **${index + 1}** طلع خروف وهمي!`;
            }
        }
        outcome = huntOutcome({ sheepLeft: alive.length, misses, fakeCount });
        if (!outcome) await wait(1500, session.signal);
    }
    if (session.signal.aborted) return;

    const hunterWon = outcome === 'hunter';
    const summary = hunterWon
        ? `🏹 ${hunter} صاد كل الخرفان وكسب!`
        : `🐑 الخرفان الوهمية خلصت والخرفان كسبت! الناجيين: ${mentionList(alive)}`;
    await message.edit({ content: null, embeds: [gameEmbed(title, `${log}\n\n${summary}`)], components: gridRows(spots, 'hunt', true), allowedMentions: { parse: [] } }).catch(() => {});

    const caughtLastFirst = [...caught].reverse().map((user) => user.id);
    const ranking = hunterWon
        ? [hunter.id, ...caughtLastFirst]
        : [...alive.map((user) => user.id), ...caughtLastFirst, hunter.id];
    await finishGroupGame(client, channel, {
        game: 'hunt',
        title,
        ranking,
        playerIds: players.map((user) => user.id),
        summary,
    });
}
