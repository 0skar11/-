import { PermissionFlagsBits } from 'discord.js';
import { getCommandPrefix } from '../config/bot.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { ModerationService } from '../services/moderation/moderationService.js';
import { WarningService } from '../services/moderation/warningService.js';

const COMMANDS = new Set([
  'وارن', 'تايم', 'انتايم', 'بان', 'انبان', 'كلير', 'ان', 'شيل', 'ر', 'رول', 'ب', 'رتبة', 'ازالةرتبة', 'purge', 'تراست', 'انتراست', 'trusted', 'trust', 'untrust',
  'warn', 'timeout', 'untimeout', 'ban', 'unban', 'clear', 'remove', 'role', 'roll', 'lock', 'unlock',
].map((value) => value.toLowerCase()));

const ADD_ROLE_COMMANDS = new Set(['ر', 'رول', 'ان', 'رتبة', 'role', 'roll', 'addrole']);
const REMOVE_ROLE_COMMANDS = new Set(['ب', 'شيل', 'ازالةرتبة', 'remove', 'unrole', 'removerole']);
const OWNER_ID = '1159601661392715906';
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

// Existing helpers and moderation handlers remain unchanged below this section.
