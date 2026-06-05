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
 * MIGRATED (Etapa 1):
 *   - Auth         → dev-auth stub (reemplaza createClient().auth.getUser())
 *   - Appointment  → GET /api/appointments/:id (NestJS backend, ownership enforced)
 *
 * FASE 5 placeholder (sin endpoint backend ni Supabase admin):
 *   - consultation, payment, payment_items, doctor, patient,
 *     rescheduleChain, changeLog → null/[] (secciones vacías en UI)
 *   El backend expondrá estos joins en Fase 5 vía GET /api/appointments/:id?expand=all
 *   o endpoints dedicados por recurso.
 */

// ── Backend appointment shape (camelCase) ─────────────────────────────────────

interface BackendAppointment {
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
  createdAt: string;
  updatedAt: string;
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

  // MIGRATED: appointment → GET /api/appointments/:id (ownership enforced by backend)
  const apptResult = await backendGet<BackendAppointment>(`/api/appointments/${appointmentId}`);

  if (!apptResult.ok) {
    const { status: httpStatus, code } = apptResult.error;
    log.error('[cita-360/[id]] backend error al cargar appointment', {
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
    notFound();
  }

  const backendAppt = apptResult.value as unknown as BackendAppointment;

  // Validate ownership for non-admin roles
  if (devUser.role !== 'super_admin' && backendAppt.doctorId !== devUser.id) {
    redirect('/doctor/agenda');
  }

  // Normalizar appointment al shape que consume Cita360Client
  // Cita360Client accede al objeto via `data.appointment.xxx` con snake_case en algunos
  // campos y camelCase en otros (el original usaba columnas Supabase snake_case).
  // Mapeamos camelCase→snake_case para compatibilidad con Cita360Client.tsx sin tocar JSX.
  const appt = {
    id: backendAppt.id,
    appointment_code: backendAppt.appointmentCode,
    status: backendAppt.status,
    scheduled_at: backendAppt.scheduledAt,
    appointment_mode: backendAppt.appointmentMode,
    duration_minutes: null, // FASE 5: no expuesto en backend Etapa 1
    chief_complaint: backendAppt.chiefComplaint,
    reschedule_of: null, // FASE 5
    created_at: backendAppt.createdAt,
    updated_at: backendAppt.updatedAt,
    service_id: null, // FASE 5
    service_snapshot: null, // FASE 5
    consultation_id: backendAppt.consultationId,
    payment_id: backendAppt.paymentId,
    doctor_id: backendAppt.doctorId,
    patient_id: backendAppt.patientId,
    // PII enmascarada en lista, completa en getById (dueño)
    patient_name: backendAppt.patientName,
    patient_email: backendAppt.patientEmail,
    patient_phone: backendAppt.patientPhone,
    patient_cedula: backendAppt.patientCedula,
    plan_name: backendAppt.planName,
    plan_price: backendAppt.planPrice,
    payment_method: backendAppt.paymentMethod,
    payment_receipt_url: backendAppt.paymentReceiptUrl,
    package_id: backendAppt.packageId,
    session_number: backendAppt.sessionNumber,
  };

  // ── FASE 5 placeholder — joins sin endpoint disponible en Etapa 1 ───────────
  // consultation, payment, doctor, patient, rescheduleChain y changeLog
  // se expondrán en el backend en Fase 5 (GET /api/appointments/:id?expand=all
  // o endpoints dedicados). Hasta entonces las secciones correspondientes del
  // Cita360Client renderizan "Sin datos" de forma elegante (null-safe).

  const data: Cita360Data = {
    appointment: appt as unknown as Cita360Data['appointment'],
    consultation: null,
    payment: null,
    paymentItems: [],
    doctor: null,
    patient: null,
    rescheduleChain: [],
    changeLog: [],
  };

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
