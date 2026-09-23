import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { ensureAuditLogChannels } from "../services/auditLogChannelsService.js";
import { publishArabicModerationCommands } from "../services/moderationCommandsBoardService.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);
      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      // A failure here must not stop the rest of the startup work.
      try {
        const result = await publishArabicModerationCommands(client);
        startupLog(`Arabic moderation commands: ${result.status} (channel ${result.channelId})`);
      } catch (error) {
        logger.error("Failed to publish Arabic moderation commands:", error);
      }
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
