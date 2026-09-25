// xpSystem.js

import { logger } from '../../utils/logger.js';
import { applyLevelUps, getLevelingConfig, getSplitXpForLevel, getUserLevelData, saveUserLevelData } from './leveling.js';
import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';
import { buildLevelUpMessage } from './levelUi.js';
import { getChatCounts } from './chatCounter.js';
import { getVoiceMinutes } from './voiceXp.js';
import { syncMemberLevelRoles } from './levelRoleSyncService.js';

/**
 * Award XP to a member. Returns null when XP is skipped (disabled/invalid amount).
 * Throws on storage or unexpected failures. Voice XP passes `fromVoice` so it doesn't start the
 * chat XP cooldown (`lastMessage`).
 */
export const addXp = wrapServiceBoundary(async function addXp(client, guild, member, xpToAdd, { fromVoice = false } = {}) {
  const lockKey = `leveling:${guild.id}:${member.user.id}`;
  return await Mutex.runExclusive(lockKey, async () => {
    if (!xpToAdd || xpToAdd <= 0) {
      return null;
    }

    const config = await getLevelingConfig(client, guild.id);

    if (!config.enabled) {
      return null;
    }

    const levelData = await getUserLevelData(client, guild.id, member.user.id);

    // Chat and voice XP fill their own bars; a level needs both (see getSplitXpForLevel).
    if (fromVoice) levelData.voiceXp += xpToAdd;
    else levelData.chatXp += xpToAdd;
    levelData.totalXp += xpToAdd;
    if (!fromVoice) levelData.lastMessage = Date.now();

    const initialLevel = levelData.level;
    applyLevelUps(levelData);
    const didLevelUp = levelData.level > initialLevel;
    const rewardRoleIds = [];
    if (didLevelUp) {
      logger.info(`🎉 ${member.user.tag} leveled up to level ${levelData.level} in ${guild.name}`);
    }

    // Every level role the member has reached (and media from level 5) is given right away, including any they missed before.
    if (didLevelUp) {
      const { added } = await syncMemberLevelRoles(guild, member, levelData.level, config.roleRewards, { reason: 'Level reward' });
      rewardRoleIds.push(...added);
    }

    if (didLevelUp) {
      if (config.announceLevelUp) {
        await sendLevelUpAnnouncement(guild, member, levelData, config, { fromLevel: initialLevel, rewardRoleIds, source: fromVoice ? 'voice' : 'chat' });
      }

      try {
        await logEvent({
          client,
          guildId: guild.id,
          eventType: EVENT_TYPES.LEVELING_LEVELUP,
          data: {
            title: 'Level Up',
            lines: [
              formatLogLine('Member', `${member.user.tag} (\`${member.user.id}\`)`),
              formatLogLine('New Level', levelData.level.toString()),
              formatLogLine('Levels Gained', (levelData.level - initialLevel).toString()),
              formatLogLine('Total XP', levelData.totalXp.toString()),
            ],
            userId: member.user.id,
          },
        });
      } catch (logError) {
        logger.debug('Failed to log leveling event:', logError.message);
      }
    }

    await saveUserLevelData(client, guild.id, member.user.id, levelData);

    const needed = getSplitXpForLevel(levelData.level);
    return {
      level: levelData.level,
      xp: levelData.xp,
      chatXp: levelData.chatXp,
      voiceXp: levelData.voiceXp,
      totalXp: levelData.totalXp,
      chatXpNeeded: needed.chat,
      voiceXpNeeded: needed.voice,
      leveledUp: didLevelUp,
    };
  });
}, {
  service: 'xpSystem',
  operation: 'addXp',
  userMessage: 'Failed to award XP. Please try again.',
});

// Level-up messages go to this channel only, never to the chat. If it's missing, nothing is posted.
const LEVEL_UP_CHANNEL_ID = '1552786804451573772';

// One message per level-up (even when several levels are gained at once). It only pings the member
// every 5 levels (see levelUi.js); the old free-text levelUpMessage is no longer used.
async function sendLevelUpAnnouncement(guild, member, levelData, config, { fromLevel, rewardRoleIds, source }) {
  try {
    const levelUpChannel = guild.channels.cache.get(LEVEL_UP_CHANNEL_ID)
      || await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);

    if (!levelUpChannel || !levelUpChannel.isTextBased()) {
      logger.warn(`Level-up channel ${LEVEL_UP_CHANNEL_ID} was not found in ${guild.name}; level-up not announced.`);
      return;
    }

    const permissions = levelUpChannel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions to send levelup message in ${levelUpChannel.id}`);
      return;
    }

    // The member's chat and voice totals, so the message shows both sides (best effort).
    const client = guild.client;
    const [messages, voiceMinutes] = await Promise.all([
      getChatCounts(client, guild.id).then((counts) => counts[member.id] || 0).catch(() => null),
      getVoiceMinutes(client, guild.id).then((minutes) => minutes[member.id] || 0).catch(() => null),
    ]);
    const needed = getSplitXpForLevel(levelData.level);
    const payload = buildLevelUpMessage(member, {
      fromLevel,
      level: levelData.level,
      chatXp: levelData.chatXp,
      voiceXp: levelData.voiceXp,
      chatXpNeeded: needed.chat,
      voiceXpNeeded: needed.voice,
      rewardRoleIds,
      source,
      messages,
      voiceMinutes,
    });
    await levelUpChannel.send(payload).catch(error => {
      logger.error(`Failed to send level up message in channel ${levelUpChannel.id}:`, error);
    });
  } catch (error) {
    logger.error('Error sending level up announcement:', error);
  }
}
