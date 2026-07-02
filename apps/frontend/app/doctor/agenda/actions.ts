'use server';

/**
 * app/doctor/agenda/actions.ts
 *
 * Server Actions para el módulo Agenda (ETAPA 1).
 *
 * Thin-proxy → NestJS backend via api-client.server.
 *
 * Endpoints consumidos:
 *   GET  /api/appointments?date_from=&date_to=&status=&page=&limit=
 *        → lista paginada con PII enmascarada (uso en calendario)
 *   GET  /api/appointments?status=scheduled&limit=100
 *        → citas pendientes de confirmación
 *   POST /api/doctor/appointment-status (route handler existente)
 *        → confirmar / cancelar / completar / no_show
 *   PUT  /api/appointments/:id/reschedule (via /api/doctor/reschedule route handler)
 *        → ya migrado; agenda lo llama vía fetch('/api/doctor/reschedule')
 *
 * DEFERRED (FASE 5 — sin endpoint backend en Etapa 1):
 *   - rejectAppointment: requiere DELETE con cascade GCal + package restore
 *     → permanece en Supabase vía /api/doctor/appointments DELETE route handler
 *   - acceptAppointment (find/create patient + create consultation):
 *     → usa /api/doctor/consultations POST (route handler migrado) +
 *       /api/patients POST (backend) pero la lógica de find-or-create patient
 *       sigue en Supabase hasta que el backend exponga un upsert endpoint
 *   - Supabase Realtime (auto-refresh): ELIMINADO — sustituido por polling manual
 *     o refresh explícito. Ver nota en page.tsx.
 *   - offices/schedule: GET /api/doctor/schedule (route handler Supabase-backed en Fase 5)
 *   - patients list para modal "nueva consulta": GET /api/patients (backend)
 *   - pricing_plans: pendiente backend endpoint
 *   - payment_methods del profile: pendiente backend endpoint
 *
 * Mapeo camelCase (backend) → snake_case (JSX):
 *   patientName      → patient_name
 *   patientPhone     → patient_phone
 *   patientEmail     → patient_email
 *   patientCedula    → patient_cedula
 *   scheduledAt      → isoDate (+ date YYYY-MM-DD, time HH:MM)
 *   chiefComplaint   → chief_complaint
 *   appointmentCode  → appointment_code
 *   consultationId   → appointment_id (es el FK de consultation al appointment)
 *   planName         → plan_name
 *   planPrice        → plan_price
 *   status           → status (mismo valor)
 */

import { backendGet, type AppError } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types — alineados con lo que consume el JSX de page.tsx
// ---------------------------------------------------------------------------

/**
 * Cita del calendario (fuente: backend appointment con PII enmascarada).
 * Refleja el shape que CalendarAppointment requiere en page.tsx.
 */
export type AgendaAppointment = {
  id: string;
  appointment_id: string | null;
  consultation_id: string | null;
  patient_name: string;
  date: string; // YYYY-MM-DD (timezone Caracas)
  isoDate: string; // ISO completo para ordenar y mostrar
  time: string; // HH:MM
  endTime: string; // HH:MM (calculado con slotDuration)
  chief_complaint: string | undefined;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  source: 'appointment';
  appointment_code: string | undefined;
  plan_name: string | undefined;
  plan_price: number | undefined;
  patient_phone: string | null;
  patient_email: string | null;
  patient_cedula: string | null;
  meet_link: string | null;
  payment_status: null; // no expuesto en lista — siempre null
};

/**
 * Cita pendiente (status=scheduled, para el panel de aprobaciones).
 * Refleja PendingAppointment en page.tsx.
 */
export type PendingAgendaAppointment = {
  id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  patient_cedula: string | null;
  scheduled_at: string;
  chief_complaint: string | null;
  plan_name: string | null;
  plan_price: number | null;
  status: string;
  appointment_code: string | undefined;
  payment_method: string | null;
  payment_receipt_url: string | null;
  appointment_mode: string | null;
  package_id: string | null;
  session_number: number | null;
  total_sessions: number | null;
};

