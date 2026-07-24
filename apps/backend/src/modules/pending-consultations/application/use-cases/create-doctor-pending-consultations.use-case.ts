import { Inject, Injectable } from '@nestjs/common';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../packages/domain/repositories/pricing-plan.repository';
import { CreatePendingConsultationsUseCase } from './create-pending-consultations.use-case';
import { PatientNotOwnedError } from '../../domain/errors/patient-not-owned.error';
import { PlanNotOwnedError } from '../../domain/errors/plan-not-owned.error';

export interface CreateDoctorPendingConsultationsInput {
  doctorId: string;
  patientId: string;
  planId: string;
  sessionNumbers: number[];
  paymentId?: string | null;
  officeId?: string | null;
  appointmentMode?: string | null;
}

/**
 * CreateDoctorPendingConsultationsUseCase
 *
 * Doctor-initiated bulk creation of pending consultations for deferred sessions
 * in a multi-session plan purchase.
 *
 * Ownership guards (anti-IDOR):
 *   - patient must belong to the authenticated doctor.
 *   - pricing_plan must belong to the authenticated doctor.
 *
 * expiresAt is resolved authoritatively from pricing_plan.validity_days.
 * The client must never supply it directly.
 */
@Injectable()
export class CreateDoctorPendingConsultationsUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
    private readonly createPendingUC: CreatePendingConsultationsUseCase,
  ) {}

  async execute(input: CreateDoctorPendingConsultationsInput): Promise<PendingConsultation[]> {
    // Anti-IDOR: patient must belong to the authenticated doctor.
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotOwnedError(input.patientId);
    }

    // Anti-IDOR: pricing plan must belong to the authenticated doctor.
    const plan = await this.pricingPlanRepo.findById(input.planId);
    if (!plan || plan.doctorId !== input.doctorId) {
      throw new PlanNotOwnedError(input.planId);
    }

    // Resolve expiresAt authoritatively from the plan — never trust the client.
    // Immutable calculation: no Date mutation.
    const expiresAt = plan.validityDays
      ? new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000)
      : null;

    return this.createPendingUC.execute({
      doctorId: input.doctorId,
      patientId: input.patientId,
      paymentId: input.paymentId ?? null,
      planName: plan.name,
      officeId: input.officeId ?? null,
      appointmentMode: input.appointmentMode ?? null,
      sessionNumbers: input.sessionNumbers,
      expiresAt,
    });
  }
}
