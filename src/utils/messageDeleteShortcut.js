import { PermissionFlagsBits } from 'discord.js';

const SHORTCUT_PATTERN = /^م\s+([0-9٠-٩]+)$/u;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100;
const CONFIRMATION_DELETE_DELAY_MS = 4_000;

function toWesternDigits(value) {
  return value.replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

async function reply(message, content) {
  return message.channel.send(content).catch(() => null);
}

export async function handleMessageDeleteShortcut(message) {
  const match = String(message?.content || '').trim().match(SHORTCUT_PATTERN);
  if (!match) return false;

  // This shortcut is intentionally silent when Manage Messages is missing.
  if (!message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;

  const amount = Number(toWesternDigits(match[1]));
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    await reply(message, '❌ استخدم الأمر هكذا: `م 10` — العدد يجب أن يكون بين 1 و100.');
    return true;
  }
  if (!message.channel?.isTextBased?.() || typeof message.channel.bulkDelete !== 'function') {
    await reply(message, '❌ هذا الأمر يعمل داخل روم نصية فقط.');
    return true;
  }

  try {
    const fetched = await message.channel.messages.fetch({ limit: amount });
    const deleted = await message.channel.bulkDelete(fetched, true);
    const confirmation = await reply(message, `🧹 تم حذف **${deleted.size}** رسالة.`);
    if (confirmation) setTimeout(() => confirmation.delete().catch(() => {}), CONFIRMATION_DELETE_DELAY_MS);
  } catch (error) {
    await reply(message, '❌ تعذر حذف الرسائل. تأكد من صلاحيات البوت وأن الرسائل ليست أقدم من 14 يومًا.');
  }
  return true;
}
