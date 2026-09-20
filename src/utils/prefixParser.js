// prefixParser.js

import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { logger } from './logger.js';

export function parsePrefixCommand(content, prefix) {
  if (!content || !content.startsWith(prefix)) return null;

  const withoutPrefix = content.slice(prefix.length).trim();
  if (!withoutPrefix) return null;

  const args = parseArguments(withoutPrefix);
  if (args.length === 0) return null;

  return {
    commandName: args[0].toLowerCase(),
    args: args.slice(1),
    hasPrefix: true,
  };
}

/**
 * Parse both forms:
 *   !ban @user  (with the configured prefix)
 *   ban @user   (without a prefix)
 *
 * Bare commands are intentionally supported for every loaded command. This
 * keeps old prefixed commands working while allowing the bot to be used
 * without a prefix as requested.
 */
export function parseMessageCommand(content, prefix) {
  const prefixed = parsePrefixCommand(content, prefix);
  if (prefixed) return prefixed;

  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;

  const args = parseArguments(trimmed);
  if (args.length === 0) return null;

  return {
    commandName: args[0].toLowerCase(),
    args: args.slice(1),
    hasPrefix: false,
  };
}

function parseArguments(input) {
  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
        args.push(current);
        current = '';
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      if (current.trim()) {
        args.push(current.trim());
        current = '';
      }
      inQuote = true;
      quoteChar = char;
    } else if (/\s/u.test(char)) {
      if (current.trim()) {
        args.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

export function mapArgumentsToOptions(args, commandData) {
  const options = {};
  let subcommandName = null;
  let subcommandGroupName = null;

  const cmdData = commandData.toJSON ? commandData.toJSON() : commandData;
  if (!cmdData || !cmdData.options) {
    return {
      _positional: args,
      get: () => args[0] || null,
      getString: () => args[0] || null,
      getUser: () => null,
      getInteger: () => parseInt(args[0], 10) || null,
      getBoolean: () => args[0] === 'true',
      getSubcommand: () => null,
      getSubcommandGroup: () => null,
      validateRequired: () => ({ valid: true, missing: [] }),
    };
  }

  const subcommandGroup = cmdData.options.find((opt) => opt.type === 2);
  const subcommands = cmdData.options.filter((opt) => opt.type === 1);
  const hasSubcommands = subcommands.length > 0 && !subcommandGroup;

  let currentArgs = args;
  let optionDefs = [];

  logger.debug(`Parsing command: commandName=${cmdData.name}, args=${JSON.stringify(args)}, hasSubcommands=${hasSubcommands}, hasSubcommandGroup=${!!subcommandGroup}`);

  if (subcommandGroup) {
    if (args.length > 0) {
      subcommandGroupName = args[0].toLowerCase();
      const group = subcommandGroup.options?.find((opt) => opt.name === subcommandGroupName);
      if (group && args.length > 1) {
        subcommandName = resolveSubcommandAlias(args[1]);
        const sub = group.options?.find((opt) => opt.name === subcommandName);
        if (sub) {
          optionDefs = sub.options?.filter((opt) => opt.type !== 1 && opt.type !== 2) || [];
          currentArgs = args.slice(2);
        }
      }
    }
  } else if (hasSubcommands) {
    if (args.length > 0) {
      const resolvedSubcommand = resolveSubcommandAlias(args[0]);
      const sub = subcommands.find((opt) => opt.name === resolvedSubcommand);
      if (sub) {
        subcommandName = resolvedSubcommand;
        optionDefs = sub.options?.filter((opt) => opt.type !== 1 && opt.type !== 2) || [];
        currentArgs = args.slice(1);
      }
    }
  } else {
    optionDefs = cmdData.options.filter((opt) => opt.type !== 1 && opt.type !== 2);
  }

  for (let i = 0; i < Math.min(currentArgs.length, optionDefs.length); i++) {
    options[optionDefs[i].name] = currentArgs[i];
  }

  const missing = [];
  if (subcommandName || (!hasSubcommands && !subcommandGroup)) {
    for (const opt of optionDefs) {
      if (opt.required && !options[opt.name]) missing.push({ name: opt.name, description: opt.description, type: opt.type });
    }
  }

  if ((hasSubcommands || subcommandGroup) && !subcommandName && !subcommandGroupName) {
    const available = hasSubcommands ? subcommands.map((s) => s.name).join(', ') : subcommandGroup?.options?.map((g) => g.name).join(', ') || 'none';
    missing.push({ name: subcommandGroup ? 'subcommand group' : 'subcommand', description: `Available: ${available}`, type: 1 });
  } else if (hasSubcommands && args.length > 0 && !subcommandName) {
    missing.push({ name: 'subcommand', description: `Available: ${subcommands.map((s) => s.name).join(', ')}`, type: 1 });
  } else if (subcommandGroup && subcommandGroupName && !subcommandName) {
    const group = subcommandGroup.options?.find((g) => g.name === subcommandGroupName);
    missing.push({ name: 'subcommand', description: `Available: ${group?.options?.map((s) => s.name).join(', ') || 'none'}`, type: 1 });
  }

  return {
    ...options,
    _positional: args,
    get: (name) => options[name] || null,
    getString: (name) => options[name] || null,
    getUser: (name) => options[name] || null,
    getMember: (name) => options[name] || null,
    getChannel: (name) => options[name] || null,
    getRole: (name) => options[name] || null,
    getInteger: (name) => options[name] ? parseInt(options[name], 10) : null,
    getBoolean: (name) => options[name] === 'true',
    getSubcommand: () => subcommandName,
    getSubcommandGroup: () => subcommandGroupName,
    validateRequired: () => ({ valid: missing.length === 0, missing, subcommandName, subcommandGroupName, optionDefs }),
  };
}
