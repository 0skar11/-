import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLeaderboard, getLevelingConfig } from '../../services/leveling/leveling.js';
import { buildTopEmbed } from '../../services/leveling/levelUi.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

// `top` / `توب`: the 10 members with the most XP, plus the caller's own place.
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level leaderboard")
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, { content: '⚠️ نظام اللفلات مقفول في السيرفر ده.' });
      return;
    }

    const everyone = await getLeaderboard(client, interaction.guildId, 100);
    const callerEntry = everyone.find((entry) => entry.userId === interaction.user.id) || null;
    const embed = buildTopEmbed(interaction.guild, everyone.slice(0, 10), { callerId: interaction.user.id, callerEntry });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
    logger.debug(`Leaderboard displayed for guild ${interaction.guildId}`);
  }
};
