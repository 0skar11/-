// session.js — what every group game shares: one game per channel, the join lobby and the results
// message that pays CC to the top 3.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { awardGroupGame, groupRewards } from '../cc/ccService.js';
import { CC, formatCC, ccEmbed } from '../../config/cc.js';
import { MEDALS } from './text.js';
import { logger } from '../../utils/logger.js';

const activeGames = new Map();

/** Reserves the channel for a game. Returns the session, or null when a game is already running there. */
export function claimChannel(channelId, game, hostId) {
    if (activeGames.has(channelId)) return null;
    const controller = new AbortController();
    const session = { channelId, game, hostId, signal: controller.signal, stop: () => controller.abort(), startedAt: Date.now() };
    activeGames.set(channelId, session);
    return session;
}

export function releaseChannel(session) {
    if (activeGames.get(session.channelId) === session) activeGames.delete(session.channelId);
}

export function getActiveGame(channelId) {
    return activeGames.get(channelId) || null;
}

/** Stops `collector` as soon as the game is stopped with `وقف`. */
export function stopOnAbort(collector, signal) {
    if (signal.aborted) {
        collector.stop('stopped');
        return;
    }
    const onAbort = () => collector.stop('stopped');
    signal.addEventListener('abort', onAbort, { once: true });
    collector.once('end', () => signal.removeEventListener('abort', onAbort));
}

/** Waits `ms`, or less when the game gets stopped. */
export function wait(ms, signal) {
    return new Promise((resolve) => {
        if (signal?.aborted) return resolve();
        const timer = setTimeout(done, ms);
        function done() {
            clearTimeout(timer);
            signal?.removeEventListener('abort', done);
            resolve();
        }
        signal?.addEventListener('abort', done, { once: true });
    });
}

export function gameEmbed(title, description, fields = []) {
    return ccEmbed(title, description, { fields });
}

export function rewardsLine(playerCount) {
    const rewards = groupRewards(playerCount);
    if (!rewards.length) return 'مفيش جوايز لو لاعب واحد بس.';
    return rewards.map((amount, index) => `${MEDALS[index]} ${amount} ${CC.short}`).join(' • ');
}

function lobbyRows(disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lobby_join').setLabel('دخول').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId('lobby_leave').setLabel('خروج').setEmoji('🚪').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('lobby_start').setLabel('ابدأ').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId('lobby_cancel').setLabel('إلغاء').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    )];
}

/**
 * Posts the join lobby as the command's reply and waits for players. The host joins automatically and
 * can start early once `minPlayers` joined. Resolves to the players (User objects in join order) or
 * null when the lobby was cancelled or not enough people joined.
 */
