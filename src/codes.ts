import type { TrackerStore } from './types.js';

const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

const LINK_BLOCK = 'tracked-link';

export async function generateUniqueCode(
  store: TrackerStore,
  length: number,
  maxAttempts = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = randomCode(length);
    const existing = await store.list(LINK_BLOCK, {
      where: { shortCode: code },
    });
    if (existing.length === 0) return code;
  }
  throw new Error(
    `Failed to generate unique code after ${maxAttempts} attempts`,
  );
}
