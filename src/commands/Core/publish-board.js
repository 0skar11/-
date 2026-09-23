import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishStaffPermissionBoard } from '../../services/staffRoleHierarchyService.js';
import { publishArabicModerationCommands } from '../../services/moderationCommandsBoardService.js';

// One command with subcommands keeps the bot under Discord's 100 global command limit.
export default {
  data: new SlashCommandBuilder()
    .setName('publish-board')
    .setDescription('Post a bot info board once (skipped if it already exists)')
    .addSubcommand((sub) => sub.setName('moderation-commands').setDescription('Post the Arabic moderation commands list'))
    .addSubcommand((sub) => sub.setName('admin-permissions').setDescription('Post the staff permission board')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });

    try {
      let sent;
      let channelId;
      if (interaction.options.getSubcommand() === 'admin-permissions') {
        const result = await publishStaffPermissionBoard(interaction.guild);
        sent = result.sent > 0;
        channelId = result.channelId;
      } else {
        const result = await publishArabicModerationCommands(interaction.client);
        sent = result.status === 'sent';
        channelId = result.channelId;
      }
      const content = sent
        ? `✅ تم الإرسال في الروم <#${channelId}>.`
        : `ℹ️ الرسالة موجودة بالفعل في الروم <#${channelId}>، لم يتم إرسال شيء جديد.`;
      await interaction.reply({ content, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ فشل الإرسال: ${error.message}`, ephemeral: true });
    }
  },
};