export async function runLobby(interaction, session, { title, description, minPlayers, maxPlayers, waitMs = 60_000 }) {
    const players = new Map([[interaction.user.id, interaction.user]]);
    const endsAt = Math.floor((Date.now() + waitMs) / 1000);
    const render = (note = '') => gameEmbed(title, [
        description,
        '',
        `👥 **اللاعبين (${players.size}/${maxPlayers}):**`,
        [...players.values()].map((user, index) => `${index + 1}. ${user}`).join('\n'),
        '',
        `⏳ اللعبة بتبدأ <t:${endsAt}:R> — أقل عدد ${minPlayers} لاعبين. صاحب اللعبة يقدر يدوس **ابدأ**.`,
        `🌀 الجوايز دلوقتي: ${rewardsLine(players.size)}`,
        note,
    ].filter((line) => line !== null).join('\n'));

    await InteractionHelper.safeReply(interaction, { embeds: [render()], components: lobbyRows(), allowedMentions: { parse: [] } });
    const message = await interaction.fetchReply();

    const result = await new Promise((resolve) => {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: waitMs });
        stopOnAbort(collector, session.signal);

        collector.on('collect', async (button) => {
            const isHost = button.user.id === session.hostId;
            const ephemeral = (content) => button.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
            switch (button.customId) {
                case 'lobby_join':
                    if (players.has(button.user.id)) return ephemeral('انت داخل اللعبة خلاص.');
                    if (players.size >= maxPlayers) return ephemeral('اللعبة كملت.');
                    players.set(button.user.id, button.user);
                    break;
                case 'lobby_leave':
                    if (!players.has(button.user.id)) return ephemeral('انت مش داخل اللعبة.');
                    if (isHost) return ephemeral('انت صاحب اللعبة، لو عايز تلغيها دوس **إلغاء**.');
                    players.delete(button.user.id);
                    break;
                case 'lobby_start':
                    if (!isHost) return ephemeral('صاحب اللعبة بس اللي يقدر يبدأها.');
                    if (players.size < minPlayers) return ephemeral(`لسه محتاجين ${minPlayers - players.size} لاعبين كمان.`);
                    await button.deferUpdate().catch(() => {});
                    collector.stop('start');
                    return;
                case 'lobby_cancel':
                    if (!isHost) return ephemeral('صاحب اللعبة بس اللي يقدر يلغيها.');
                    await button.deferUpdate().catch(() => {});
                    collector.stop('cancel');
                    return;
                default:
                    return;
            }
            await button.update({ embeds: [render()], components: lobbyRows(), allowedMentions: { parse: [] } }).catch(() => {});
            if (players.size >= maxPlayers) collector.stop('full');
        });

        collector.on('end', (_collected, reason) => resolve(reason));
    });

    const started = result !== 'cancel' && result !== 'stopped' && players.size >= minPlayers;
    const note = started
        ? '\n🎮 **اللعبة بدأت!**'
        : result === 'cancel' || result === 'stopped' ? '\n✖️ **اللعبة اتلغت.**' : `\n⌛ **اللعبة اتلغت:** محتاجين ${minPlayers} لاعبين على الأقل.`;
    await message.edit({ embeds: [render(note)], components: lobbyRows(true), allowedMentions: { parse: [] } }).catch(() => {});
    return started ? [...players.values()] : null;
}

/** Pays the top places of a finished group game and posts the results. */
export async function finishGroupGame(client, channel, { game, title, ranking, playerIds, summary = '' }) {
    let paid = [];
    try {
        paid = await awardGroupGame(client, channel.guild.id, { game, ranking, playerIds });
    } catch (error) {
        logger.error(`[GAMES] Failed to pay ${game}`, error);
    }

    const podium = paid.length
        ? paid.map((winner) => `${MEDALS[winner.place - 1]} <@${winner.userId}> — +${formatCC(winner.amount)}`).join('\n')
        : 'محدش كسب CC المرة دي.';
    await channel.send({
        embeds: [gameEmbed(`🏁 ${title} — النتيجة`, [
            summary,
            summary ? '' : null,
            podium,
            '',
            `👥 عدد اللاعبين: **${playerIds.length}**`,
        ].filter((line) => line !== null).join('\n'))],
        allowedMentions: { users: paid.map((winner) => winner.userId) },
    }).catch((error) => logger.warn(`[GAMES] Could not post ${game} results: ${error.message}`));
    return paid;
}

/** Runs `play(session)` with the channel reserved for `game`, and always frees the channel afterwards. */
export async function withChannelGame(interaction, game, play) {
    const session = claimChannel(interaction.channel.id, game, interaction.user.id);
    if (!session) {
        const running = getActiveGame(interaction.channel.id);
        await InteractionHelper.safeReply(interaction, {
            content: `⚠️ في لعبة **${running?.game || ''}** شغالة في الروم ده. استنوا تخلص أو اكتبوا \`وقف\`.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    try {
        await play(session);
    } catch (error) {
        logger.error(`[GAMES] ${game} crashed`, error);
        await interaction.channel.send('❌ حصلت مشكلة واللعبة وقفت.').catch(() => {});
    } finally {
        releaseChannel(session);
    }
}
