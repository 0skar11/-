// Server owners: they get owner-only access (purge, trust, protected boards, anti-raid trust).
export const SERVER_OWNER_IDS = ['1159601661392715906', '1308224908576428079'];

export function isServerOwner(userId) {
  return SERVER_OWNER_IDS.includes(String(userId));
}
