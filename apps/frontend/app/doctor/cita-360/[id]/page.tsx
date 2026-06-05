import 'server-only';

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
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
 * DEFERRED (FASE 5 — sin endpoint backend en Etapa 1, permanece en Supabase admin):
 *   - consultation  → admin.from('consultations').select(...)
 *   - payment       → admin.from('payments').select(...)
 *   - payment_items → admin.from('payment_items').select(...)
 *   - doctor profile → admin.from('profiles').select(...)
 *   - patient       → admin.from('patients').select(...)
 *   - rescheduleChain → admin.from('appointments').select(...).eq('consultation_id',...)
 *   - changeLog     → admin.from('appointment_changes_log').select(...)
 *
 * Pendiente IA/storage: sin cambios en este archivo.
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

  // ── FASE 5 — Supabase admin: datos que el backend no expone en Etapa 1 ───────

  const admin = createAdminClient();

  // Doctor info (puede ser distinto del logueado si es admin)
  const { data: doctor } = await admin
    .from('profiles')
    .select('full_name, specialty, professional_title, email')
    .eq('id', backendAppt.doctorId)
    .single();

  // Paciente (datos completos, admin bypasses RLS)
  const { data: patient } = backendAppt.patientId
    ? await admin
        .from('patients')
        .select('full_name, email, phone, cedula, birth_date')
        .eq('id', backendAppt.patientId)
        .single()
    : { data: null };

  // Consulta linkeada
  const { data: consultation } = backendAppt.consultationId
    ? await admin
        .from('consultations')
        .select(`
          id, consultation_code, status, consultation_date, chief_complaint,
          diagnosis, treatment, blocks_data, blocks_snapshot,
          started_at, ended_at, payment_status, plan_name, amount,
          created_at, updated_at
        `)
        .eq('id', backendAppt.consultationId)
        .single()
    : { data: null };

  // Pago linkeado
  const { data: payment } = backendAppt.paymentId
    ? await admin
        .from('payments')
        .select(`
          id, payment_code, amount_usd, amount_bs, bcv_rate, currency,
          method_snapshot, payment_reference, payment_receipt_url,
          status, paid_at, package_id, created_at, updated_at
        `)
        .eq('id', backendAppt.paymentId)
        .single()
    : { data: null };

  // Items extra del cobro (paquetes/servicios agregados)
  const { data: paymentItems } = backendAppt.paymentId
    ? await admin
        .from('payment_items')
        .select('id, name, amount_usd, source_type, created_at')
        .eq('payment_id', backendAppt.paymentId)
        .order('created_at', { ascending: true })
    : { data: [] };

  // Cadena de reagendamientos: todas las appointments con la misma consultation_id
  const { data: rescheduleChain } = backendAppt.consultationId
    ? await admin
        .from('appointments')
        .select('id, appointment_code, status, scheduled_at, reschedule_of, created_at')
        .eq('consultation_id', backendAppt.consultationId)
        .order('created_at', { ascending: true })
    : { data: [] };

  // Audit log de cambios
  let changeLog: unknown[] = [];
  try {
    const { data: logs } = await admin
      .from('appointment_changes_log')
      .select(
        'id, actor_id, actor_role, action, field_changed, old_value, new_value, reason, created_at',
      )
      .eq('appointment_id', backendAppt.id)
      .order('created_at', { ascending: false })
      .limit(20);
    changeLog = logs ?? [];
  } catch {
    // tabla puede no existir en dev
  }

  const data: Cita360Data = {
    appointment: appt as unknown as Cita360Data['appointment'],
    consultation: consultation as unknown as Cita360Data['consultation'],
    payment: payment as unknown as Cita360Data['payment'],
    paymentItems: (paymentItems ?? []) as Cita360Data['paymentItems'],
    doctor: doctor as Cita360Data['doctor'],
    patient: patient as Cita360Data['patient'],
    rescheduleChain: (rescheduleChain ?? []) as Cita360Data['rescheduleChain'],
    changeLog: changeLog as Cita360Data['changeLog'],
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
