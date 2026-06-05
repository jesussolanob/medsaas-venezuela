import 'server-only';

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { backendGet } from '@/lib/api-client.server';
import { getDevUser } from '@/lib/dev-auth';
import { log } from '@/lib/logger';
import Cita360Client, { type Cita360Data } from './Cita360Client';

export const dynamic = 'force-dynamic';

/**
 * /doctor/cita-360/[id]
 * Panel de auditoría 360° de una cita: 4 pasos (cita, consulta, pago, resumen).
 * El [id] es appointment_id (uuid).
 *
 * MIGRATED (Etapa 1 — Fase 5):
 *   - Auth         → dev-auth stub
 *   - Data source  → GET /api/appointments/:id/detail (NestJS backend, owner-scoped anti-IDOR)
 *     Expone: appointment, consultation|null, payment|null, paymentItems[],
 *             patient (descifrado, owner-scoped), doctor, rescheduleChain[], changeLog[]
 *
 * Fallback: si el endpoint /detail falla, los campos extra quedan null/[] y las secciones
 * correspondientes de Cita360Client renderizan "Sin datos" de forma elegante.
 */

// ── Backend shapes (camelCase desde NestJS) ──────────────────────────────────

interface BackendAppointmentBase {
  id: string;
  doctorId: string;
  patientId: string | null;
  consultationId: string | null;
  paymentId: string | null;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientCedula: string | null;
  scheduledAt: string;
  status: string;
  appointmentMode: string | null;
  chiefComplaint: string | null;
  appointmentCode: string | null;
  planName: string | null;
  planPrice: number | null;
  paymentMethod: string | null;
  paymentReceiptUrl: string | null;
  packageId: string | null;
  sessionNumber: number | null;
  rescheduleOf: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackendConsultation {
  id: string;
  consultationCode: string | null;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  consultationDate: string | null;
  planName: string | null;
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  blocksSnapshot: Array<{ key: string; label: string }> | null;
  blocksData: Record<string, unknown> | null;
}

interface BackendPayment {
  id: string;
  paymentCode: string | null;
  status: string | null;
  amountUsd: number | string | null;
  amountBs: number | string | null;
  bcvRate: number | string | null;
  methodSnapshot: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  currency: string | null;
  paymentReceiptUrl: string | null;
  packageId: string | null;
}

interface BackendPaymentItem {
  id: string;
  name: string;
  amountUsd: number | string;
  sourceType: string | null;
  createdAt: string;
}

interface BackendPatient {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  cedula: string | null;
}

interface BackendDoctor {
  id: string;
  fullName: string;
  specialty: string | null;
  officeAddress: string | null;
}

interface BackendRescheduleEntry {
  id: string;
  appointmentCode: string | null;
  status: string;
  scheduledAt: string;
  rescheduleOf: string | null;
  createdAt: string;
}

interface BackendChangeLogEntry {
  id: string;
  actorId: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  createdAt: string;
}

interface BackendAppointmentDetail {
  appointment: BackendAppointmentBase;
  consultation: BackendConsultation | null;
  payment: BackendPayment | null;
  paymentItems: BackendPaymentItem[];
  patient: BackendPatient | null;
  doctor: BackendDoctor | null;
  rescheduleChain: BackendRescheduleEntry[];
  changeLog: BackendChangeLogEntry[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Cita360Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16: params es async
  const { id: appointmentId } = await params;

  // MIGRATED: auth → dev-auth stub
  const devUser = await getDevUser();
  if (!devUser.id) redirect('/login');

  // Primary call: GET /api/appointments/:id/detail (owner-scoped, anti-IDOR 404)
  const detailResult = await backendGet<BackendAppointmentDetail>(
    `/api/appointments/${appointmentId}/detail`,
  );

  // If the detail endpoint returns 404 or 403 → honor it.
  // If any other error → fall back to the basic appointment endpoint so the
  // page still renders with partial data (no crash on section-level nulls).
  if (!detailResult.ok) {
    const { status: httpStatus, code } = detailResult.error;
    log.error('[cita-360/[id]] backend error al cargar appointment detail', {
      appointmentId,
      code,
      httpStatus,
    });

    if (httpStatus === 404 || code === 'APPOINTMENT_NOT_FOUND') {
      notFound();
    }
    if (httpStatus === 403 || code === 'UNAUTHORIZED') {
      redirect('/doctor/agenda');
    }

    // Fallback: try basic appointment endpoint for ownership check + partial render
    const apptResult = await backendGet<BackendAppointmentBase>(
      `/api/appointments/${appointmentId}`,
    );

    if (!apptResult.ok) {
      const fallbackErr = apptResult.error;
      log.error('[cita-360/[id]] fallback basic endpoint also failed', {
        appointmentId,
        code: fallbackErr.code,
        httpStatus: fallbackErr.status,
      });
      if (fallbackErr.status === 404 || fallbackErr.code === 'APPOINTMENT_NOT_FOUND') {
        notFound();
      }
      if (fallbackErr.status === 403 || fallbackErr.code === 'UNAUTHORIZED') {
        redirect('/doctor/agenda');
      }
      notFound();
    }

    const basicAppt = apptResult.value as unknown as BackendAppointmentBase;

    if (devUser.role !== 'super_admin' && basicAppt.doctorId !== devUser.id) {
      redirect('/doctor/agenda');
    }

    const data: Cita360Data = {
      appointment: mapAppointment(basicAppt),
      consultation: null,
      payment: null,
      paymentItems: [],
      doctor: null,
      patient: null,
      rescheduleChain: [],
      changeLog: [],
    };

    return renderPage(data);
  }

  const detail = detailResult.value as unknown as BackendAppointmentDetail;

  // Ownership guard (belt-and-suspenders; backend already enforces anti-IDOR)
  if (devUser.role !== 'super_admin' && detail.appointment.doctorId !== devUser.id) {
    redirect('/doctor/agenda');
  }

  // ── Map backend camelCase → snake_case shapes expected by Cita360Client ──

  const data: Cita360Data = {
    appointment: mapAppointment(detail.appointment),
    consultation: detail.consultation ? mapConsultation(detail.consultation) : null,
    payment: detail.payment ? mapPayment(detail.payment) : null,
    paymentItems: (detail.paymentItems ?? []).map(mapPaymentItem),
    // patient: Cita360Client expects { full_name, email, phone, cedula, birth_date }
    patient: detail.patient
      ? {
          full_name: detail.patient.fullName,
          email: detail.patient.email ?? null,
          phone: detail.patient.phone ?? null,
          cedula: detail.patient.cedula ?? null,
          birth_date: null, // not exposed by this endpoint
        }
      : null,
    // doctor: Cita360Client expects { full_name, specialty, professional_title, email }
    doctor: detail.doctor
      ? {
          full_name: detail.doctor.fullName,
          specialty: detail.doctor.specialty ?? null,
          professional_title: null, // not exposed by this endpoint
          email: '', // not exposed by this endpoint
        }
      : null,
    rescheduleChain: (detail.rescheduleChain ?? []).map(mapRescheduleEntry),
    // changeLog: Cita360Client expects { actor_role, action, field_changed, old_value, new_value, created_at }
    // Backend sends:            { id, actorId, oldStatus, newStatus, created_at }
    changeLog: (detail.changeLog ?? []).map(mapChangeLogEntry),
  };

  return renderPage(data);
}

// ── Render helper (avoids JSX duplication in both code paths) ─────────────────

function renderPage(data: Cita360Data) {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Link
        href="/doctor/agenda"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600"
      >
        ← Volver a Agenda
      </Link>
      <Cita360Client data={data} />
    </div>
  );
}

// ── Field mappers (camelCase backend → snake_case for Cita360Client) ──────────

function mapAppointment(a: BackendAppointmentBase): Cita360Data['appointment'] {
  return {
    id: a.id,
    appointment_code: a.appointmentCode,
    status: a.status,
    scheduled_at: a.scheduledAt,
    appointment_mode: a.appointmentMode,
    duration_minutes: null,
    chief_complaint: a.chiefComplaint,
    reschedule_of: a.rescheduleOf ?? null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    service_id: null,
    service_snapshot: null,
    consultation_id: a.consultationId,
    payment_id: a.paymentId,
    doctor_id: a.doctorId,
    patient_id: a.patientId,
    patient_name: a.patientName,
    patient_email: a.patientEmail,
    patient_phone: a.patientPhone,
    patient_cedula: a.patientCedula,
    plan_name: a.planName,
    plan_price: a.planPrice,
    payment_method: a.paymentMethod,
    payment_receipt_url: a.paymentReceiptUrl,
    package_id: a.packageId,
    session_number: a.sessionNumber,
  };
}

function mapConsultation(c: BackendConsultation): NonNullable<Cita360Data['consultation']> {
  return {
    id: c.id,
    consultation_code: c.consultationCode,
    status: c.status,
    started_at: c.startedAt,
    ended_at: c.endedAt,
    consultation_date: c.consultationDate,
    plan_name: c.planName,
    chief_complaint: c.chiefComplaint,
    diagnosis: c.diagnosis,
    treatment: c.treatment,
    blocks_snapshot: c.blocksSnapshot ?? null,
    blocks_data: c.blocksData ?? null,
  };
}

function mapPayment(p: BackendPayment): NonNullable<Cita360Data['payment']> {
  return {
    id: p.id,
    payment_code: p.paymentCode,
    status: p.status,
    amount_usd: p.amountUsd,
    amount_bs: p.amountBs,
    bcv_rate: p.bcvRate,
    method_snapshot: p.methodSnapshot,
    payment_reference: p.paymentReference,
    paid_at: p.paidAt,
    currency: p.currency,
    payment_receipt_url: p.paymentReceiptUrl,
    package_id: p.packageId,
  };
}

function mapPaymentItem(it: BackendPaymentItem): Cita360Data['paymentItems'][number] {
  return {
    id: it.id,
    name: it.name,
    amount_usd: it.amountUsd,
    source_type: it.sourceType,
    created_at: it.createdAt,
  };
}

function mapRescheduleEntry(
  r: BackendRescheduleEntry,
): Cita360Data['rescheduleChain'][number] {
  return {
    id: r.id,
    appointment_code: r.appointmentCode ?? '',
    status: r.status,
    scheduled_at: r.scheduledAt,
    reschedule_of: r.rescheduleOf ?? null,
    created_at: r.createdAt,
  };
}

/**
 * Backend changeLog shape: { id, actorId, oldStatus, newStatus, created_at }
 * Cita360Client expects:   { actor_role, action, field_changed, old_value, new_value, created_at }
 *
 * Mapping strategy:
 *   actor_role   → actorId (the actor id; role not exposed by this endpoint)
 *   action       → "Cambio de estado"
 *   field_changed → "status"
 *   old_value    → oldStatus
 *   new_value    → newStatus
 *   created_at   → created_at
 */
function mapChangeLogEntry(
  c: BackendChangeLogEntry,
): Cita360Data['changeLog'][number] {
  return {
    actor_role: c.actorId ?? 'sistema',
    action: 'Cambio de estado',
    field_changed: 'status',
    old_value: c.oldStatus ?? null,
    new_value: c.newStatus ?? null,
    created_at: c.createdAt,
  };
}
