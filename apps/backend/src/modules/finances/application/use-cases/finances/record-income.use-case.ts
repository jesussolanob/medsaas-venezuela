import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  FINANCE_REPOSITORY,
  type IFinanceRepository,
} from '../../../domain/repositories/finance.repository';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money, type Currency } from '../../../domain/value-objects/money.vo';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import { PatientNotOwnedError } from '../../../domain/errors/patient-not-owned.error';
import { RelatedResourceNotFoundError } from '../../../domain/errors/related-resource-not-found.error';

export interface RecordIncomeInput {
  doctorId: string;
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId?: string | null;
  date?: Date;
  /** Optional link to an income_concept. Validated for ownership if present. */
  conceptId?: string | null;
  /**
   * Optional patient link.
   * - When relatedConsultationId is present: this value is IGNORED; patientId is
   *   derived from the consultation (anti-IDOR).
   * - When no consultationId: if provided, must belong to the same doctor.
   * - Null / undefined: income is generic (no patient link).
   */
  patientId?: string | null;
}

export interface RecordIncomeOutput {
  id: string;
  doctorId: string;
  type: 'income';
  amount: number;
  currency: Currency;
  description: string;
  relatedConsultationId: string | null;
  conceptId: string | null;
  patientId: string | null;
  date: Date;
  createdAt: Date;
}

/**
 * Records a manual income entry for a doctor.
 *
 * Patient-link rules:
 *   1. relatedConsultationId present → patientId derived from that consultation
 *      (validates doctor ownership of the consultation; ignores body patientId).
 *   2. No consultation + patientId provided → validate patient belongs to doctor.
 *   3. No consultation + no patientId → patientId = null (generic income).
 *
 * Validation: amount > 0 is enforced by the Money value object constructor
 * (throws InvalidAmountError on violation).
 * If conceptId is provided, it must exist and belong to the same doctor.
 */
@Injectable()
export class RecordIncomeUseCase {
  constructor(
    @Inject(FINANCE_REPOSITORY)
    private readonly financeRepo: IFinanceRepository,
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly conceptRepo: IIncomeConceptRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: RecordIncomeInput): Promise<RecordIncomeOutput> {
    if (input.amount <= 0) {
      throw new InvalidAmountError(input.amount);
    }
    const money = new Money(input.amount, input.currency);

    // Validate concept ownership when provided.
    let resolvedConceptId: string | null = null;
    if (input.conceptId) {
      const concept = await this.conceptRepo.findById(input.conceptId);
      if (!concept) throw new IncomeConceptNotFoundError();
      if (!concept.isOwnedBy(input.doctorId))
        throw new ForbiddenDomainError('Income concept does not belong to this doctor');
      resolvedConceptId = concept.id;
    }

    // Resolve patientId according to business rules.
    const resolvedPatientId = await this.resolvePatientId(
      input.doctorId,
      input.relatedConsultationId ?? null,
      input.patientId ?? null,
    );

    const transaction = FinancialTransaction.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      type: 'income',
      amount: money,
      description: input.description,
      relatedConsultationId: input.relatedConsultationId ?? null,
      date: input.date ?? new Date(),
      createdAt: new Date(),
      conceptId: resolvedConceptId,
      patientId: resolvedPatientId,
    });

    const saved = await this.financeRepo.save(transaction);
    return this.toOutput(saved);
  }

  /**
   * Derives the patient ID following the business rules:
   *   1. Consultation present → consult repo (owner-scoped), take its patientId.
   *   2. No consultation + patientId provided → validate ownership.
   *   3. Otherwise → null.
   */
  private async resolvePatientId(
    doctorId: string,
    relatedConsultationId: string | null,
    patientId: string | null,
  ): Promise<string | null> {
    if (relatedConsultationId) {
      // Rule 1: derive from consultation (anti-IDOR: findById is scoped to doctorId).
      const consultation = await this.consultationRepo.findById(relatedConsultationId, doctorId);
      if (!consultation) {
        // Consultation not found or belongs to another doctor.
        // Throw rather than silently persist a dangling FK to a consultation that
        // may belong to a different doctor (anti-IDOR + data-integrity guard).
        throw new RelatedResourceNotFoundError();
      }
      return consultation.patientId;
    }

    if (patientId) {
      // Rule 2: validate the supplied patient belongs to this doctor.
      const patient = await this.patientRepo.findById(patientId, doctorId);
      if (!patient) throw new PatientNotOwnedError();
      return patient.id;
    }

    // Rule 3: no patient link.
    return null;
  }

  private toOutput(tx: FinancialTransaction): RecordIncomeOutput {
    return {
      id: tx.id,
      doctorId: tx.doctorId,
      type: 'income',
      amount: tx.amount.amount,
      currency: tx.amount.currency,
      description: tx.description,
      relatedConsultationId: tx.relatedConsultationId,
      conceptId: tx.conceptId,
      patientId: tx.patientId,
      date: tx.date,
      createdAt: tx.createdAt,
    };
  }
}
