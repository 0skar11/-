import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishStaffPermissionBoard } from '../../services/staffRoleHierarchyService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('publish-admin-permissions')
    .setDescription('Publish the staff permission board once (skipped if it already exists)'),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });
    const result = await publishStaffPermissionBoard(interaction.guild);
    const content = result.sent > 0
      ? `✅ تم نشر ${result.sent} رسالة صلاحيات في الروم <#${result.channelId}>.`
      : `ℹ️ لوحة الصلاحيات موجودة بالفعل في الروم <#${result.channelId}>، لم يتم إرسال رسائل جديدة.`;
    await interaction.reply({ content, ephemeral: true });
  },
};
