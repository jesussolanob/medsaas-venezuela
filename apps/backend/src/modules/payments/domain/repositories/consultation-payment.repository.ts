import type { ConsultationPayment, PaymentStatus } from '../entities/consultation-payment.entity';

export const CONSULTATION_PAYMENT_REPOSITORY = 'CONSULTATION_PAYMENT_REPOSITORY';

export interface ConsultationPaymentListFilters {
  doctorId: string;
  consultationId?: string;
  status?: PaymentStatus;
  limit: number;
  offset: number;
}

export interface ConsultationPaymentListResult {
  items: ConsultationPayment[];
  total: number;
}

/**
 * Contract for consultation payment persistence.
 *
 * The application layer depends only on this interface — never on the Sequelize
 * implementation — to keep the domain layer infrastructure-free.
 *
 * All methods scoped to (doctorId) enforce anti-IDOR at the repository boundary.
 */
export interface IConsultationPaymentRepository {
  /**
   * Paginated list filtered by doctorId. Optionally filter by consultationId and status.
   * Results are ordered by created_at DESC.
   */
  list(filters: ConsultationPaymentListFilters): Promise<ConsultationPaymentListResult>;

  /**
   * Find a payment by ID scoped to doctorId.
   * Returns null for foreign or missing IDs (anti-IDOR).
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<ConsultationPayment | null>;

  /**
   * Persist a new payment.
   * Returns the saved entity.
   */
  create(payment: ConsultationPayment): Promise<ConsultationPayment>;

  /**
   * Persist an updated payment (status transitions).
   * Returns the updated entity.
   */
  save(payment: ConsultationPayment): Promise<ConsultationPayment>;
}
