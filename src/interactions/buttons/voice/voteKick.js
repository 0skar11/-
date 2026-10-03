import { MessageFlags } from 'discord.js';
import { VOTE_KICK_BUTTON_PREFIX, castVote, voteKickPayload, kickFromVoice, forgetVote } from '../../../services/voice/voteKickService.js';

// The vote button of a vote kick (`votekick:yes:<voteId>`, services/voice/voteKickService.js). Only
// members in the voice channel can vote, once each; the vote that reaches the count kicks the member.
const FAILURE_TEXT = {
    ended: '⏱️ التصويت ده خلص.',
    not_in_channel: '❌ لازم تكون في الروم الصوتي عشان تصوّت.',
    target: '❌ مينفعش تصوّت على نفسك.',
    already: '✅ إنت صوّت قبل كده.',
};

async function execute(interaction, client, [action, voteId]) {
    if (!interaction.inGuild() || action !== 'yes') return;
    const voter = interaction.member?.voice ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const result = castVote(voteId, voter);
    if (!result.ok) {
        return interaction.reply({ content: FAILURE_TEXT[result.reason], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    const { vote } = result;
    if (!result.passed) return interaction.update(voteKickPayload(vote)).catch(() => {});

    await interaction.deferUpdate().catch(() => {});
    const channel = interaction.guild.channels.cache.get(vote.channelId);
    const kicked = channel
        ? await kickFromVoice(client, interaction.guild, channel, vote.targetId, { reason: `فوت كيك (${vote.yes.size} صوت)${vote.reason ? `: ${vote.reason}` : ''}` })
        : { disconnected: false, denied: false };
    forgetVote(vote.id);
    const ended = kicked.disconnected || kicked.denied
        ? `<@${vote.targetId}> اتطرد ومش هيقدر يرجع الروم ده لحد ما الروم يفضى.`
        : `الأصوات كملت بس مقدرتش أطرد <@${vote.targetId}> (ناقصني صلاحية).`;
    await interaction.editReply(voteKickPayload(vote, { ended })).catch(() => {});
}

export default { name: VOTE_KICK_BUTTON_PREFIX, execute };
