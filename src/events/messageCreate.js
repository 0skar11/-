import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleArabicUtilityShortcuts } from '../utils/arabicUtilityShortcuts.js';
import { handleMessageDeleteShortcut } from '../utils/messageDeleteShortcut.js';
import { parsePrefixCommand, parseMessageCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { getCountingGameConfig, saveCountingGameConfig, isValidCountingMessage, recordCorrectCount } from '../services/countingGameService.js';

const OWNER_ID = '1159601661392715906';
const TRUST_COMMANDS = new Set(['تراست', 'انتراست', 'trust', 'untrust']);

function parseTrustCommand(content) {
  const parts = String(content || '').trim().split(/\s+/u).filter(Boolean);
  if (parts.length < 2) return null;
  const command = parts[0].toLowerCase();
  if (!TRUST_COMMANDS.has(command)) return null;

  const targetText = parts.slice(1).join(' ');
  const roleMatch = targetText.match(/<@&(\d+)>/u);
  const userMatch = targetText.match(/<@!?(\d+)>/u) || targetText.match(/\b(\d{17,20})\b/u);
  if (roleMatch) return { command, type: 'role', id: roleMatch[1] };
  if (userMatch) return { command, type: 'user', id: userMatch[1] };
  return null;
}

async function handleTrustCommand(message, client) {
  const target = parseTrustCommand(message.content);
  if (!target) return false;

  // Consume the message before any other message command handler can see it.
  message.content = '';
  // Unauthorized users receive no response at all.
  if (message.author.id !== OWNER_ID) return true;

  const config = await getGuildConfig(client, message.guild.id);
  const key = target.type === 'role' ? 'antiNukeTrustedRoles' : 'antiNukeTrustedUsers';
  const current = new Set(Array.isArray(config?.[key]) ? config[key] : []);
  const adding = target.command === 'تراست' || target.command === 'trust';

  if (adding && target.type === 'role') {
    const role = await message.guild.roles.fetch(target.id).catch(() => null);
    if (!role || role.managed || role.id === message.guild.id) return true;
  }
  if (adding && target.type === 'user') {
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (!member) return true;
  }

  if (adding) current.add(target.id);
  else current.delete(target.id);
  await updateGuildConfig(client, message.guild.id, { [key]: [...current] });
  await message.channel.send(
    `${adding ? '🛡️ تمت إضافة' : '✅ تمت إزالة'} ${target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`} ${adding ? 'إلى' : 'من'} قائمة Trust.`,
  ).catch(() => {});
  return true;
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;
      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      if (await handleTrustCommand(message, client)) return;
      if (await handleArabicUtilityShortcuts(message)) return;
      if (await handleMessageDeleteShortcut(message)) return;
      if (await handleCountingGame(message, client)) return;
      await handlePrefixCommand(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
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
