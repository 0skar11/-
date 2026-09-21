import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleArabicModerationShortcut } from '../utils/arabicModerationShortcuts.js';
import { handleArabicUtilityShortcuts } from '../utils/arabicUtilityShortcuts.js';
import { handleMessageDeleteShortcut } from '../utils/messageDeleteShortcut.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand, parseMessageCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { getCountingGameConfig, saveCountingGameConfig, isValidCountingMessage, recordCorrectCount } from '../services/countingGameService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;
      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      if (await handleArabicUtilityShortcuts(message)) return;
      if (await handleMessageDeleteShortcut(message)) return;
      if (await handleArabicModerationShortcut(message)) return;
      if (await handleCountingGame(message, client)) return;
      await handlePrefixCommand(message, client);
      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix) ?? parseMessageCommand(message.content, prefix);
    if (!parsed) return;

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    if (new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']).has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    const resolvedCommandName = resolveCommandAlias(commandName);
    const command = client.commands.get(resolvedCommandName);
    if (!command) return;

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({ embeds: [createEmbed({ title: 'Maintenance Mode', description: getBotMessage('maintenanceMode'), color: 'warning' })] }).catch(() => {});
      return;
    }
    if (!isCommandCategoryEnabled(command.category)) return;

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) return;
    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) return;

    const abuseProtection = await enforceAbuseProtection({ guildId: message.guild.id, user: message.author }, command, resolvedCommandName);
    if (!abuseProtection.allowed) {
      await message.channel.send({ embeds: [createEmbed({ title: 'Command Cooldown', description: `Please wait ${formatCooldownDuration(abuseProtection.remainingMs)}.`, color: 'error' })] }).catch(() => {});
      return;
    }
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) return false;
    const validCount = isValidCountingMessage(message.content.trim(), config);
    if (!validCount || message.author.id === config.lastUserId) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, { ...config, nextNumber: 1, lastUserId: null, currentStreak: 0 });
      await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      return true;
    }
    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleLeveling(message, client) {
  try {
    const canProcess = await checkRateLimit(`xp-event:${message.guild.id}:${message.author.id}`, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) return;
    const config = await getLevelingConfig(client, message.guild.id);
    if (!config?.enabled || config.ignoredChannels?.includes(message.channel.id) || config.blacklistedUsers?.includes(message.author.id)) return;
    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    if (Date.now() - (userData.lastMessage || 0) < (config.xpCooldown || 60) * 1000) return;
    const min = Math.max(1, config.xpRange?.min || config.xpPerMessage?.min || 15);
    const max = Math.max(min, config.xpRange?.max || config.xpPerMessage?.max || 25);
    const xp = Math.floor(Math.random() * (max - min + 1)) + min;
    const result = await addXp(client, message.guild, message.member, config.xpMultiplier > 1 ? Math.floor(xp * config.xpMultiplier) : xp);
    if (result?.leveledUp) logger.info(`${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`);
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}
