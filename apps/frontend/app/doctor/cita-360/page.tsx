import 'server-only';

import { redirect } from 'next/navigation';
import { backendGet } from '@/lib/api-client.server';
import { getDevUser } from '@/lib/dev-auth';
import { log } from '@/lib/logger';
import Cita360List from './Cita360List';
import type { Cita360Row } from './Cita360List';

export const dynamic = 'force-dynamic';

/**
 * /doctor/cita-360
 * Selector de citas — el doctor elige una y ve su Cita 360°.
 *
 * MIGRATED (Etapa 1): auth → dev-auth stub, lista → GET /api/appointments.
 *
 * DEFERRED (FASE 5 — sin endpoint backend en Etapa 1):
 *   - consultation_code / consultation_status: requiere join consultations
 *   - payment_code / payment_status / payment_amount: requiere join payments
 *   - patient full_name (campo patient_name del appointment ya viene enmascarado)
 *   Estos campos se sirven como null hasta que el backend exponga un endpoint
 *   /api/appointments/detail-list con el join completo.
 */

// ── Backend shape (camelCase — NestJS default serialization) ──────────────────

interface BackendAppointmentListItem {
  id: string;
  appointmentCode: string | null;
  status: string;
  scheduledAt: string;
  appointmentMode: string | null;
  patientName: string | null;
  // Campos de Etapa 1 — no incluyen consultation/payment join
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadAppointmentList(): Promise<Cita360Row[]> {
  const result = await backendGet<unknown>(
    '/api/appointments?page=1&limit=150',
  );

  if (!result.ok) {
    log.error('[cita-360/page] backend error al cargar lista de citas', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  // backendFetch extrae .data del envelope { success:true, data:[...], meta:{} }
  // result.value puede ser el array directamente o un objeto con .items
  const raw = Array.isArray(result.value)
    ? (result.value as BackendAppointmentListItem[])
    : [];

  return raw.map((a) => ({
    id: a.id,
    appointment_code: a.appointmentCode ?? '—',
    status: a.status,
    scheduled_at: a.scheduledAt,
    mode: a.appointmentMode ?? null,
    // patient_name viene enmascarado del backend (PII masking aplicado en mapper)
    patient_name: a.patientName ?? 'Paciente',
    // FASE 5 — no disponible en Etapa 1 sin join backend:
    consultation_code: null,
    consultation_status: null,
    payment_code: null,
    payment_status: null,
    payment_amount: null,
  }));
}

// ── Page component ─────────────────────────────────────────────────────────────

export default async function Cita360IndexPage() {
  // MIGRATED: auth → dev-auth stub (reemplaza supabase.auth.getUser + createAdminClient)
  const devUser = await getDevUser();
  if (!devUser.id) redirect('/login');

  // Solo doctor o super_admin pueden acceder
  if (devUser.role !== 'doctor' && devUser.role !== 'super_admin') {
    redirect('/login');
  }

  const rows = await loadAppointmentList();

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cita 360°</h1>
        <p className="text-sm text-slate-500 mt-1">
          Selecciona una cita para ver su flujo completo: cita, consulta, pago y resumen.
        </p>
      </div>
      <Cita360List rows={rows} />
    </div>
  );
}
