import { Events } from 'discord.js';

const WELCOME_CHANNEL_ID = '1547305745417113700';

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member) {
    if (!member.guild || member.user?.bot) return;

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID)
      || await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

    if (!channel?.isTextBased?.()) return;

    await channel.send({
      content: `welcome to VOID ${member}`,
      allowedMentions: { users: [member.id] },
    }).catch(() => {});
  },
};
