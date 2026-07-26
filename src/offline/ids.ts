export function createOfflineId(prefix: string): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('A cryptographically secure UUID generator is required for offline records.');
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
