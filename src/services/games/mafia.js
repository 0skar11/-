// mafia.js — `مافيا`: players join and get a secret role (seen with the 🎭 button).
//   Night: the mafia pick someone to kill, the doctor picks someone to save, the detective checks
//          if someone is mafia — all through private (ephemeral) menus.
//   Day:   everyone alive votes someone out (a tie or "skip" means nobody).
// Town wins when every mafia member is out; the mafia win when they are as many as the town.
// The winning team gets the CC: alive winners first, then the dead ones.

import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, StringSelectMenuBuilder,
} from 'discord.js';
import { gameEmbed, runLobby, stopOnAbort, wait, finishGroupGame, sendGameMessage } from './session.js';
import { shuffle, pick } from './text.js';

const TITLE = '🕵️ مافيا';
const NIGHT_MS = 45_000;
const DAY_MS = 60_000;
const MAX_ROUNDS = 12;
export const MAFIA_LIMITS = { min: 5, max: 20 };

export const ROLES = {
    mafia: { name: 'مافيا', emoji: '🔪', team: 'mafia', info: 'كل ليلة انت وباقي المافيا بتختاروا حد تقتلوه. خليك مستخبي الصبح!' },
    doctor: { name: 'دكتور', emoji: '💉', team: 'town', info: 'كل ليلة بتختار حد تحميه من المافيا (ممكن نفسك).' },
    detective: { name: 'محقق', emoji: '🔎', team: 'town', info: 'كل ليلة بتختار حد وتعرف هو مافيا ولا لأ.' },
    citizen: { name: 'مواطن', emoji: '👤', team: 'town', info: 'ملكش قدرة بالليل، بس صوتك الصبح هو اللي بيطلع المافيا.' },
};

/** Role list for `count` players: 1 mafia per 4 players (at least 1), a doctor, and a detective from 6 players. */
export function assignRoles(playerIds, shuffleFn = shuffle) {
    const count = playerIds.length;
    const mafiaCount = Math.max(1, Math.floor(count / 4));
    const roles = [...Array(mafiaCount).fill('mafia'), 'doctor'];
    if (count >= 6) roles.push('detective');
    while (roles.length < count) roles.push('citizen');
    const order = shuffleFn(playerIds);
    return new Map(order.map((id, index) => [id, roles[index]]));
}

export function checkWinner(roles, aliveIds) {
    const mafia = aliveIds.filter((id) => roles.get(id) === 'mafia').length;
    const town = aliveIds.length - mafia;
    if (mafia === 0) return 'town';
    if (mafia >= town) return 'mafia';
    return null;
}

/** Most voted ID; null on a tie, no votes, or when "skip" wins. */
export function tallyVotes(votes, { allowTie = false, random = pick } = {}) {
    const counts = new Map();
    for (const target of votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
    if (!counts.size) return null;
    const top = Math.max(...counts.values());
    const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
    if (leaders.length > 1 && !allowTie) return null;
    const winner = leaders.length > 1 ? random(leaders) : leaders[0];
    return winner === 'skip' ? null : winner;
}

function mention(id) {
    return `<@${id}>`;
}

function describeRole(id, roles) {
    const role = ROLES[roles.get(id)];
    return `${role.emoji} ${role.name}`;
}

function phaseRow(extra = []) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mafia_role').setLabel('دوري').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
        ...extra,
    );
}

function targetMenu(customId, placeholder, ids, names, { skip = false } = {}) {
    const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder)
        .addOptions(ids.map((id) => ({ label: names.get(id).slice(0, 100), value: id })));
    if (skip) menu.addOptions({ label: 'محدش (تخطي)', value: 'skip', emoji: '⏭️' });
    return new ActionRowBuilder().addComponents(menu);
}

async function showRole(button, roles, alive) {
    const roleKey = roles.get(button.user.id);
    if (!roleKey) return button.reply({ content: 'انت مش في اللعبة دي.', flags: MessageFlags.Ephemeral }).catch(() => {});
    const role = ROLES[roleKey];
    const partners = roleKey === 'mafia'
        ? `\n🤝 المافيا معاك: ${[...roles.entries()].filter(([id, r]) => r === 'mafia' && id !== button.user.id).map(([id]) => mention(id)).join('، ') || 'لوحدك'}`
        : '';
    const status = alive.includes(button.user.id) ? '' : '\n💀 انت ميت، ماتكشفش حاجة!';
    return button.reply({ content: `دورك: **${role.emoji} ${role.name}**\n${role.info}${partners}${status}`, flags: MessageFlags.Ephemeral }).catch(() => {});
}

