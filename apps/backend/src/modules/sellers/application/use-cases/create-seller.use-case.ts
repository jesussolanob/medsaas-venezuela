import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerProfile,
} from '../../domain/repositories/seller.repository';

/**
 * Alphanumeric characters that are unambiguous when read aloud or typed by hand.
 *
 * Excluded:
 *   0 (zero)  — looks like O
 *   O         — looks like 0 or Q on small screens
 *   1 (one)   — looks like l or I
 *   l         — looks like 1 or I
 *   I         — looks like 1 or l
 */
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 6;
const MAX_RETRIES = 10;

/** Generates a random seller code of CODE_LENGTH safe characters. */
function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  return code;
}

export interface CreateSellerInput {
  fullName: string;
  email: string;
}

/**
 * CreateSellerUseCase
 *
 * Admin-only. Creates a new seller profile:
 *   1. Generates a short unique seller_code (retries on collision, up to
 *      MAX_RETRIES times).
 *   2. Delegates the write to ISellerRepository, which creates the profile with
 *      role = 'seller'.
 *
 * Security:
 *   - seller_code is generated server-side; the client never supplies it.
 *   - Sellers cannot choose their own plan — they are not subscription holders.
 *   - Callers must guard this use case with @Roles('super_admin', 'admin'):
 *     cualquier administrador gestiona vendedores (decisión del dueño).
 */
@Injectable()
export class CreateSellerUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(input: CreateSellerInput): Promise<SellerProfile> {
    const sellerCode = await this.generateUniqueCode();

    return this.sellerRepo.createSeller({
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email.toLowerCase().trim(),
      sellerCode,
    });
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const code = randomCode();
      const taken = await this.sellerRepo.codeExists(code);
      if (!taken) return code;
    }
    // Extremely unlikely given the search space (32^6 ≈ 1B combinations).
    throw new Error(
      `[CreateSellerUseCase] could not generate a unique seller_code after ${MAX_RETRIES} retries`,
    );
  }
}
