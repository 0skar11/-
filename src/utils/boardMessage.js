/**
 * Finds this bot's board message among the channel's recent messages so it can be edited in place.
 * When earlier runs left several copies, the oldest is kept and the extra copies are deleted.
 */
export async function findBoardMessage(channel, isBoardMessage) {
  const recentMessages = await channel.messages.fetch({ limit: 100 });
  const boards = [...recentMessages.values()]
    .filter((message) => message.author?.id === channel.client.user.id && isBoardMessage(message))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const [board, ...duplicates] = boards;
  await Promise.all(duplicates.map((message) => message.delete().catch(() => {})));
  return board || null;
}
