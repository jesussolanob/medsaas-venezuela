import type { Consultation } from '../../domain/entities/consultation.entity';

/**
 * Maps a Consultation domain entity to the API response shape.
 *
 * Clinical fields (chief_complaint, diagnosis, treatment, notes) are returned
 * in plaintext — the authenticated doctor is the owner and author of these records.
 *
 * SECURITY: never expose consultations from another doctor. Ownership is enforced
 * upstream in the use case and repository layers.
 */
export function toConsultationResponse(consultation: Consultation): Record<string, unknown> {
  return {
    id: consultation.id,
    doctor_id: consultation.doctorId,
    patient_id: consultation.patientId,
    appointment_id: consultation.appointmentId,
    consultation_code: consultation.consultationCode,
    consultation_date: consultation.consultationDate.toISOString(),
    chief_complaint: consultation.chiefComplaint,
    diagnosis: consultation.diagnosis,
    treatment: consultation.treatment,
    notes: consultation.notes,
    payment_status: consultation.paymentStatus,
    payment_method: consultation.paymentMethod,
    amount: consultation.amount !== null ? Number(consultation.amount) : null,
    payment_date: consultation.paymentDate?.toISOString() ?? null,
    payment_reference: consultation.paymentReference,
    payment_receipt_url: consultation.paymentReceiptUrl,
    blocks_snapshot: consultation.blocksSnapshot ?? null,
    created_at: consultation.createdAt.toISOString(),
    updated_at: consultation.updatedAt.toISOString(),
    /** Enriched read-side fields — null when not populated by a JOIN query. */
    patient_name: consultation.patientName,
    appointment_status: consultation.appointmentStatus,
  };
}

/**
 * Maps a Consultation to the list item shape for paginated list endpoints.
 *
 * SECURITY NOTE: This deliberately returns PHI fields (chief_complaint, diagnosis,
 * treatment, notes) in the list response. This is safe because:
 *   1. Every repository query that feeds these endpoints filters by doctorId in the
 *      WHERE clause — a doctor can only see their own consultations.
 *   2. The controller extracts doctorId from user.sub (the authenticated token),
 *      never from the request body (anti-IDOR).
 *
 * If this endpoint is ever opened to admin roles or third-party consumers, a
 * separate mapper with field masking must be created. Do not reuse this function.
 */
export function toConsultationListItem(consultation: Consultation): Record<string, unknown> {
  return toConsultationResponse(consultation);
}
