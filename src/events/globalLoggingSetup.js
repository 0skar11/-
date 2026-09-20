import { Events } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { logger, startupLog } from '../utils/logger.js';

const GLOBAL_LOG_CHANNEL_ID = '1550564287129456810';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let updated = 0;

    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await getGuildConfig(client, guild.id);
        const logging = {
          ...(config?.logging || {}),
          enabled: true,
          channels: {
            ...(config?.logging?.channels || {}),
            audit: GLOBAL_LOG_CHANNEL_ID,
          },
          // Empty means every known event type is enabled unless explicitly disabled later.
          enabledEvents: {},
        };

        await updateGuildConfig(client, guild.id, {
          antiNukeLogChannelId: GLOBAL_LOG_CHANNEL_ID,
          logging,
        });
        updated += 1;
      } catch (error) {
        logger.error(`Failed to configure global log channel in ${guild.name}:`, error);
      }
    }

    startupLog(`Global logging configured for ${updated} guild(s) in #${GLOBAL_LOG_CHANNEL_ID}`);
  },
};
