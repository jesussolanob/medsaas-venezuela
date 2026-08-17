import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';

export interface CreateSellerSpecialistInput {
  /** Profile id of the authenticated seller — from CurrentUser().sub, never the body. */
  sellerId: string;
  fullName: string;
  email: string;
  specialty?: string | null;
  cedula?: string | null;
  phone?: string | null;
}

/**
 * CreateSellerSpecialistUseCase
 *
 * A seller creates a new specialist on their behalf.
 *
 * Business rules:
 *   1. sold_by is always the authenticated seller (from the session token).
 *      The caller must NEVER pass it through the request body.
 *   2. Plan is always 'free_trial' — sellers cannot assign paid plans.
 *      Any plan value the client might send is silently ignored here.
 *   3. Email uniqueness is enforced by the repository
 *      (throws DoctorEmailConflictError → 409).
 *
 * SECURITY:
 *   - sellerId comes from the verified CurrentUserPayload.sub, not from the body.
 *   - NEVER log fullName, email, cedula, or phone (PII).
 */
@Injectable()
export class CreateSellerSpecialistUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(input: CreateSellerSpecialistInput): Promise<SellerSpecialistRow> {
    return this.sellerRepo.createSoldSpecialist({
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email.toLowerCase().trim(),
      specialty: input.specialty ?? null,
      cedula: input.cedula ?? null,
      phone: input.phone ?? null,
      plan: 'free_trial',
      soldBy: input.sellerId,
    });
  }
}
