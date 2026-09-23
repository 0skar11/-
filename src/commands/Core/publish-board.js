import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishStaffPermissionBoard } from '../../services/staffRoleHierarchyService.js';
import { publishArabicModerationCommands } from '../../services/moderationCommandsBoardService.js';
import { publishTrustedBoard } from '../../services/trustedBoardService.js';

// One command with subcommands keeps the bot under Discord's 100 global command limit.
export default {
  data: new SlashCommandBuilder()
    .setName('publish-board')
    .setDescription('Post a bot info board once (skipped if it already exists)')
    .addSubcommand((sub) => sub.setName('moderation-commands').setDescription('Post the Arabic moderation commands list'))
    .addSubcommand((sub) => sub.setName('admin-permissions').setDescription('Post or refresh the staff permission board'))
    .addSubcommand((sub) => sub.setName('trusted').setDescription('Post or refresh the Anti-Nuke trusted list')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });

    try {
      let sent;
      let channelId;
      if (interaction.options.getSubcommand() === 'admin-permissions') {
        const result = await publishStaffPermissionBoard(interaction.guild);
        const parts = [];
        if (result.sent) parts.push(`إرسال ${result.sent}`);
        if (result.edited) parts.push(`تحديث ${result.edited}`);
        const summary = parts.length ? `✅ تم ${parts.join(' و ')} رسالة في الروم <#${result.channelId}>.` : `ℹ️ لم يتم العثور على رتب الستاف في الروم <#${result.channelId}>.`;
        return interaction.reply({ content: summary, ephemeral: true });
      } else if (interaction.options.getSubcommand() === 'trusted') {
        const result = await publishTrustedBoard(interaction.client);
        const verb = result.status === 'sent' ? 'إرسال' : 'تحديث';
        return interaction.reply({ content: `✅ تم ${verb} قائمة الـ Trusted في الروم <#${result.channelId}>.`, ephemeral: true });
      } else {
        const result = await publishArabicModerationCommands(interaction.client);
        sent = result.status !== 'exists';
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
