import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { publishStaffPermissionBoard } from '../../services/staffRoleHierarchyService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('publish-admin-permissions')
    .setDescription('Permission-board publishing is disabled'),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ تحتاج إلى صلاحية Manage Server.', ephemeral: true });
    const result = await publishStaffPermissionBoard(interaction.guild);
    await interaction.reply({ content: `🛑 تم تعطيل إرسال رسائل الصلاحيات نهائيًا في الروم <#${result.channelId}>.`, ephemeral: true });
  },
};
