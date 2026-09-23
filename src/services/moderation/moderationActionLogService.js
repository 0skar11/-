// moderationActionLogService.js — every ban / timeout / warn issued by a staff member is posted in one
// channel: the member, the moderator and the reason.

import { logger } from '../../utils/logger.js';
import { cardReason, formatDurationMs } from '../../utils/moderationCard.js';
import { NO_PINGS } from '../../utils/oneLine.js';

export const MODERATION_ACTION_LOG_CHANNEL_ID = '1552347336976498898';

const ACTIONS = {
  ban: { title: '🔨 بان', color: 0xe74c3c },
  hardban: { title: '🔨 هارد بان', color: 0x992d22 },
  timeout: { title: '⏳ تايم أوت', color: 0xe67e22 },
  warn: { title: '⚠️ وارن', color: 0xf1c40f },
};

const MAX_DESCRIPTION_LENGTH = 4000;

function userLine(user, fallbackId) {
  const id = user?.id || fallbackId;
  return user?.tag ? `<@${id}> (${user.tag} - ${id})` : `<@${id}> (${id})`;
}

/**
 * Embed for one moderation action. `action` is one of `ban`, `hardban`, `timeout`, `warn`;
 * `targetUser`/`moderatorUser` are discord.js Users (ids are used when a user could not be fetched).
 */
export function buildModerationActionLogEmbed({
  action, targetUser, targetId, moderatorUser, moderatorId, reason, durationMs, warnings, punishment,
  channel, timestamp = Date.now(),
}) {
  const { title, color } = ACTIONS[action] || { title: action, color: 0x95a5a6 };
  const lines = [
    `**العضو:** ${userLine(targetUser, targetId)}`,
    `**الإداري:** ${userLine(moderatorUser, moderatorId)}`,
    `**السبب:** ${cardReason(reason)}`,
  ];
  if (durationMs) lines.push(`**المدة:** ${formatDurationMs(durationMs)}`);
  if (warnings) lines.push(`**عدد التحذيرات:** ${warnings}`);
  if (punishment) lines.push(`**العقوبة:** ${punishment}`);
  if (channel) lines.push(`**الروم:** ${channel}`);
  lines.push(`**الوقت:** <t:${Math.floor(timestamp / 1000)}:F>`);

  const avatar = targetUser?.displayAvatarURL?.();
  return {
    color,
    title,
    description: lines.join('\n').slice(0, MAX_DESCRIPTION_LENGTH),
    ...(avatar ? { thumbnail: { url: avatar } } : {}),
    timestamp: new Date(timestamp).toISOString(),
  };
}

/** Posts the action in the moderation log channel. Never throws: a missing channel only logs a warning. */
export async function sendModerationActionLog(guild, details) {
  try {
    const channel = guild.channels.cache.get(MODERATION_ACTION_LOG_CHANNEL_ID)
      || await guild.channels.fetch(MODERATION_ACTION_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) {
      logger.warn(`Moderation action log channel ${MODERATION_ACTION_LOG_CHANNEL_ID} was not found in guild ${guild.id}.`);
      return false;
    }
    await channel.send({ embeds: [buildModerationActionLogEmbed(details)], allowedMentions: NO_PINGS });
    return true;
  } catch (error) {
    logger.error('Failed to send moderation action log:', error);
    return false;
  }
}
