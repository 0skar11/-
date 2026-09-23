import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  AI_CHAT_INTERVAL_LIMITS,
  isAiConfigured,
  getAiChatConfig,
  enableAiChat,
  disableAiChat,
  postAiChatMessage,
  formatAiError,
} from '../../services/aiChatService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

function formatTime(timestamp) {
  return timestamp ? `<t:${Math.floor(timestamp / 1000)}:R>` : '—';
}

export default {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Manage the AI chat member (replies, hourly chat starters, web facts)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Turn on the AI and choose the channel for its scheduled posts')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Chat channel for the hourly messages and web facts')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((option) =>
          option
            .setName('chat_minutes')
            .setDescription('Minutes between chat starters (default 60)')
            .setMinValue(AI_CHAT_INTERVAL_LIMITS.chat.min)
            .setMaxValue(AI_CHAT_INTERVAL_LIMITS.chat.max),
        )
        .addIntegerOption((option) =>
          option
            .setName('info_minutes')
            .setDescription('Minutes between facts from the web (default 180)')
            .setMinValue(AI_CHAT_INTERVAL_LIMITS.info.min)
            .setMaxValue(AI_CHAT_INTERVAL_LIMITS.info.max),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Turn off the AI replies and scheduled posts'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Show the AI chat settings'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('post')
        .setDescription('Post a chat starter or a web fact right now')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('What to post')
            .setRequired(true)
            .addChoices({ name: 'Chat starter', value: 'chat' }, { name: 'Fact from the web', value: 'info' }),
        ),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('AI command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to use this command.' });
      }

      const { client, guildId } = interaction;
      const subcommand = interaction.options.getSubcommand();

      if (!isAiConfigured() && subcommand !== 'status' && subcommand !== 'disable') {
        return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'الـ AI مش متفعل على البوت: لازم `ANTHROPIC_API_KEY` يتحط في متغيرات البيئة.' });
      }

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        if (!channel?.permissionsFor(client.user)?.has(['ViewChannel', 'SendMessages'])) {
          return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `البوت محتاج صلاحية يشوف ويبعت رسايل في ${channel}.` });
        }
        const config = await enableAiChat(client, guildId, {
          channelId: channel.id,
          chatIntervalMinutes: interaction.options.getInteger('chat_minutes') ?? undefined,
          infoIntervalMinutes: interaction.options.getInteger('info_minutes') ?? undefined,
        });
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'AI Chat Enabled',
              [
                `• أي حد يعمل منشن للبوت أو ريبلاي على رسالة منه هيرد عليه.`,
                `• رسالة تفاعل في ${channel} كل **${config.chatIntervalMinutes}** دقيقة.`,
                `• معلومة من النت في ${channel} كل **${config.infoIntervalMinutes}** دقيقة.`,
                '• لو آخر رسالة في الشات من البوت ومحدش رد، مش هيبعت تاني لحد ما حد يتكلم.',
              ].join('\n'),
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        await disableAiChat(client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('AI Chat Disabled', 'البوت مش هيرد بالـ AI ولا هيبعت رسايل مجدولة.')],
        });
      }

      const config = await getAiChatConfig(client, guildId);

      if (subcommand === 'status') {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'AI Chat Status',
              fields: [
                { name: 'API key', value: isAiConfigured() ? 'Set' : 'Missing (`ANTHROPIC_API_KEY`)', inline: true },
                { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
                { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not configured', inline: true },
                { name: 'Chat starter every', value: `${config.chatIntervalMinutes} min`, inline: true },
                { name: 'Web fact every', value: `${config.infoIntervalMinutes} min`, inline: true },
                { name: 'Model', value: process.env.AI_MODEL?.trim() || 'claude-opus-5', inline: true },
                { name: 'Last chat starter', value: formatTime(config.lastChatPostAt), inline: true },
                { name: 'Last web fact', value: formatTime(config.lastInfoPostAt), inline: true },
              ],
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'post') {
        if (!config.enabled || !config.channelId) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'فعّل الـ AI الأول بـ `/ai setup`.' });
        }
        const type = interaction.options.getString('type');
        try {
          const sent = await postAiChatMessage(client, interaction.guild, type, config);
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [sent
              ? successEmbed('Posted', `اتبعتت: ${sent.url}`)
              : infoEmbed('Nothing Posted', 'الـ AI مرجعش رسالة المرة دي، جرب تاني.')],
          });
        } catch (error) {
          logger.error(`AI manual post failed: ${formatAiError(error)}`, { guildId });
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `فشل الإرسال: ${formatAiError(error)}` });
        }
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please choose a valid AI action.' });
    } catch (error) {
      logger.error('AI command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Something went wrong while managing the AI chat.' });
    }
  },
};