async function runNight(channel, session, state, night) {
    const { roles, names } = state;
    const alive = state.alive;
    const mafiaVotes = new Map();
    let saved = null;
    const acted = new Set();
    const actors = alive.filter((id) => roles.get(id) !== 'citizen');

    const message = await sendGameMessage(session, channel, {
        embeds: [gameEmbed(`${TITLE} — الليلة ${night} 🌙`, `السيرفر نام... 😴\nالمافيا والدكتور والمحقق: دوسوا **تصرف** واختاروا.\n⏱️ ${NIGHT_MS / 1000} ثانية`)],
        components: [phaseRow([new ButtonBuilder().setCustomId('mafia_act').setLabel('تصرف').setEmoji('🌙').setStyle(ButtonStyle.Primary)])],
    });

    await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: NIGHT_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (button) => {
            if (button.customId === 'mafia_role') return showRole(button, roles, alive);
            const ephemeral = (content) => button.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
            const userId = button.user.id;
            const roleKey = roles.get(userId);
            if (!roleKey) return ephemeral('انت مش في اللعبة دي.');
            if (!alive.includes(userId)) return ephemeral('💀 انت ميت.');
            if (roleKey === 'citizen') return ephemeral('انت مواطن، نام وارتاح 😴');
            if (acted.has(userId)) return ephemeral('انت اخترت خلاص الليلة دي.');

            const targets = roleKey === 'mafia' ? alive.filter((id) => roles.get(id) !== 'mafia')
                : roleKey === 'detective' ? alive.filter((id) => id !== userId) : alive;
            const customId = `mafia_pick_${session.startedAt}_${night}_${userId}`;
            const prompt = { mafia: '🔪 تقتلوا مين؟', doctor: '💉 تحمي مين؟', detective: '🔎 تحقق مع مين؟' }[roleKey];
            await button.reply({ content: prompt, components: [targetMenu(customId, prompt, targets, names)], flags: MessageFlags.Ephemeral }).catch(() => {});

            const selection = await channel.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: (interaction) => interaction.customId === customId && interaction.user.id === userId,
                time: Math.max(1000, NIGHT_MS - (Date.now() - message.createdTimestamp)),
            }).catch(() => null);
            if (!selection || session.signal.aborted || acted.has(userId)) return;
            const target = selection.values[0];
            acted.add(userId);
            let reply = `✅ اخترت ${names.get(target)}.`;
            if (roleKey === 'mafia') mafiaVotes.set(userId, target);
            if (roleKey === 'doctor') saved = target;
            if (roleKey === 'detective') reply = `🔎 ${names.get(target)} ${roles.get(target) === 'mafia' ? '**مافيا** 🔪' : '**مش مافيا** ✅'}`;
            await selection.update({ content: reply, components: [] }).catch(() => {});
            if (actors.every((id) => acted.has(id))) collector.stop('done');
        });
        collector.on('end', resolve);
    });
    await message.edit({ components: [] }).catch(() => {});
    if (session.signal.aborted) return null;

    const target = tallyVotes(mafiaVotes, { allowTie: true });
    if (!target) return { text: '🌅 الصبح طلع... المافيا ما اختاروش حد، ومحدش مات.' };
    if (target === saved) return { text: '🌅 الصبح طلع... المافيا حاولوا يقتلوا حد بس **الدكتور أنقذه!** 💉' };
    state.alive = alive.filter((id) => id !== target);
    state.dead.push(target);
    return { text: `🌅 الصبح طلع... لقينا ${mention(target)} **مقتول** 💀 (كان ${describeRole(target, roles)})` };
}

async function runDay(channel, session, state, day, morning) {
    const { roles, names } = state;
    const alive = state.alive;
    const votes = new Map();
    const message = await sendGameMessage(session, channel, {
        content: alive.map(mention).join(' '),
        embeds: [gameEmbed(`${TITLE} — اليوم ${day} ☀️`, `${morning}\n\n🗳️ ناقشوا وصوتوا مين المافيا! التعادل أو التخطي = محدش يطلع.\n⏱️ ${DAY_MS / 1000} ثانية\n\n👥 الأحياء (${alive.length}): ${alive.map(mention).join('، ')}`)],
        components: [targetMenu(`mafia_vote_${day}`, '🗳️ صوت على...', alive, names, { skip: true }), phaseRow()],
        allowedMentions: { users: alive },
    });

    await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ time: DAY_MS });
        stopOnAbort(collector, session.signal);
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'mafia_role') return showRole(interaction, roles, alive);
            if (!alive.includes(interaction.user.id)) {
                return interaction.reply({ content: 'الأحياء بس اللي يصوتوا.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            const choice = interaction.values?.[0];
            if (!choice) return interaction.deferUpdate().catch(() => {});
            const firstVote = !votes.has(interaction.user.id);
            votes.set(interaction.user.id, choice);
            await interaction.reply({ content: `🗳️ صوتك: ${choice === 'skip' ? 'تخطي' : names.get(choice)} (تقدر تغيره)`, flags: MessageFlags.Ephemeral }).catch(() => {});
            if (firstVote) await sendGameMessage(session, channel, { content: `🗳️ ${names.get(interaction.user.id)} صوّت (${votes.size}/${alive.length})`, allowedMentions: { parse: [] } }).catch(() => {});
            if (votes.size === alive.length) collector.stop('done');
        });
        collector.on('end', resolve);
    });
    await message.edit({ components: [] }).catch(() => {});
    if (session.signal.aborted) return;

    const outId = tallyVotes(votes);
    if (!outId) {
        await sendGameMessage(session, channel, '⚖️ مفيش اتفاق — محدش طلع النهارده.');
        return;
    }
    state.alive = alive.filter((id) => id !== outId);
    state.dead.push(outId);
    await sendGameMessage(session, channel, { content: `🪓 السيرفر طلّع ${mention(outId)} — كان ${describeRole(outId, roles)}`, allowedMentions: { parse: [] } });
}

