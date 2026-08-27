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
    /**
     * Stable base price of the consultation (set once on first approval).
     * total = base_amount + Σ(extra_items[].amount_usd)
     * Null until the consultation has been approved at least once.
     */
    base_amount: consultation.baseAmount !== null ? Number(consultation.baseAmount) : null,
    payment_date: consultation.paymentDate?.toISOString() ?? null,
    payment_reference: consultation.paymentReference,
    payment_receipt_url: consultation.paymentReceiptUrl,
    blocks_snapshot: consultation.blocksSnapshot ?? null,
    blocks_structure: consultation.blocksStructure ?? null,
    created_at: consultation.createdAt.toISOString(),
    updated_at: consultation.updatedAt.toISOString(),
    /** Enriched read-side fields — null when not populated by a JOIN query. */
    patient_name: consultation.patientName,
    appointment_status: consultation.appointmentStatus,
    /**
     * Combo de varias sesiones: "consulta 2 de 3". Null cuando la consulta es suelta.
     */
    session_number: consultation.sessionNumber,
    package_total_sessions: consultation.packageTotalSessions,
    /**
     * Extra service items. Populated by GET /consultations/:id (for modal pre-load).
     * Empty array in list endpoints (not loaded for performance — N+1 avoidance).
     */
    extra_items: consultation.extraItems.map((ei) => ({
      id: ei.id,
      description: ei.description,
      amount_usd: ei.amountUsd,
    })),
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