// ---------------------------------------------------------------------------
// Raw backend shape (camelCase from NestJS entity serialization)
// ---------------------------------------------------------------------------

interface BackendAppointment {
  id: string;
  doctorId: string;
  patientId: string | null;
  consultationId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  patientCedula: string | null;
  scheduledAt: string; // ISO string
  status: string;
  appointmentMode: string | null;
  planName: string | null;
  planPrice: number | null;
  paymentMethod: string | null;
  paymentReceiptUrl: string | null;
  packageId: string | null;
  sessionNumber: number | null;
  chiefComplaint: string | null;
  appointmentCode: string | null;
  paymentId: string | null;
  // meet_link no está en el entity actual — Fase 5
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convierte una fecha ISO a HH:MM en zona América/Caracas (UTC-4). */
function isoToCaracasHHMM(iso: string): string {
  const d = new Date(iso);
  // UTC-4 fijo (Venezuela no usa horario de verano)
  const offsetMs = -4 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  const h = String(local.getUTCHours()).padStart(2, '0');
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Convierte una fecha ISO a YYYY-MM-DD en zona América/Caracas. */
function isoToCaracasYMD(iso: string): string {
  const d = new Date(iso);
  const offsetMs = -4 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  const y = local.getUTCFullYear();
  const mo = String(local.getUTCMonth() + 1).padStart(2, '0');
  const da = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Suma minutos a un HH:MM y devuelve HH:MM. */
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function appErrorMsg(error: AppError): string {
  return error.message ?? `Error ${error.status}`;
}

// ---------------------------------------------------------------------------
// Map backend camelCase → snake_case para el JSX
// ---------------------------------------------------------------------------

function toAgendaAppointment(raw: BackendAppointment, slotDuration: number): AgendaAppointment {
  const time = isoToCaracasHHMM(raw.scheduledAt);
  return {
    id: raw.id,
    appointment_id: raw.id, // en citas puras el appointment_id ES el id
    consultation_id: raw.consultationId ?? null,
    patient_name: raw.patientName ?? 'Paciente',
    date: isoToCaracasYMD(raw.scheduledAt),
    isoDate: raw.scheduledAt,
    time,
    endTime: addMinutes(time, slotDuration),
    chief_complaint: raw.chiefComplaint ?? undefined,
    status: raw.status as AgendaAppointment['status'],
    source: 'appointment' as const,
    appointment_code: raw.appointmentCode ?? undefined,
    plan_name: raw.planName ?? undefined,
    plan_price: raw.planPrice ?? undefined,
    patient_phone: raw.patientPhone ?? null,
    patient_email: raw.patientEmail ?? null,
    patient_cedula: raw.patientCedula ?? null,
    meet_link: null, // meet_link no está en entity v1 — FASE 5
    payment_status: null,
  };
}

function toPendingAppointment(raw: BackendAppointment): PendingAgendaAppointment {
  return {
    id: raw.id,
    patient_name: raw.patientName ?? 'Paciente',
    patient_phone: raw.patientPhone ?? null,
    patient_email: raw.patientEmail ?? null,
    patient_cedula: raw.patientCedula ?? null,
    scheduled_at: raw.scheduledAt,
    chief_complaint: raw.chiefComplaint ?? null,
    plan_name: raw.planName ?? null,
    plan_price: raw.planPrice ?? null,
    status: raw.status,
    appointment_code: raw.appointmentCode ?? undefined,
    payment_method: raw.paymentMethod ?? null,
    payment_receipt_url: raw.paymentReceiptUrl ?? null,
    appointment_mode: raw.appointmentMode ?? null,
    package_id: raw.packageId ?? null,
    session_number: raw.sessionNumber ?? null,
    total_sessions: null, // enriquecido por el caller si hay package
  };
}

// ---------------------------------------------------------------------------
// Server Actions (read-only — los writes usan los route handlers existentes)
// ---------------------------------------------------------------------------

/**
 * Carga el rango de citas para el calendario.
 * Paginación amplia (limit=200) para cubrir ±60 días sin múltiples requests.
 *
 * @param dateFrom - ISO string (fecha inicio del rango)
 * @param dateTo   - ISO string (fecha fin del rango)
 * @param slotDuration - duración de slot en minutos (para calcular endTime)
 */
export async function listAgendaAppointments(
  dateFrom: string,
  dateTo: string,
  slotDuration = 30,
): Promise<AgendaAppointment[]> {
  const qs = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    page: '1',
    limit: '200',
  });

  const result = await backendGet<{ items?: BackendAppointment[]; data?: BackendAppointment[] }>(
    `/api/appointments?${qs.toString()}`,
  );

  if (!result.ok) {
    log.error('[listAgendaAppointments] backend error', {
      code: result.error.code,
      status: result.error.status,
      message: appErrorMsg(result.error),
    });
    return [];
  }

  // El backend devuelve { success: true, data: [...], meta: {...} }
  // backendFetch ya extrae .data del envelope → result.value es el array directamente
  const raw = Array.isArray(result.value) ? (result.value as unknown as BackendAppointment[]) : [];

  return raw.map((r) => toAgendaAppointment(r, slotDuration));
}

/**
 * Carga las citas pendientes de confirmación (status=scheduled).
 * El panel de aprobaciones de la agenda necesita este subconjunto separado.
 *
 * @param slotDuration - duración de slot (para PendingAppointment no se usa endTime,
 *                       pero se mantiene por consistencia de firma)
 */
export async function listPendingAppointments(
  slotDuration = 30,
): Promise<PendingAgendaAppointment[]> {
  const qs = new URLSearchParams({
    status: 'scheduled',
    page: '1',
    limit: '100',
  });

  const result = await backendGet<BackendAppointment[]>(`/api/appointments?${qs.toString()}`);

  if (!result.ok) {
    log.error('[listPendingAppointments] backend error', {
      code: result.error.code,
      status: result.error.status,
      message: appErrorMsg(result.error),
    });
    return [];
  }

  const raw = Array.isArray(result.value) ? (result.value as unknown as BackendAppointment[]) : [];

  void slotDuration; // no se usa en pending, pero se conserva en firma para futura extensión
  return raw.map(toPendingAppointment);
}

/**
 * Carga UNA cita por ID (datos completos, sin máscara aplicada al dueño).
 * Usado al revelar detalles del modal de detalle.
 */
export async function getAgendaAppointmentById(
  id: string,
  slotDuration = 30,
): Promise<AgendaAppointment | null> {
  const result = await backendGet<BackendAppointment>(`/api/appointments/${id}`);

  if (!result.ok) {
    log.error('[getAgendaAppointmentById] backend error', {
      id,
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return toAgendaAppointment(result.value as unknown as BackendAppointment, slotDuration);
}

// ---------------------------------------------------------------------------
// Detail status (consulta + pago) — GET /api/appointments/:id/detail
// ---------------------------------------------------------------------------

/**
 * Shape del bloque "3 estados" del modal de detalle.
 * Alineado exactamente con lo que el JSX de page.tsx consume:
 *   detailStatus.consulta → badge de consulta
 *   detailStatus.pago     → badge de pago
 */
export type AppointmentDetailStatus = {
  consulta: string | null;
  pago: string | null;
};

/**
 * Raw envelope que devuelve GET /api/appointments/:id/detail.
 * Solo extraemos los campos que necesitamos para el modal.
 */
interface BackendDetail360 {
  appointment: {
    status: string;
    consultation_id: string | null;
  };
  consultation: {
    payment_status: string | null;
  } | null;
  payment: {
    status: string | null;
  } | null;
}

/**
 * Obtiene el estado de consulta y pago de una cita individual
 * usando el endpoint de detalle completo.
 *
 * Mapeo backend → JSX:
 *   consultation.payment_status ('approved'|'pending'|null) → pago
 *   consultation presence + appointment.status              → consulta
 *     - appointment.status in ('completed','no_show','cancelled') → ese mismo valor
 *     - consultation exists and status='confirmed'                → 'pending' (en curso)
 *     - no consultation                                           → null
 *
 * Degrada silenciosamente a { consulta: null, pago: null } si el endpoint falla
 * (e.g. backend no disponible, cita no encontrada) — el JSX ya maneja null
 * mostrando "Sin consulta" / "Sin pago".
 */
export async function getAppointmentDetailStatus(
  appointmentId: string,
): Promise<AppointmentDetailStatus> {
  const fallback: AppointmentDetailStatus = { consulta: null, pago: null };

  const result = await backendGet<BackendDetail360>(`/api/appointments/${appointmentId}/detail`);

  if (!result.ok) {
    log.error('[getAppointmentDetailStatus] backend error', {
      appointmentId,
      code: result.error.code,
      status: result.error.status,
      message: appErrorMsg(result.error),
    });
    return fallback;
  }

  const detail = result.value as unknown as BackendDetail360;

  // Derivar estado de consulta
  let consulta: string | null = null;
  const apptStatus = detail.appointment?.status ?? null;

  if (detail.consultation !== null && detail.consultation !== undefined) {
    // Hay consulta vinculada — el estado de la CITA refleja el estado clínico
    if (apptStatus === 'completed' || apptStatus === 'no_show' || apptStatus === 'cancelled') {
      consulta = apptStatus;
    } else {
      // confirmed / scheduled con consulta creada → "en curso" / pendiente
      consulta = 'pending';
    }
  }
  // Sin consulta → consulta permanece null (JSX muestra "Sin consulta")

  // Estado de pago: viene directamente de consultation.payment_status
  const pago = detail.consultation?.payment_status ?? null;

  return { consulta, pago };
}

// ---------------------------------------------------------------------------
// Packages enrichment — GET /api/packages/doctor?patient_id=
// ---------------------------------------------------------------------------

/**
 * Raw item que devuelve GET /api/packages/doctor.
 */
interface BackendPackageItem {
  id: string;
  patientId: string | null;
  planName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: string;
}

/**
 * Lookup de paquetes: mapea package_id → total_sessions.
 * El JSX muestra total_sessions en las tarjetas de citas pendientes para que
 * el doctor sepa cuántas sesiones tiene el paquete (e.g. "Sesión 2 de 5").
 *
 * Estrategia: agrupamos los patient_ids únicos de las citas pendientes que
 * tienen un package_id y los consultamos en paralelo (un request por paciente)
 * para construir un mapa { packageId → totalSessions }.
 *
 * Degrada silenciosamente → retorna mapa vacío si el endpoint falla.
 *
 * @param pendingItems - Citas pendientes ya cargadas (usamos package_id y patientId).
 */
export async function buildPackageTotalSessionsMap(
  pendingItems: ReadonlyArray<{
    package_id: string | null | undefined;
    patient_cedula: string | null;
  }>,
): Promise<Map<string, number>> {
  const totalMap = new Map<string, number>();

  // Collect unique non-null patient IDs associated with a package.
  // NOTE: pending items carry patient_cedula (masked) but not patient_id (UUID).
  // The packages endpoint accepts `patient_id` (UUID). Since PendingAgendaAppointment
  // does not expose the patient UUID (only masked PII), we must fall back to
  // fetching all doctor packages without a patient filter and index by package id.
  const hasAnyPackage = pendingItems.some((p) => p.package_id != null);
  if (!hasAnyPackage) {
    return totalMap;
  }

  const result = await backendGet<BackendPackageItem[]>('/api/packages/doctor?status=active');

  if (!result.ok) {
    log.error('[buildPackageTotalSessionsMap] backend error', {
      code: result.error.code,
      status: result.error.status,
      message: appErrorMsg(result.error),
    });
    return totalMap;
  }

  const packages = Array.isArray(result.value)
    ? (result.value as unknown as BackendPackageItem[])
    : [];

  for (const pkg of packages) {
    totalMap.set(pkg.id, pkg.totalSessions);
  }

  return totalMap;
}
