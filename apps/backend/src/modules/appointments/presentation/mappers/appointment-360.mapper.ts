import type { Appointment360Result } from '../../application/use-cases/appointments/get-appointment-360.use-case';
import type { Appointment } from '../../domain/entities/appointment.entity';
import type { Consultation } from '../../../consultations/domain/entities/consultation.entity';
import type { Payment } from '../../../finances/domain/entities/payment.entity';
import type { PaymentItem } from '../../../finances/domain/entities/payment-item.entity';
import type { ChangeLogEntry } from '../../domain/repositories/appointment.repository';

/**
 * Maps the Appointment360Result aggregate to the API response shape.
 *
 * SECURITY:
 *   - Patient PII is returned decrypted — this mapper is ONLY called for the
 *     owner-scoped detail endpoint (ADR-005). NEVER reuse it in list responses.
 *   - Doctor payment_details and payment_methods are excluded (sensitive config).
 *   - All date fields are serialized as ISO-8601 strings.
 */
export function mapAppointment360Response(result: Appointment360Result): Record<string, unknown> {
  return {
    appointment: mapAppointment(result.appointment),
    consultation: result.consultation ? mapConsultation(result.consultation) : null,
    payment: result.payment ? mapPayment(result.payment) : null,
    paymentItems: result.paymentItems.map(mapPaymentItem),
    patient: result.patient,
    doctor: result.doctor,
    rescheduleChain: result.rescheduleChain.map(mapAppointment),
    changeLog: result.changeLog.map(mapChangeLog),
  };
}

function mapAppointment(a: Appointment): Record<string, unknown> {
  return {
    id: a.id,
    doctor_id: a.doctorId,
    patient_id: a.patientId,
    consultation_id: a.consultationId,
    payment_id: a.paymentId,
    patient_name: a.patientName,
    patient_phone: a.patientPhone,
    patient_email: a.patientEmail,
    patient_cedula: a.patientCedula,
    scheduled_at: a.scheduledAt.toISOString(),
    status: a.status,
    appointment_mode: a.appointmentMode,
    source: a.source,
    plan_name: a.planName,
    plan_price: a.planPrice,
    payment_method: a.paymentMethod,
    payment_reference: a.paymentReference,
    payment_receipt_url: a.paymentReceiptUrl,
    insurance_name: a.insuranceName,
    bcv_rate: a.bcvRate,
    amount_bs: a.amountBs,
    package_id: a.packageId,
    session_number: a.sessionNumber,
    chief_complaint: a.chiefComplaint,
    appointment_code: a.appointmentCode,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

function mapConsultation(c: Consultation): Record<string, unknown> {
  return {
    id: c.id,
    doctor_id: c.doctorId,
    patient_id: c.patientId,
    appointment_id: c.appointmentId,
    consultation_code: c.consultationCode,
    consultation_date: c.consultationDate.toISOString(),
    chief_complaint: c.chiefComplaint,
    diagnosis: c.diagnosis,
    treatment: c.treatment,
    notes: c.notes,
    payment_status: c.paymentStatus,
    payment_method: c.paymentMethod,
    amount: c.amount !== null ? Number(c.amount) : null,
    payment_date: c.paymentDate?.toISOString() ?? null,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

function mapPayment(p: Payment): Record<string, unknown> {
  return {
    id: p.id,
    doctor_id: p.doctorId,
    patient_id: p.patientId,
    amount_usd: Number(p.amountUsd),
    amount_bs: p.amountBs !== null ? Number(p.amountBs) : null,
    bcv_rate: p.bcvRate !== null ? Number(p.bcvRate) : null,
    currency: p.currency,
    method_snapshot: p.methodSnapshot,
    payment_reference: p.paymentReference,
    payment_receipt_url: p.paymentReceiptUrl,
    payment_code: p.paymentCode,
    status: p.status,
    paid_at: p.paidAt?.toISOString() ?? null,
    package_id: p.packageId,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

function mapPaymentItem(item: PaymentItem): Record<string, unknown> {
  return {
    id: item.id,
    payment_id: item.paymentId,
    doctor_id: item.doctorId,
    name: item.name,
    amount_usd: Number(item.amountUsd),
    source_type: item.sourceType,
    source_id: item.sourceId,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}

function mapChangeLog(entry: ChangeLogEntry): Record<string, unknown> {
  return {
    id: entry.id,
    appointment_id: entry.appointmentId,
    actor_id: entry.actorId,
    old_status: entry.oldStatus,
    new_status: entry.newStatus,
    created_at: entry.createdAt.toISOString(),
  };
}
