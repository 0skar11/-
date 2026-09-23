// Shared helpers for commands that must not reveal who used them (`قول`, `خاص`).
// The sender is only recorded in the audit log and the channel below.
import { replyUserError } from './errorHandler.js';
import { logger } from './logger.js';

export const ANONYMOUS_LOG_CHANNEL_ID = '1550596180940034079';
const PREFIX_ERROR_DELETE_MS = 5_000;

/** Prefix form: deletes the command message so nobody sees who sent it. Returns it (or null for slash). */
export async function deleteSourceMessage(interaction) {
    const sourceMessage = interaction._sourceMessage || null;
    if (sourceMessage?.deletable) {
        await sourceMessage.delete().catch(() => {});
    }
    return sourceMessage;
}

/** Like replyUserError, but a prefix error reply disappears after a few seconds. */
export async function replyAnonymousError(interaction, options) {
    const result = await replyUserError(interaction, options);
    if (interaction._isPrefixCommand) {
        const errorReply = interaction._responseCoordinator?.getReplyMessage();
        if (errorReply) {
            setTimeout(() => errorReply.delete().catch(() => {}), PREFIX_ERROR_DELETE_MS);
        }
    }
    return result;
}

/** Posts who used the command to the anonymous log channel. `lines` are extra description lines. */
export async function sendAnonymousLog(client, { guild, title, user, lines = [], content }) {
    try {
        const logChannel = guild.channels.cache.get(ANONYMOUS_LOG_CHANNEL_ID)
            || await client.channels.fetch(ANONYMOUS_LOG_CHANNEL_ID).catch(() => null);
        if (!logChannel?.isTextBased?.()) {
            logger.warn(`Anonymous command log channel ${ANONYMOUS_LOG_CHANNEL_ID} was not found.`);
            return;
        }

        await logChannel.send({
            embeds: [{
                title,
                description: [
                    `**By:** ${user} (${user.tag} - ${user.id})`,
                    ...lines,
                    `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
                ].join('\n'),
                fields: [{
                    name: 'Content',
                    value: content.length > 1024 ? `${content.slice(0, 1021)}...` : content,
                }],
                color: 0x5865F2,
                timestamp: new Date().toISOString(),
            }],
            allowedMentions: { parse: [] },
        });
    } catch (error) {
        logger.error(`Error sending anonymous command log (${title}):`, error);
    }
}
