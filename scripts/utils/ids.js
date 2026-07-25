export function randomId(length = 16) {
  if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID(length);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte, index) => alphabet[(byte || (Date.now() + index)) % alphabet.length]).join("");
}
