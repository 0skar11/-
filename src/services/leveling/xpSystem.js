// xpSystem.js

import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getXpForLevel, getUserLevelData, saveUserLevelData } from './leveling.js';
import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';
import { buildLevelUpMessage } from './levelUi.js';

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

    levelData.xp += xpToAdd;
    levelData.totalXp += xpToAdd;
    if (!fromVoice) levelData.lastMessage = Date.now();

    let xpNeededForNextLevel = getXpForLevel(levelData.level);
    let didLevelUp = false;
    const initialLevel = levelData.level;
    const rewardRoleIds = [];

    while (levelData.xp >= xpNeededForNextLevel && levelData.level < 1000) {
      levelData.xp -= xpNeededForNextLevel;
      levelData.level += 1;
      didLevelUp = true;
      xpNeededForNextLevel = getXpForLevel(levelData.level);

      logger.info(`🎉 ${member.user.tag} leveled up to level ${levelData.level} in ${guild.name}`);

      if (config.roleRewards && config.roleRewards[levelData.level]) {
        if (await awardRoleReward(guild, member, config.roleRewards[levelData.level], levelData.level)) {
          rewardRoleIds.push(config.roleRewards[levelData.level]);
        }
      }
    }

    if (didLevelUp) {
      if (config.announceLevelUp) {
        await sendLevelUpAnnouncement(guild, member, levelData, config, { fromLevel: initialLevel, rewardRoleIds });
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

    return {
      level: levelData.level,
      xp: levelData.xp,
      totalXp: levelData.totalXp,
      xpNeeded: getXpForLevel(levelData.level + 1),
      leveledUp: didLevelUp,
    };
  });
}, {
  service: 'xpSystem',
  operation: 'addXp',
  userMessage: 'Failed to award XP. Please try again.',
});

async function awardRoleReward(guild, member, roleId, level) {
  try {
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      logger.warn(`Role ${roleId} not found for level ${level} reward in guild ${guild.id}`);
      return false;
    }

    if (member.roles.cache.has(roleId)) {
      return false;
    }

    await member.roles.add(role, `Level ${level} reward`);
    logger.info(`✅ Awarded role ${role.name} to ${member.user.tag} for reaching level ${level}`);
    return true;
  } catch (error) {
    logger.error(`Failed to award role reward to ${member.user.id}:`, error);
    return false;
  }
}

// Level-up messages go to this channel only, never to the chat. If it's missing, nothing is posted.
const LEVEL_UP_CHANNEL_ID = '1552786804451573772';

// One message per level-up (even when several levels are gained at once). It only pings the member
// every 5 levels (see levelUi.js); the old free-text levelUpMessage is no longer used.
async function sendLevelUpAnnouncement(guild, member, levelData, config, { fromLevel, rewardRoleIds }) {
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

    const payload = buildLevelUpMessage(member, {
      fromLevel,
      level: levelData.level,
      xp: levelData.xp,
      xpNeeded: getXpForLevel(levelData.level),
      rewardRoleIds,
    });
    await levelUpChannel.send(payload).catch(error => {
      logger.error(`Failed to send level up message in channel ${levelUpChannel.id}:`, error);
    });
  } catch (error) {
    logger.error('Error sending level up announcement:', error);
  }
}
