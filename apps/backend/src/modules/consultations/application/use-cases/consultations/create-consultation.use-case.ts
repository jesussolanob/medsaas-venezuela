import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationCode } from '../../../domain/value-objects/consultation-code.vo';
import { ConsultationCodeExhaustedError } from '../../../domain/errors/consultation-code-exhausted.error';
import { ConsultationCodeConflictError } from '../../../domain/errors/consultation-code-conflict.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface CreateConsultationInput {
  doctorId: string;
  patientId: string;
  appointmentId?: string | null;
  consultationDate: Date;
  chiefComplaint?: string | null;
  notes?: string | null;
  /** Pre-populate the consultation amount from the appointment's plan price. */
  amount?: number | null;
}

/**
 * Creates a new consultation with a unique DLT-YYYYMM-XXXX code.
 *
 * Code generation strategy (race-condition safe):
 *   1. Count existing codes for this doctor+month to derive the starting sequence.
 *   2. Attempt to INSERT via repo.save(). If the DB UNIQUE constraint fires
 *      (two concurrent requests raced past the pre-check), the repo translates
 *      UniqueConstraintError → ConsultationCodeConflictError.
 *   3. On conflict, increment the sequence and retry — up to MAX_RETRIES times.
 *   4. If all attempts are exhausted, throw ConsultationCodeExhaustedError (422).
 *
 * The pre-check findByCode() is retained as a fast-path optimisation (avoids a
 * failed INSERT on the common non-concurrent path) but is NOT relied upon for
 * correctness. The DB UNIQUE constraint + retry loop is the real guard.
 */
@Injectable()
export class CreateConsultationUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: CreateConsultationInput): Promise<Consultation> {
    const date = input.consultationDate;
    const yearMonth = this.toYearMonth(date);

    // Sembrar desde el MÁXIMO código del mes + 1 (collision-free), no desde un
    // conteo: con huecos en la numeración, count+1 podía caer sobre un código
    // existente y, en rangos densos, agotar los reintentos → la consulta no se
    // creaba en silencio (bug de meses ya poblados, p.ej. citas de julio).
    const maxSequence = await this.repo.getMaxSequenceForMonth(yearMonth);
    let sequence = maxSequence + 1;

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const code = ConsultationCode.generate(date, sequence);

      // Fast-path pre-check (optimisation only — not a correctness guard).
      const existing = await this.repo.findByCode(code.value);
      if (existing) {
        sequence += 1;
        continue;
      }

      const consultation = Consultation.create({
        id: randomUUID(),
        doctorId: input.doctorId,
        patientId: input.patientId,
        appointmentId: input.appointmentId ?? null,
        consultationCode: code.value,
        consultationDate: date,
        chiefComplaint: input.chiefComplaint ?? null,
        diagnosis: null,
        treatment: null,
        notes: input.notes ?? null,
        paymentStatus: 'pending',
        paymentMethod: null,
        amount: input.amount ?? null,
        paymentDate: null,
        blocksSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      try {
        return await this.repo.save(consultation);
      } catch (err) {
        if (err instanceof ConsultationCodeConflictError) {
          // Concurrent insert won the race — try the next sequence number.
          sequence += 1;
          continue;
        }
        throw err;
      }
    }

    throw new ConsultationCodeExhaustedError(yearMonth);
  }

  private toYearMonth(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }
}