export async function runMafia(interaction, client, session) {
    const players = await runLobby(interaction, session, {
        title: TITLE,
        description: 'ادخلوا المافيا! كل واحد هياخد دور سري: 🔪 مافيا، 💉 دكتور، 🔎 محقق أو 👤 مواطن.\nالمواطنين لازم يكتشفوا المافيا ويطلعوهم بالتصويت قبل ما المافيا تخلص عليهم.',
        minPlayers: MAFIA_LIMITS.min,
        maxPlayers: MAFIA_LIMITS.max,
        waitMs: 90_000,
    });
    if (!players) return;

    const channel = interaction.channel;
    const ids = players.map((user) => user.id);
    const state = {
        roles: assignRoles(ids),
        names: new Map(players.map((user) => [user.id, user.globalName || user.username])),
        alive: [...ids],
        dead: [],
    };
    const mafiaCount = [...state.roles.values()].filter((role) => role === 'mafia').length;

    const intro = await sendGameMessage(session, channel, {
        embeds: [gameEmbed(TITLE, `🎭 الأدوار اتوزعت! كل واحد يدوس **دوري** عشان يشوف دوره (محدش غيرك هيشوفه).\n\n🔪 عدد المافيا: **${mafiaCount}**\n👥 اللاعبين: ${ids.map(mention).join('، ')}\n\nالليل هيبدأ بعد 20 ثانية...`)],
        components: [phaseRow()],
        allowedMentions: { parse: [] },
    });
    const introCollector = intro.createMessageComponentCollector({ componentType: ComponentType.Button, time: 20_000 });
    stopOnAbort(introCollector, session.signal);
    introCollector.on('collect', (button) => showRole(button, state.roles, state.alive));
    await wait(20_000, session.signal);
    await intro.edit({ components: [] }).catch(() => {});

    let winner = null;
    for (let round = 1; round <= MAX_ROUNDS && !winner && !session.signal.aborted; round += 1) {
        const night = await runNight(channel, session, state, round);
        if (!night) break;
        winner = checkWinner(state.roles, state.alive);
        if (winner) {
            await sendGameMessage(session, channel, { content: night.text, allowedMentions: { parse: [] } });
            break;
        }
        await runDay(channel, session, state, round, night.text);
        winner = checkWinner(state.roles, state.alive);
        if (!winner) await wait(3000, session.signal);
    }

    // Stopped with `وقف`: withChannelGame deletes the game's messages.
    if (session.signal.aborted) return;

    const reveal = ids.map((id) => `${describeRole(id, state.roles)} — ${mention(id)}${state.alive.includes(id) ? '' : ' 💀'}`).join('\n');
    if (!winner) {
        await finishGroupGame(client, channel, { game: 'mafia', title: TITLE, ranking: [], playerIds: ids, summary: `⌛ اللعبة طولت ومحدش كسب.\n\n${reveal}` });
        return;
    }
    const team = (id) => ROLES[state.roles.get(id)].team;
    const ranking = [
        ...state.alive.filter((id) => team(id) === winner),
        ...[...state.dead].reverse().filter((id) => team(id) === winner),
    ];
    await finishGroupGame(client, channel, {
        game: 'mafia',
        title: TITLE,
        ranking,
        playerIds: ids,
        summary: `${winner === 'town' ? '🏆 **المواطنين كسبوا!** المافيا اتكشفت كلها.' : '🔪 **المافيا كسبت!** سيطروا على السيرفر.'}\n\n${reveal}`,
    });
}
