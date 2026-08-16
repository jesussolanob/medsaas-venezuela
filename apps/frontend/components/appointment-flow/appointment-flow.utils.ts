'use client';

/**
 * appointment-flow.utils.ts
 *
 * Pure helpers shared between useAppointmentFlow hook and step components.
 * No side effects, no React imports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleDay = {
  day: number; // 0=lunes … 6=domingo (formato BD)
  start: string; // HH:MM
  end: string; // HH:MM
  enabled: boolean;
  /**
   * Duración y separación PROPIAS del bloque, en minutos. Cuando no vienen, el
   * bloque hereda las del consultorio (comportamiento previo). Permiten que un
   * mismo consultorio tenga la mañana de 45' y la tarde de 20'.
   */
  slotDuration?: number | null;
  bufferMinutes?: number | null;
};

export type DoctorOffice = {
  id: string;
  name: string;
  address: string;
  modality?: 'in_person' | 'online' | 'both';
  schedule?: ScheduleDay[] | null;
  slot_duration?: number | null;
  buffer_minutes?: number | null;
};

export type PatientLookup = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cedula: string | null;
};

export type PricingPlan = {
  id: string;
  name: string;
  price_usd: number;
  duration_minutes: number | null;
  sessions_count: number;
};

export type PatientPackageInfo = {
  id: string;
  plan_name: string;
  total_sessions: number;
  used_sessions: number;
};

export type NewPatientForm = {
  full_name: string;
  cedula: string;
  email: string;
  phone: string;
  birth_date: string;
  sex: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GENERIC_TIMES = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
];

/** Plan genérico cuando el backend no devuelve planes configurados. */
export const GENERIC_PLAN: PricingPlan = {
  id: 'generic',
  name: 'Consulta General',
  price_usd: 20,
  duration_minutes: 30,
  sessions_count: 1,
};

/** Métodos que requieren comprobante / referencia de pago. */
export const METHODS_WITH_RECEIPT = ['pago_movil', 'transferencia', 'zelle', 'binance'];

/** Etiquetas legibles para todos los métodos de pago conocidos. */
export const PAYMENT_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  transferencia: 'Transferencia bancaria',
  zelle: 'Zelle',
  binance: 'Binance / USDT',
  cash_usd: 'Efectivo (USD)',
  cash_bs: 'Efectivo (Bs)',
  efectivo: 'Efectivo',
  pos: 'Punto de venta',
  courtesy: 'Cortesía',
};

/** Métodos de fallback cuando el perfil del médico no tiene métodos configurados. */
export const FALLBACK_PAYMENT_METHODS = ['pago_movil', 'transferencia', 'zelle', 'efectivo'];

// ---------------------------------------------------------------------------
// Day conversion
// ---------------------------------------------------------------------------

/** BD usa day=0→lunes … day=6→domingo; Date.getDay() usa 0=domingo. */
export function jsDayToScheduleDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

/** Genera slots HH:MM entre start y end con paso efectivo = slotMin + bufferMin. */
export function timesBetween(
  start: string,
  end: string,
  slotMin: number,
  bufferMin: number,
): string[] {
  const out: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(eh)) return [];
  const startTotal = sh * 60 + (sm || 0);
  const endTotal = eh * 60 + (em || 0);
  const step = Math.max(15, (slotMin || 30) + (bufferMin || 0));
  for (let t = startTotal; t + (slotMin || 30) <= endTotal; t += step) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    out.push(`${h}:${m}`);
  }
  return out;
}

/**
 * Genera los slots HH:MM para una fecha dado el consultorio seleccionado.
 * - Sin consultorio (null): retorna GENERIC_TIMES (todos los días habilitados).
 * - Con consultorio pero sin schedule: retorna GENERIC_TIMES.
 * - Con schedule: usa el día de la semana de la fecha. Si no hay entrada habilitada → [].
 */
/**
 * Igual que getTimeSlotsForDate pero conservando CUÁNTO dura cada horario.
 *
 * Hace falta para saber qué slots pisa una cita: sin la duración, un turno de
 * 45' a las 08:00 no bloqueaba el 08:30. Cada bloque del día puede tener su
 * propia duración (ADR-028), así que no alcanza con la del consultorio.
 * Si dos bloques generan el mismo horario con duraciones distintas, se
 * conserva la MAYOR — ofrecer el corto dejaría entrar una cita que no cabe.
 */
export function getTimeSlotsWithDuration(
  dateStr: string,
  office: Pick<DoctorOffice, 'schedule' | 'slot_duration' | 'buffer_minutes'> | null,
): { time: string; durationMin: number }[] {
  const fallback = office?.slot_duration ?? 30;
  if (!office || !office.schedule || office.schedule.length === 0) {
    return GENERIC_TIMES.map((time) => ({ time, durationMin: fallback }));
  }
  const d = new Date(dateStr + 'T12:00:00');
  const schedDay = jsDayToScheduleDay(d.getDay());
  const scheds = office.schedule.filter((s) => s.day === schedDay && s.enabled);
  if (scheds.length === 0) return [];

  const byTime = new Map<string, number>();
  for (const s of scheds) {
    const durationMin = s.slotDuration ?? office.slot_duration ?? 30;
    for (const time of timesBetween(
      s.start,
      s.end,
      durationMin,
      s.bufferMinutes ?? office.buffer_minutes ?? 0,
    )) {
      byTime.set(time, Math.max(byTime.get(time) ?? 0, durationMin));
    }
  }
  return Array.from(byTime.entries())
    .map(([time, durationMin]) => ({ time, durationMin }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function getTimeSlotsForDate(
  dateStr: string,
  office: Pick<DoctorOffice, 'schedule' | 'slot_duration' | 'buffer_minutes'> | null,
): string[] {
  // Envoltorio de getTimeSlotsWithDuration: una sola implementación de la
  // grilla. Tener dos era exactamente cómo nacieron los bugs de duración.
  return getTimeSlotsWithDuration(dateStr, office).map((s) => s.time);
}

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

/** Convierte un ISO string a HH:MM en UTC-4 (América/Caracas, sin DST). */
export function isoToCaracasHHMM(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() + -4 * 60 * 60 * 1000);
  const h = String(local.getUTCHours()).padStart(2, '0');
  const m = String(local.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Normaliza un objeto de paciente desde el backend (camelCase o snake_case). */
export function normalizePatient(p: Record<string, unknown>): PatientLookup {
  return {
    id: String(p.id ?? ''),
    full_name: String(p.full_name ?? p.fullName ?? ''),
    email: (p.email as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    cedula: (p.cedula as string | null) ?? null,
  };
}

/** Normaliza un servicio/plan desde la respuesta del backend. */
export function normalizeService(s: Record<string, unknown>): PricingPlan {
  return {
    id: String(s.id ?? ''),
    name: String(s.name ?? ''),
    price_usd: (s.priceUsd as number) ?? (s.price_usd as number) ?? 0,
    duration_minutes: (s.durationMinutes as number) ?? (s.duration_minutes as number) ?? 30,
    sessions_count: (s.sessionsCount as number) ?? (s.sessions_count as number) ?? 1,
  };
}
