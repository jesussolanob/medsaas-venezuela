import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';
import { ConsultationPaymentNotFoundError } from '../../../domain/errors/consultation-payment-not-found.error';
import {
  IConsultationPaymentRepository,
  CONSULTATION_PAYMENT_REPOSITORY,
} from '../../../domain/repositories/consultation-payment.repository';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../../consultations/domain/repositories/consultation.repository';

export interface RegisterConsultationPaymentInput {
  doctorId: string;
  consultationId: string;
  patientId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
}

/**
 * Registers a new payment for a consultation.
 *
 * Business rules:
 *   1. Verifies the consultation belongs to the authenticated doctor (anti-IDOR).
 *   2. Creates the payment with status 'pending'.
 *   3. In a single operation, creates the payment and updates the consultation's
 *      payment_status to 'pending' and amount to the payment amount.
 *
 * The consultation payment_status sync is done via the consultation repository's
 * updatePayment method inside a transaction provided by the Sequelize implementation.
 * Both repos receive the same Sequelize instance (global DI) so the transaction
 * wrapping is done at the infrastructure layer.
 *
 * SECURITY: doctorId is always from the authenticated user token — never from input.
 */
@Injectable()
export class RegisterConsultationPaymentUseCase {
  constructor(
    @Inject(CONSULTATION_PAYMENT_REPOSITORY)
    private readonly paymentRepo: IConsultationPaymentRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
  ) {}

  async execute(input: RegisterConsultationPaymentInput): Promise<ConsultationPayment> {
    // 1. Verify consultation ownership (anti-IDOR)
    const consultation = await this.consultationRepo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      // Return the same not-found error to avoid revealing that the consultation
      // exists under a different doctor (resource-existence enumeration).
      throw new ConsultationPaymentNotFoundError();
    }

    // 2. Build the domain entity
    const now = new Date();
    const payment = ConsultationPayment.create({
      id: randomUUID(),
      consultationId: input.consultationId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      amount: input.amount,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      receiptUrl: input.receiptUrl ?? null,
      notes: input.notes ?? null,
      status: 'pending',
      approvedAt: null,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Persist the payment and sync consultation payment_status in a transaction.
    //    The SequelizeConsultationPaymentRepository wraps both operations.
    return this.paymentRepo.create(payment);
  }
}
