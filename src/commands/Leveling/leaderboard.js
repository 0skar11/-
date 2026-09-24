import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLeaderboard, getLevelingConfig } from '../../services/leveling/leveling.js';
import { getChatCounts, rankChatCounts } from '../../services/leveling/chatCounter.js';
import { buildTopEmbed, buildTopChatEmbed } from '../../services/leveling/levelUi.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

// `top level` / `توب لفل` (also plain `top` / `توب`): the 10 members with the most XP.
// `top chat` / `توب شات`: the 10 members with the most messages. Both add the caller's own place.
export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Shows the server's level or chat leaderboard")
    .addStringOption((option) => option
      .setName('type')
      .setDescription('Level (XP) or chat (messages)')
      .addChoices({ name: 'Level', value: 'level' }, { name: 'Chat', value: 'chat' })
      .setRequired(false))
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);
    const type = interaction.options.getString('type') === 'chat' ? 'chat' : 'level';

    if (type === 'chat') {
      const members = await interaction.guild.members.fetch().catch(() => null);
      const isMember = (userId) => !members || (members.has(userId) && !members.get(userId).user.bot);
      const ranked = rankChatCounts(await getChatCounts(client, interaction.guildId), isMember);
      const callerEntry = ranked.find((entry) => entry.userId === interaction.user.id) || null;
      const embed = buildTopChatEmbed(interaction.guild, ranked.slice(0, 10), { callerId: interaction.user.id, callerEntry });
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }

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
