import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishArabicModerationCommands } from '../../services/moderationCommandsBoardService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('publish-moderation-commands')
    .setDescription('Post the Arabic moderation commands list (skipped if it already exists)'),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });
    try {
      const result = await publishArabicModerationCommands(interaction.client);
      const content = result.status === 'sent'
        ? `✅ تم إرسال أوامر الموديريشن في الروم <#${result.channelId}>.`
        : `ℹ️ أوامر الموديريشن موجودة بالفعل في الروم <#${result.channelId}>.`;
      await interaction.reply({ content, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ فشل الإرسال: ${error.message}`, ephemeral: true });
    }
  },
};
