  const channel = guild.channels.cache.get(ANTI_NUKE_LOG_CHANNEL_ID)
    || await guild.channels.fetch(ANTI_NUKE_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const permissions = channel.permissionsFor(guild.members.me);
  if (!permissions?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return null;
  return channel;
}

export async function sendAntiNukeLog(guild, { action, executor = null, target = null, details = [], severity = 'HIGH', mentionEveryone = true }) {
export async function sendAntiNukeLog(
  guild,
  {
    action,
    executor = null,
    target = null,
    details = [],
    severity = 'HIGH',
    mentionEveryone = true,
  },
) {
  const channel = await getLogChannel(guild);
  if (!channel) return null;

  const lines = [
    `**العملية:** ${action}`,
    `**الخطورة:** ${severity}`,
  const detailLines = [
    `**العملية التي حدثت:** ${action}`,
    `**مستوى الخطورة:** ${severity}`,
    `**المنفذ:** ${executor ? `${executor} — ${executor.tag || executor.username || executor.id}` : 'غير معروف'}`,
    target ? `**الهدف:** ${target}` : null,
    `**الهدف:** ${target || 'غير محدد'}`,
    ...details.map(([name, value]) => `**${name}:** ${value}`),
    `**السيرفر:** ${guild.name} (${guild.id})`,
    `**الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ].filter(Boolean);
    `**وقت العملية:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ];

  return channel.send({
    // Keep the mention outside the embed so Discord can notify everyone.
    content: mentionEveryone ? EVERYONE_MENTION : undefined,
    embeds: [{
      title: `🛡️ Anti-Nuke | ${action}`,
      description: lines.join('\n'),
      title: '🛡️ Anti-Nuke | تنبيه أمني',
      description: detailLines.join('\n\n'),
      color: severity === 'CRITICAL' ? 0xED4245 : 0xFEE75C,
      timestamp: new Date().toISOString(),
      footer: { text: 'TitanBot • Anti-Nuke Security Log' },
      footer: { text: `TitanBot • Anti-Nuke Security Log • ${guild.name}` },
    }],
    allowedMentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
  }).catch(error => {
