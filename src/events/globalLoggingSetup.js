import { Events } from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../services/config/guildConfig.js';
import { logger, startupLog } from '../utils/logger.js';

const GLOBAL_LOG_CHANNEL_ID = '1550564287129456810';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    let cleared = 0;
    let configured = 0;

    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await getGuildConfig(client, guild.id);
        await updateGuildConfig(client, guild.id, {
          antiNukeTrustedUsers: [],
          antiNukeTrustedRoles: [],
          antiRaidTrustedUsers: [],
          antiRaidTrustedRoles: [],
          antiNukeLogChannelId: GLOBAL_LOG_CHANNEL_ID,
          logging: {
            ...(config?.logging || {}),
            enabled: false,
            channels: {
              ...(config?.logging?.channels || {}),
              audit: null,
              applications: null,
              reports: null,
            },
          },
        });
        cleared += 1;
        configured += 1;
      } catch (error) {
        logger.error(`Failed to reset Anti-Raid/Anti-Nuke config in ${guild.name}:`, error);
      }
    }

    startupLog(`Anti-Raid/Anti-Nuke reset: cleared trust in ${cleared} guild(s); configured ${configured} log channel(s)`);
  },
};
