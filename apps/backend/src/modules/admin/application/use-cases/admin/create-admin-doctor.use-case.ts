import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type AdminCreatedDoctorResult,
} from '../../../domain/repositories/admin.repository';
import type { AdminAssignablePlan } from '../../dtos/admin.dtos';

export interface CreateAdminDoctorInput {
  fullName: string;
  email: string;
  specialty?: string | null;
  cedula?: string | null;
  phone?: string | null;
  /**
   * Subscription plan to assign.
   *
   * When omitted the repository falls back to the default onboarding plan
   * (free_trial, 30-day trial). The DTO layer ensures only valid plan keys
   * reach this use case.
   */
  plan?: AdminAssignablePlan;
}

/**
 * Creates a new doctor profile + subscription from the admin panel.
 *
 * Responsibilities:
 *   1. Generate a stable UUID for the new profile.
 *   2. Delegate the atomic write (profile + subscription) to IAdminRepository.
 *   3. Return the created doctor data as a plain output object.
 *
 * Domain invariants enforced by the repository:
 *   - Email uniqueness (throws DoctorEmailConflictError → 409).
 *   - Plan-to-status mapping:
 *       free_trial  → trialing,  30 days
 *       delta_free  → active,    99 years (permanent)
 *       delta_base  → active,    30 days
 *       delta_plus  → active,    30 days
 */
@Injectable()
export class CreateAdminDoctorUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: CreateAdminDoctorInput): Promise<AdminCreatedDoctorResult> {
    return this.adminRepo.createAdminDoctor({
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email.toLowerCase().trim(),
      specialty: input.specialty ?? null,
      cedula: input.cedula ?? null,
      phone: input.phone ?? null,
      plan: input.plan,
    });
  }
}
