import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleArabicUtilityShortcuts } from '../utils/arabicUtilityShortcuts.js';
import { handleMessageDeleteShortcut } from '../utils/messageDeleteShortcut.js';
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
import { handleTrustedListCommand } from '../utils/trustedCommand.js';
import { handleArabicRoleShortcut } from '../utils/arabicModerationShortcuts.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;
      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      if (await handleArabicUtilityShortcuts(message)) return;
      if (await handleMessageDeleteShortcut(message)) return;
      if (await handleCountingGame(message, client)) return;
      await handlePrefixCommand(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

// Arabic moderation commands also work without the prefix (e.g. `بان @member`).
// To avoid reacting to normal chat, the first argument must look like a real target.
const TARGET_ARG = /^(?:<@!?\d+>|\d{17,20})$/u;
const NO_PREFIX_ARABIC_COMMANDS = new Map([
  ['بان', TARGET_ARG], ['انبان', TARGET_ARG], ['تايم', TARGET_ARG], ['انتايم', TARGET_ARG],
  ['وارن', TARGET_ARG], ['وارنات', TARGET_ARG], ['كلير', /^[0-9٠-٩]+$/u],
]);

function parseNoPrefixArabicCommand(content, prefix) {
  const parsed = parseMessageCommand(content, prefix);
  const argPattern = parsed && NO_PREFIX_ARABIC_COMMANDS.get(parsed.commandName);
  if (!argPattern || !argPattern.test(parsed.args[0] || '')) return null;
  const toWesternDigits = (value) => value.replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  return { commandName: parsed.commandName, args: parsed.args.map(toWesternDigits) };
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    if (await handleArabicRoleShortcut(message, [prefix, getCommandPrefix()])) return;
    const parsed = parsePrefixCommand(message.content, prefix) || parseNoPrefixArabicCommand(message.content, prefix);
    if (!parsed) return;

    let { commandName, args } = parsed;
    if (commandName.toLowerCase() === 'trusted') {
      if (args.length) {
        await message.channel.send(`❌ صيغة الأمر الصحيحة: \`${prefix}trusted\``).catch(() => {});
      } else {
        await handleTrustedListCommand(message, client);
      }
      return;
    }

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
    if (restriction.blocked || !supportsPrefixExecution(command)) return;
    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) return;

    const abuseProtection = await enforceAbuseProtection({ guildId: message.guild.id, user: message.author }, command, resolvedCommandName);
    if (!abuseProtection.allowed) {
      await message.channel.send({ embeds: [createEmbed({ title: 'Command Cooldown', description: `Please wait ${formatCooldownDuration(abuseProtection.remainingMs)}.`, color: 'error' })] }).catch(() => {});
      return;
    }
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
    await message.channel.send(`❌ تعذر تنفيذ الأمر: ${error.userMessage || error.message || 'خطأ غير معروف'}`).catch(() => {});
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
