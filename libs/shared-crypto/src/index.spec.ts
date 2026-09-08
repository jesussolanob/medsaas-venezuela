import {
  encrypt,
  decrypt,
  hashForSearch,
  hexKeyToBuffer,
  normalizeForSearch,
  normalizeCedulaForSearch,
  cedulaSearchVariants,
} from './index';

// 64 hex chars = 32 bytes for AES-256
const TEST_KEY_HEX = '0000000000000000000000000000000000000000000000000000000000000000';
const TEST_HMAC_HEX = '1111111111111111111111111111111111111111111111111111111111111111';

describe('hexKeyToBuffer', () => {
  it('converts a valid 64-char hex string to a 32-byte Buffer', () => {
    const buf = hexKeyToBuffer(TEST_KEY_HEX);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(32);
  });

  it('throws when the key is not 64 hex characters', () => {
    expect(() => hexKeyToBuffer('abc')).toThrow();
    expect(() => hexKeyToBuffer('ZZ' + TEST_KEY_HEX.slice(2))).toThrow();
    expect(() => hexKeyToBuffer('')).toThrow();
  });
});

describe('encrypt / decrypt', () => {
  const key = hexKeyToBuffer(TEST_KEY_HEX);

  it('round-trips a plaintext string correctly', () => {
    const plaintext = 'Juan Pérez';
    const ciphertext = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips an empty string', () => {
    const ciphertext = encrypt('', key);
    expect(decrypt(ciphertext, key)).toBe('');
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const plaintext = 'same-value';
    const first = encrypt(plaintext, key);
    const second = encrypt(plaintext, key);
    expect(first).not.toBe(second);
    // Both must still decrypt correctly
    expect(decrypt(first, key)).toBe(plaintext);
    expect(decrypt(second, key)).toBe(plaintext);
  });

  it('throws when decrypting a tampered payload', () => {
    const ciphertext = encrypt('sensitive data', key);
    // Flip a byte in the ciphertext portion (after the IV)
    const buf = Buffer.from(ciphertext, 'base64');
    const byte = buf[12];
    if (byte !== undefined) buf[12] = byte ^ 0xff; // tamper byte 12 (inside ciphertext)
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('throws when the payload is too short to be valid', () => {
    // Fewer than IV_LENGTH + AUTH_TAG_LENGTH = 28 bytes
    const tooShort = Buffer.from('dG9vc2hvcnQ=', 'base64'); // "tooshort"
    expect(() => decrypt(tooShort.toString('base64'), key)).toThrow();
  });

  it('handles unicode and special characters', () => {
    const value = 'V-12345678 José Ángel 😀';
    expect(decrypt(encrypt(value, key), key)).toBe(value);
  });

  it('round-trips strings with 4-byte emoji sequences correctly', () => {
    // Emoji characters are encoded as 4-byte UTF-8 sequences (U+1F600 etc.).
    // The Buffer.concat approach in decrypt guarantees no multibyte split.
    const emojis = '🎉🔬💊📋✅';
    expect(decrypt(encrypt(emojis, key), key)).toBe(emojis);
  });

  it('round-trips a long string with mixed multibyte content', () => {
    const value = '😀 Médico: Dr. García — Diagnóstico: Hipertensión arterial 🫀';
    expect(decrypt(encrypt(value, key), key)).toBe(value);
  });
});

describe('hashForSearch', () => {
  it('returns a 64-character lowercase hex string', () => {
    const hash = hashForSearch('Juan Pérez', TEST_HMAC_HEX);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always returns same hash', () => {
    const hash1 = hashForSearch('V-12345678', TEST_HMAC_HEX);
    const hash2 = hashForSearch('V-12345678', TEST_HMAC_HEX);
    expect(hash1).toBe(hash2);
  });

  it('normalizes leading/trailing whitespace', () => {
    const hash1 = hashForSearch('  juan  ', TEST_HMAC_HEX);
    const hash2 = hashForSearch('juan', TEST_HMAC_HEX);
    expect(hash1).toBe(hash2);
  });

  it('collapses multiple internal spaces', () => {
    const hash1 = hashForSearch('Juan  Pérez', TEST_HMAC_HEX);
    const hash2 = hashForSearch('Juan Pérez', TEST_HMAC_HEX);
    expect(hash1).toBe(hash2);
  });

  it('normalizes diacritics (accents)', () => {
    const hash1 = hashForSearch('Juan Pérez', TEST_HMAC_HEX);
    const hash2 = hashForSearch('Juan Perez', TEST_HMAC_HEX);
    expect(hash1).toBe(hash2);
  });

  it('normalizes to lowercase', () => {
    const hash1 = hashForSearch('JUAN PEREZ', TEST_HMAC_HEX);
    const hash2 = hashForSearch('juan perez', TEST_HMAC_HEX);
    expect(hash1).toBe(hash2);
  });

  it('combines normalization: mixed case + accents + extra spaces', () => {
    const hash1 = hashForSearch('  Juan  Pérez  ', TEST_HMAC_HEX);
    const hash2 = hashForSearch('juan perez', TEST_HMAC_HEX);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for genuinely different inputs', () => {
    const hash1 = hashForSearch('juan perez', TEST_HMAC_HEX);
    const hash2 = hashForSearch('juan garcia', TEST_HMAC_HEX);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different HMAC secrets', () => {
    const secret2 = '2222222222222222222222222222222222222222222222222222222222222222';
    const hash1 = hashForSearch('juan', TEST_HMAC_HEX);
    const hash2 = hashForSearch('juan', secret2);
    expect(hash1).not.toBe(hash2);
  });
});

describe('normalizeForSearch', () => {
  it('strips accents, collapses spaces, trims and lowercases', () => {
    expect(normalizeForSearch('  María  José  ')).toBe('maria jose');
  });

  it('leaves an already normalized value untouched', () => {
    expect(normalizeForSearch('ana sweeney')).toBe('ana sweeney');
  });

  it('matches the normalization used by hashForSearch', () => {
    const a = hashForSearch('  Ana   SWEENEY ', TEST_HMAC_HEX);
    const b = hashForSearch(normalizeForSearch('  Ana   SWEENEY '), TEST_HMAC_HEX);
    expect(a).toBe(b);
  });
});

describe('normalizeCedulaForSearch', () => {
  it('strips a hyphen between the prefix and the digits', () => {
    expect(normalizeCedulaForSearch('V-12345678')).toBe('V12345678');
  });

  it('strips dots used as thousands separators', () => {
    expect(normalizeCedulaForSearch('V-12.345.678')).toBe('V12345678');
  });

  it('uppercases a lowercase prefix', () => {
    expect(normalizeCedulaForSearch('v-12345678')).toBe('V12345678');
  });

  it('leaves a cédula with no prefix as digits only', () => {
    expect(normalizeCedulaForSearch('12345678')).toBe('12345678');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCedulaForSearch('  V-12345678  ')).toBe('V12345678');
  });

  it('collapses internal spaces same as dashes and dots', () => {
    expect(normalizeCedulaForSearch('V 12 345 678')).toBe('V12345678');
  });

  it('produces the same result regardless of separator style', () => {
    const variants = ['V-12345678', 'V12345678', 'V.12.345.678', 'v - 12345678'];
    const normalized = variants.map(normalizeCedulaForSearch);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('V12345678');
  });

  it('does NOT strip the nationality prefix — never merges V and E', () => {
    expect(normalizeCedulaForSearch('V-12345678')).toBe('V12345678');
    expect(normalizeCedulaForSearch('E-12345678')).toBe('E12345678');
    expect(normalizeCedulaForSearch('V-12345678')).not.toBe(normalizeCedulaForSearch('E-12345678'));
  });

  it('does NOT invent a prefix for a digits-only cédula', () => {
    expect(normalizeCedulaForSearch('12345678')).not.toBe('V12345678');
    expect(normalizeCedulaForSearch('12345678')).not.toBe('E12345678');
  });

  it('feeds into hashForSearch deterministically — same cédula, any format, same hash', () => {
    const a = hashForSearch(normalizeCedulaForSearch('V-12345678'), TEST_HMAC_HEX);
    const b = hashForSearch(normalizeCedulaForSearch('v12345678'), TEST_HMAC_HEX);
    const c = hashForSearch(normalizeCedulaForSearch('V-12.345.678'), TEST_HMAC_HEX);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('V and E hash to different values through hashForSearch too', () => {
    const vHash = hashForSearch(normalizeCedulaForSearch('V-12345678'), TEST_HMAC_HEX);
    const eHash = hashForSearch(normalizeCedulaForSearch('E-12345678'), TEST_HMAC_HEX);
    expect(vHash).not.toBe(eHash);
  });
});

describe('cedulaSearchVariants', () => {
  it('returns the as-typed value and the canonical form when they differ', () => {
    expect(cedulaSearchVariants('V-12345678')).toEqual(['V-12345678', 'V12345678']);
  });

  it('returns a single entry when the raw value is already canonical', () => {
    expect(cedulaSearchVariants('12345678')).toEqual(['12345678']);
  });

  it('as-typed comes first — callers stop at the first match, and the raw hash is more likely for old data', () => {
    const variants = cedulaSearchVariants('v-12.345.678');
    expect(variants[0]).toBe('v-12.345.678');
    expect(variants[1]).toBe('V12345678');
  });

  it('keeps V and E as separate variant sets — never merges them', () => {
    expect(cedulaSearchVariants('V-12345678')).not.toEqual(
      expect.arrayContaining(cedulaSearchVariants('E-12345678')),
    );
  });
});
