import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';

export interface CreatePendingConsultationsInput {
  doctorId: string;
  patientId: string;
  authUserId?: string | null;
  packageId?: string | null;
  paymentId?: string | null;
  planName: string;
  officeId?: string | null;
  appointmentMode?: string | null;
  /** Session numbers to create pending consultations for (e.g. [2, 3, 4] for sessions 2-4 of a 4-session package). */
  sessionNumbers: number[];
  expiresAt?: Date | null;
  transaction?: Transaction;
}

/**
 * CreatePendingConsultationsUseCase
 *
 * Bulk-creates pending consultation rows for all unscheduled sessions when a
 * patient purchases a multi-session service. Typically called by the booking
 * flow (A1b phase) after the first session is scheduled.
 *
 * Each item gets a fresh UUID. The operation is transactional — all rows are
 * created atomically within the provided Sequelize transaction (if any).
 */
@Injectable()
export class CreatePendingConsultationsUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly repo: IPendingConsultationRepository,
  ) {}

  async execute(input: CreatePendingConsultationsInput): Promise<PendingConsultation[]> {
    if (input.sessionNumbers.length === 0) return [];

    const items = input.sessionNumbers.map((sessionNumber) => ({
      doctorId: input.doctorId,
      patientId: input.patientId,
      authUserId: input.authUserId ?? null,
      packageId: input.packageId ?? null,
      paymentId: input.paymentId ?? null,
      planName: input.planName,
      officeId: input.officeId ?? null,
      appointmentMode: input.appointmentMode ?? null,
      sessionNumber,
      expiresAt: input.expiresAt ?? null,
    }));

    return this.repo.bulkCreate(items, input.transaction);
  }
}
