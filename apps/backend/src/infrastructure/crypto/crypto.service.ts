import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encrypt, decrypt, hashForSearch, hexKeyToBuffer } from '@delta/shared-crypto';

// Dev-environment placeholder keys from apps/backend/.env — all-zeros / all-ones.
// Reject these in any non-development environment.
const TRIVIAL_KEY_PATTERNS = [
  /^0{64}$/, // ENCRYPTION_KEY dev default
  /^1{64}$/, // ENCRYPTION_HMAC_SECRET dev default
];

function isTrivialKey(hex: string): boolean {
  return TRIVIAL_KEY_PATTERNS.some((re) => re.test(hex));
}

/**
 * Injectable wrapper around @delta/shared-crypto.
 *
 * Reads ENCRYPTION_KEY and ENCRYPTION_HMAC_SECRET from the environment at boot
 * time and validates that they are present and non-trivial outside development.
 *
 * This service is global — provided by CryptoModule (@Global) and available
 * in every module without explicit import.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private encryptionKey!: Buffer;
  private hmacSecret!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const keyHex = this.config.get<string>('ENCRYPTION_KEY');
    const hmacHex = this.config.get<string>('ENCRYPTION_HMAC_SECRET');
    const env = this.config.get<string>('NODE_ENV') ?? 'development';

    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY is required but not set');
    }
    if (!hmacHex) {
      throw new Error('ENCRYPTION_HMAC_SECRET is required but not set');
    }

    // Block trivial placeholder keys in any environment other than development.
    if (env !== 'development' && (isTrivialKey(keyHex) || isTrivialKey(hmacHex))) {
      throw new Error(
        'Trivial placeholder encryption keys detected in non-development environment. ' +
          'Set real keys via Secret Manager.',
      );
    }

    this.encryptionKey = hexKeyToBuffer(keyHex);
    this.hmacSecret = hmacHex;
  }

  /** Encrypts a plaintext string. Returns base64-encoded ciphertext. */
  encrypt(plaintext: string): string {
    return encrypt(plaintext, this.encryptionKey);
  }

  /** Decrypts a base64-encoded ciphertext. Throws on tampered payload. */
  decrypt(ciphertext: string): string {
    return decrypt(ciphertext, this.encryptionKey);
  }

  /**
   * Computes a deterministic HMAC hash for search.
   * Normalizes the value before hashing (trim, collapse spaces, strip accents, lowercase).
   */
  hashForSearch(value: string): string {
    return hashForSearch(value, this.hmacSecret);
  }
}
