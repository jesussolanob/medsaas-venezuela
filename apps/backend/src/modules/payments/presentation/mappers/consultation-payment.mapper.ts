import type { ConsultationPayment } from '../../domain/entities/consultation-payment.entity';

/**
 * Maps a ConsultationPayment domain entity to the API response shape.
 *
 * SECURITY: Never expose patient PII (full_name, phone, email, cedula) in this
 * response — only patient_id is returned. The caller must use the patients
 * /reveal endpoint to get masked or decrypted PII separately.
 *
 * Financial fields (amount, currency, payment_method, reference_number,
 * receipt_url, notes) are not PHI per CLAUDE.md policy and are returned in full.
 */
export function toPaymentResponse(payment: ConsultationPayment): Record<string, unknown> {
  return {
    id: payment.id,
    consultation_id: payment.consultationId,
    doctor_id: payment.doctorId,
    patient_id: payment.patientId,
    amount: payment.amount,
    currency: payment.currency,
    payment_method: payment.paymentMethod,
    reference_number: payment.referenceNumber,
    receipt_url: payment.receiptUrl,
    notes: payment.notes,
    status: payment.status,
    approved_at: payment.approvedAt?.toISOString() ?? null,
    approved_by: payment.approvedBy,
    created_at: payment.createdAt.toISOString(),
    updated_at: payment.updatedAt.toISOString(),
  };
}
