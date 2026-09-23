// Responses to message (prefix/Arabic) commands are sent as a reply to the command message.
// No ping for the author; if the command message is already gone (e.g. purged), it is sent normally.
export function replyToMessage(message, payload) {
  const options = typeof payload === 'string' ? { content: payload } : { ...payload };
  options.allowedMentions = { ...(options.allowedMentions || {}), repliedUser: false };
  options.failIfNotExists = false;
  return message.reply(options);
}
