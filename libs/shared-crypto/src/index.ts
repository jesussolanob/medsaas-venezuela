import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const IV_LENGTH = 12; // AES-GCM recommended 96-bit IV
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Derives a 32-byte Buffer from a 64-character hex key string.
 * Throws if the input is not exactly 64 hex characters.
 */
export function hexKeyToBuffer(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 *
 * Returns a base64-encoded string of: IV (12 bytes) || ciphertext || authTag (16 bytes).
 * Each call uses a fresh random IV, so two encryptions of the same plaintext
 * produce different ciphertext — safe for PII storage.
 *
 * @param plaintext - UTF-8 string to encrypt
 * @param key - 32-byte Buffer (use hexKeyToBuffer to derive from env)
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Layout: iv (12) || ciphertext (variable) || authTag (16)
  const payload = Buffer.concat([iv, encrypted, authTag]);
  return payload.toString('base64');
}

/**
 * Decrypts a payload produced by `encrypt`.
 *
 * Validates the GCM authentication tag — throws if the payload was tampered with.
 *
 * @param payload - base64-encoded string produced by encrypt()
 * @param key - same 32-byte Buffer used for encryption
 */
export function decrypt(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, 'base64');

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted payload: too short');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  // Buffer.concat + toString('utf8') is the correct way to handle multibyte sequences
  // (e.g. emojis) that might otherwise be corrupted by implicit Buffer→string coercion.
  // decipher.final() without an encoding arg returns a Buffer, guaranteeing no split.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Normalizes a string for deterministic search hashing.
 *
 * Steps:
 *   1. Trim leading/trailing whitespace.
 *   2. Collapse multiple internal spaces to one.
 *   3. Remove diacritical marks (NFD decomposition + strip combining characters).
 *   4. Convert to lowercase.
 *
 * This ensures "Juan  Pérez" and "juan perez" produce the same hash.
 *
 * Exported because the partial-name search decrypts and filters in-app, and has to
 * compare with exactly the same criteria the hash uses — si no, buscar "Maria" no
 * encuentra a "María".
 *
 * @param value - raw input string
 */
export function normalizeForSearch(value: string): string {
  return value.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Computes a deterministic HMAC-SHA256 hex string for equality-based lookups.
 *
 * Always normalizes input before hashing so equivalent strings produce the same
 * hash regardless of whitespace or diacritic variants.
 *
 * Returns a 64-character lowercase hex string.
 *
 * @param value - raw value to hash (e.g. a patient's name or cédula)
 * @param hmacSecret - 64-character hex string used as the HMAC key
 */
export function hashForSearch(value: string, hmacSecret: string): string {
  const normalized = normalizeForSearch(value);
  return createHmac('sha256', hmacSecret).update(normalized, 'utf8').digest('hex');
}
