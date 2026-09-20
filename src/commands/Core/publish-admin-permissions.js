import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishStaffPermissionBoard } from '../../services/staffRoleHierarchyService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('publish-admin-permissions')
    .setDescription('ينشر صلاحيات رتب الإدارة في روم الصلاحيات'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await publishStaffPermissionBoard(interaction.guild);
      await interaction.editReply(`✅ تم إرسال **${result.sent}** رسائل صلاحيات منفصلة في الروم <#${result.channelId}>.`);
    } catch (error) {
      await interaction.editReply(`❌ فشل إرسال لوحة الصلاحيات: ${error.message}`);
    }
  },
};
