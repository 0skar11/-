import { Events, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { ensureAuditLogChannels } from "../services/auditLogChannelsService.js";

const MODERATION_COMMANDS_CHANNEL_ID = '1551621505991835699';
const MODERATION_COMMANDS_MARKER = 'titanbot:arabic-moderation-commands:v1';

async function publishArabicModerationCommands(client) {
  const channel = await client.channels.fetch(MODERATION_COMMANDS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) {
    logger.warn(`Arabic moderation commands channel is unavailable: ${MODERATION_COMMANDS_CHANNEL_ID}`);
    return;
  }

  const botMember = channel.guild?.members?.me;
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    logger.warn(`Missing permissions to publish Arabic moderation commands in ${MODERATION_COMMANDS_CHANNEL_ID}`);
    return;
  }

  const recentMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const alreadyPublished = recentMessages?.some((message) =>
    message.author?.id === client.user.id && message.content?.includes(MODERATION_COMMANDS_MARKER)
  );
  if (alreadyPublished) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🛡️ أوامر الموديريشن بالعربي')
    .setDescription('استخدم الـ prefix قبل الأمر إذا كان مفعّلًا في السيرفر. يمكنك منشن العضو أو الرد على رسالته.')
    .addFields(
      {
        name: '🚫 الحظر والطرد',
        value: [
          '`بان @العضو السبب` — Ban',
          '`انبان ID_العضو` — Unban',
          '`طرد @العضو السبب` — Kick',
          '`ماس بان ID1 ID2 السبب` — Mass ban',
          '`ماس طرد ID1 ID2 السبب` — Mass kick',
        ].join('\n'),
      },
      {
        name: '⏱️ التايم والتحذيرات',
        value: [
          '`تايم @العضو 5m السبب` — Timeout',
          '`انتايم @العضو` — Remove timeout',
          '`تحذير @العضو السبب` — Warn',
          '`تحذيرات @العضو` — Warnings',
          '`مسح تحذيرات @العضو` — Clear warnings',
        ].join('\n'),
      },
      {
        name: '🔧 إدارة الرومات والبيانات',
        value: [
          '`قفل` — Lock channel',
          '`فتح` — Unlock channel',
          '`مسح 10` — Purge messages',
          '`حالات` — Moderation cases',
          '`ملاحظات @العضو` — User notes',
          '`قل @العضو النص` — Say as the bot',
          '`خاص @العضو النص` — DM user',
        ].join('\n'),
      },
    )
    .setFooter({ text: MODERATION_COMMANDS_MARKER });

  await channel.send({ embeds: [embed], content: `​${MODERATION_COMMANDS_MARKER}` });
  logger.info(`Published Arabic moderation commands once in channel ${MODERATION_COMMANDS_CHANNEL_ID}`);
}

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);
      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      await publishArabicModerationCommands(client);
      await ensureAuditLogChannels(client);

      if (client.config?.features?.music) initRiffyAfterReady(client);
      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(`Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`);
      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(`Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds}, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}`);
      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(`Verification panel health: scanned ${verificationPanelSummary.scannedGuilds}, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}`);
      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(`Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels}, healthy ${reactionRolePanelSummary.healthyPanels}, missing channel ${reactionRolePanelSummary.missingChannels}`);
      const levelRoleSummary = await reconcileLevelRoles(client);
      startupLog(`Level role sync: scanned ${levelRoleSummary.scannedGuilds}, pruned ${levelRoleSummary.prunedRewardEntries}, re-awarded ${levelRoleSummary.rolesReAwarded}, errors ${levelRoleSummary.errors}`);
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
