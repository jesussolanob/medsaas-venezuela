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
     * Servicio contratado por el paciente (appointments.plan_name).
     * La UI lo muestra SIEMPRE, tenga monto o no: un consultorio puede tener
     * varios planes y por el importe solo no se distingue cuál se contrató.
     */
    plan_name: consultation.planName,
    /**
     * Combo de varias sesiones: "consulta 2 de 3". Null cuando la consulta es suelta.
     */
    session_number: consultation.sessionNumber,
    package_total_sessions: consultation.packageTotalSessions,
    // Importe del paquete completo, idéntico en las N sesiones. La UI lo muestra
    // en "Total cobrado" de cada consulta del paquete, aclarando que se cobró una
    // sola vez. NO se usa para sumar ingresos — eso sigue saliendo de `amount`.
    package_charge_usd: consultation.packageChargeUsd,
    /**
     * Extra service items. Populated by GET /consultations/:id (for modal pre-load).
     * Empty array in list endpoints (not loaded for performance — N+1 avoidance).
     */
    extra_items: consultation.extraItems.map((ei) => ({
      id: ei.id,
      description: ei.description,
      amount_usd: ei.amountUsd,
      // These three fields allow the frontend to re-hydrate the product selector
      // when the doctor reopens a consultation that already has approved product lines.
      // Without them, the UI loses product_id and re-approves with no stock decrement.
      product_id: ei.productId ?? null,
      quantity: ei.quantity ?? 1,
      unit_price_usd: ei.unitPriceUsd ?? null,
    })),
    /**
     * Cobertura del pago del paquete — solo no es null para sesiones 2..N.
     * El frontend usa este objeto para pintar:
     *   "Cubierta por: Paquete 4 consultas — $120, pagado el 03/09 · ref. 0012 · Esta consulta no genera cobro."
     * Null para consultas sueltas o la primera sesión del paquete (que es la pagadora).
     * Solo se rellena en GET /consultations/:id (findById); en list endpoints viene null.
     */
    covered_by: consultation.coveredBy
      ? {
          payment_id: consultation.coveredBy.paymentId,
          plan_name: consultation.coveredBy.planName,
          session_number: consultation.coveredBy.sessionNumber,
          total_sessions: consultation.coveredBy.totalSessions,
          amount_usd: consultation.coveredBy.amountUsd,
          amount_bs: consultation.coveredBy.amountBs,
          paid_at: consultation.coveredBy.paidAt?.toISOString() ?? null,
          method: consultation.coveredBy.method,
          reference: consultation.coveredBy.reference,
        }
      : null,
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
