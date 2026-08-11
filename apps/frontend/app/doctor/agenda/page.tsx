'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  Activity,
  Plus,
  ChevronLeft,
  ChevronRight,
  Link2,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle,
  ClipboardList,
  Search,
  X,
  XCircle,
  Settings,
  Stethoscope,
  Upload,
  Loader2,
  Package,
  RefreshCw,
  ChevronDown,
  CalendarX,
} from 'lucide-react';
import AvailabilityBlocks, { type AvailabilityBlock } from '@/components/agenda/AvailabilityBlocks';
import { getDoctorId as getDevDoctorId } from '@/app/doctor/actions';
import {
  listAgendaAppointments,
  listPendingAppointments,
  buildPackageTotalSessionsMap,
} from './actions'; // MIGRATED: appointments → NestJS backend
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow';
import AppointmentDetailModal from '@/components/doctor/AppointmentDetailModal';
import type { RescheduleRequest } from '@/components/doctor/AppointmentDetailModal';
import { toLocalHHMM, toLocalYMD } from '@/lib/timezone';
import { showToast } from '@/components/ui/Toaster';
import { reportError } from '@/lib/report-error';

// RONDA 19c — Helper UNICO de estilos por status para citas en la agenda.
// Cancelled: rojo claro fondo, texto rojo oscuro, borde rojo solido + opacity + line-through.
const APPT_STYLE: Record<
  string,
  {
    card: string; // clases para la tarjeta entera
    title: string; // clases para el nombre del paciente
    subtitle: string; // clases para el subtitulo
    badge: string; // clases para el badge dentro del modal
    badgeLabel: string; // texto del badge
    Icon: typeof Calendar;
  }
> = {
  scheduled: {
    card: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
    title: 'text-amber-700 font-semibold',
    subtitle: 'text-amber-600',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    badgeLabel: 'Agendada',
    Icon: Clock,
  },
  confirmed: {
    card: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    title: 'text-blue-700 font-semibold',
    subtitle: 'text-blue-600',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    badgeLabel: 'Confirmada',
    Icon: Check,
  },
  completed: {
    card: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
    title: 'text-emerald-700 font-semibold',
    subtitle: 'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    badgeLabel: 'Atendida',
    Icon: CheckCircle,
  },
  cancelled: {
    card: 'bg-red-50 border-red-500 hover:bg-red-100 opacity-60',
    title: 'text-red-700 font-semibold line-through',
    subtitle: 'text-red-600 italic',
    badge: 'bg-red-50 text-red-700 border-2 border-red-500',
    badgeLabel: 'Cancelada',
    Icon: XCircle,
  },
  no_show: {
    card: 'bg-slate-100 border-slate-300 hover:bg-slate-200 opacity-70',
    title: 'text-slate-600 font-semibold line-through',
    subtitle: 'text-slate-500 italic',
    badge: 'bg-slate-100 text-slate-700 border border-slate-300',
    badgeLabel: 'No asistió',
    Icon: XCircle,
  },
};
const getApptStyle = (status: string) => APPT_STYLE[status] || APPT_STYLE.scheduled;

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduleConfig = {
  slot_duration: number; // minutos por cita
  buffer_minutes: number; // minutos entre citas
  advance_booking_days: number;
  auto_approve: boolean;
};

type AvailabilitySlot = {
  id?: string;
  day_of_week: number; // 0=Lun, 6=Dom
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  is_enabled: boolean;
};

type CalendarAppointment = {
  id: string; // cuando source='consultation' este es consultations.id, NO appointments.id
  appointment_id?: string | null; // el ID real de la fila en appointments (para RPCs)
  consultation_id?: string | null; // FK a la consulta vinculada (para "Ir a consulta")
  patient_name: string;
  date: string; // YYYY-MM-DD
  isoDate: string; // full ISO
  time: string; // HH:MM
  endTime: string; // HH:MM (calculado)
  chief_complaint?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  source: 'consultation' | 'appointment';
  consultation_code?: string | null;
  appointment_code?: string;
  plan_name?: string;
  plan_price?: number;
  patient_phone?: string | null;
  patient_email?: string | null;
  patient_cedula?: string | null;
  meet_link?: string | null;
  // L2 (2026-04-29): estado de pago (de la consulta vinculada). Solo presente
  // cuando hay consultation linkeada — se usa para los filtros "Pago aprobado"
  // y "Pago pendiente" del calendario.
  payment_status?: 'pending' | 'approved' | null;
};

type PendingAppointment = {
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
  appointment_code?: string;
  payment_method?: string | null;
  payment_receipt_url?: string | null;
  appointment_mode?: string | null;
  package_id?: string | null;
  session_number?: number | null;
  total_sessions?: number | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DURATION_OPTIONS = [15, 20, 30, 45, 60];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30];

const DEFAULT_CONFIG: ScheduleConfig = {
  slot_duration: 30,
  buffer_minutes: 0,
  advance_booking_days: 30,
  auto_approve: false,
};

// FIX 2026-04-29: tags `id: 'default-...'` para que el merge sepa cuáles son
// fallback y los reemplace por completo cuando llegue la config real del office.
const DEFAULT_SLOTS: AvailabilitySlot[] = [
  { id: 'default-0a', day_of_week: 0, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { id: 'default-0b', day_of_week: 0, start_time: '14:00', end_time: '17:00', is_enabled: true },
  { id: 'default-1a', day_of_week: 1, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { id: 'default-1b', day_of_week: 1, start_time: '14:00', end_time: '17:00', is_enabled: true },
  { id: 'default-2a', day_of_week: 2, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { id: 'default-3a', day_of_week: 3, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { id: 'default-3b', day_of_week: 3, start_time: '14:00', end_time: '17:00', is_enabled: true },
  { id: 'default-4a', day_of_week: 4, start_time: '08:00', end_time: '12:00', is_enabled: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDates(offset = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDates(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// RONDA 24: usar helpers de timezone forzando America/Caracas. Date.getHours()
// devolveria la hora del NAVEGADOR del doctor — eso causaba que un domingo en
// Caracas se viera como sabado si el doctor estaba en otra timezone.
function toHHMM(date: Date): string {
  return toLocalHHMM(date);
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Generate time slots for a day based on availability and config */
function generateTimeSlots(
  dayOfWeek: number,
  availSlots: AvailabilitySlot[],
  config: ScheduleConfig,
): { time: string; endTime: string }[] {
  const daySlots = availSlots.filter((s) => s.day_of_week === dayOfWeek && s.is_enabled);
  const result: { time: string; endTime: string }[] = [];

  for (const slot of daySlots) {
    const blockStart = timeToMinutes(slot.start_time);
    const blockEnd = timeToMinutes(slot.end_time);
    const step = config.slot_duration + config.buffer_minutes;
    let current = blockStart;

    while (current + config.slot_duration <= blockEnd) {
      const startStr = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
      const endStr = addMinutes(startStr, config.slot_duration);
      result.push({ time: startStr, endTime: endStr });
      current += step;
    }
  }

  return result;
}

/** Check if a time falls on a valid slot boundary */
function isValidSlotTime(
  time: string,
  dayOfWeek: number,
  availSlots: AvailabilitySlot[],
  config: ScheduleConfig,
): boolean {
  const validSlots = generateTimeSlots(dayOfWeek, availSlots, config);
  return validSlots.some((s) => s.time === time);
}

function dateToYMD(d: Date): string {
  // RONDA 24: forzar zona Caracas — antes usaba getFullYear/getMonth/getDate
  // que dependen de la zona horaria del navegador.
  return toLocalYMD(d);
}

// ── Component ────────────────────────────────────────────────────────────────

type CalendarView = 'week' | 'month' | 'day';
type AgendaTab = 'calendar';

export default function AgendaPage() {
  const router = useRouter();
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthYear, setMonthYear] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [calView, setCalView] = useState<CalendarView>('month');
  const [tab, setTab] = useState<AgendaTab>('calendar');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  // Schedule config
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG);
  const [availSlots, setAvailSlots] = useState<AvailabilitySlot[]>(DEFAULT_SLOTS);
  const [bookingHorizonWeeks, setBookingHorizonWeeks] = useState<number>(8);
  // Bug 3 fix: local string state so the user can clear the field without NaN lock
  const [horizonStr, setHorizonStr] = useState<string>('8');
  const [savingHorizon, setSavingHorizon] = useState(false);
  // Días de anticipación mínima para agendar (0 = sin restricción)
  const [minLeadDays, setMinLeadDays] = useState<number>(0);
  const [leadStr, setLeadStr] = useState<string>('0');
  // Si el paciente debe indicar el motivo al agendar
  const [requireReason, setRequireReason] = useState<boolean>(false);
  // Bug 4: availability blocks loaded from backend, used in day-view to mark blocked slots
  const [calendarBlocks, setCalendarBlocks] = useState<AvailabilityBlock[]>([]);
  const [showAvailabilityPanel, setShowAvailabilityPanel] = useState(false);

  // Calendar data (real from DB)
  const [allAppointments, setAllAppointments] = useState<CalendarAppointment[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<PendingAppointment[]>([]);

  // UI state
  const [accepting, setAccepting] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [rescheduling, setRescheduling] = useState<PendingAppointment | null>(null);
  const [newDateTime, setNewDateTime] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleWeekOffset, setRescheduleWeekOffset] = useState(0);
  const [detailAppt, setDetailAppt] = useState<CalendarAppointment | null>(null);
  // F1 (2026-04-29): tipo restringido a las 3 opciones visibles en los chips.
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'confirmed'>('all');
  // L2 (2026-04-29): filtro adicional por estado de pago (consulta vinculada).
  // Filtros de status de cita y de pago se combinan via AND.
  // Citas sin consulta linkeada se EXCLUYEN cuando paymentFilter !== 'all'.
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'approved' | 'pending'>('all');

  // Google Calendar Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; success: boolean } | null>(null);

  // Delete confirmation
  const [deletingAppt, setDeletingAppt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CalendarAppointment | null>(null);
  // Modal custom para cambiar estado de cita (reemplaza window.confirm)
  const [statusAction, setStatusAction] = useState<{
    type: 'completed' | 'cancelled' | 'no_show';
    appt: CalendarAppointment;
  } | null>(null);

  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Nueva consulta desde agenda
  const [showNewConsulta, setShowNewConsulta] = useState(false);
  const [patients, setPatients] = useState<
    { id: string; full_name: string; phone: string | null }[]
  >([]);
  const [pricingPlans, setPricingPlans] = useState<
    { id: string; name: string; price_usd: number; duration_minutes: number }[]
  >([]);
  const [newConsulta, setNewConsulta] = useState({
    patient_id: '',
    date: '',
    time: '',
    reason: '',
    plan_id: '',
    payment_method: '' as string,
    payment_reference: '',
  });
  const [creatingConsulta, setCreatingConsulta] = useState(false);
  const [doctorPaymentMethods, setDoctorPaymentMethods] = useState<string[]>([]);
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null);
  const requiresReceiptForNew = (method: string) =>
    !['efectivo', 'efectivo_bs', 'pos', ''].includes(method);

  const weekDates = getWeekDates(weekOffset);
  const monthCells = getMonthDates(monthYear.year, monthYear.month);

  // ── Load data from DB ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    // MIGRATED (Etapa 1): identity from dev-auth stub.
    const id = await getDevDoctorId();
    if (!id) return;
    setDoctorId(id);

    // 1. Load schedule config + availability via route handler (backend-backed).
    try {
      const schedRes = await fetch('/api/doctor/schedule');
      if (schedRes.ok) {
        const sched = await schedRes.json();
        if (sched.config) {
          setConfig(sched.config);
          // Leer booking_horizon_weeks del schedule (puede venir en config o a nivel raíz)
          const hw: number | null | undefined =
            sched.config.booking_horizon_weeks ?? sched.booking_horizon_weeks;
          if (hw != null && typeof hw === 'number' && hw >= 1) {
            setBookingHorizonWeeks(hw);
            setHorizonStr(String(hw));
          }
          // Días de anticipación mínima
          const mld =
            typeof sched.config.booking_min_lead_days === 'number'
              ? sched.config.booking_min_lead_days
              : 0;
          setMinLeadDays(mld);
          setLeadStr(String(mld));
          // Requerir motivo
          setRequireReason(sched.config.booking_require_reason === true);
        }
        if (sched.slots && sched.slots.length > 0) {
          setAvailSlots(
            sched.slots.map((s: any) => ({
              id: s.id,
              day_of_week: s.day_of_week,
              start_time: s.start_time?.slice(0, 5) || s.start_time,
              end_time: s.end_time?.slice(0, 5) || s.end_time,
              is_enabled: s.is_enabled,
            })),
          );
        }
      }

      // RONDA 28 + MIGRATED: doctor_offices → GET /api/doctor/offices (NestJS backend).
      // Si el doctor configuró su consultorio, REEMPLAZAR los DEFAULT_SLOTS — antes
      // hacíamos merge "preservando días existentes", lo que dejaba el DEFAULT
      // (08:00-12:00) ganando sobre el office (08:00-17:00) y la agenda solo
      // mostraba slots hasta 10:20.
      const officesRes = await fetch('/api/doctor/offices');
      if (officesRes.ok) {
        const officesJson = await officesRes.json();
        // Backend devuelve { success: true, data: [...] } o un array directo
        const officesList: any[] = Array.isArray(officesJson)
          ? officesJson
          : Array.isArray(officesJson?.data)
            ? officesJson.data
            : [];

        const activeOffices = officesList.filter((o: any) => o.isActive || o.is_active);

        if (activeOffices.length > 0) {
          const officeSlots: AvailabilitySlot[] = [];
          activeOffices.forEach((off: any) => {
            // El backend devuelve camelCase: slotDuration, bufferMinutes, schedule
            const schedule = off.schedule as
              | { day: number; start: string; end: string; enabled: boolean }[]
              | null;
            if (!Array.isArray(schedule)) return;
            schedule.forEach((s) => {
              if (s.enabled && s.start && s.end) {
                officeSlots.push({
                  id: `office-${s.day}-${s.start}`,
                  day_of_week: s.day,
                  start_time: s.start,
                  end_time: s.end,
                  is_enabled: true,
                } as AvailabilitySlot);
              }
            });
          });

          if (officeSlots.length > 0) {
            // FIX 2026-04-29: el office es la fuente de verdad. Reemplazamos
            // DEFAULT_SLOTS por completo. Solo conservamos slots de doctor_availability
            // (legacy) que NO chocan con office (días distintos).
            setAvailSlots((prev) => {
              const officeDays = new Set(officeSlots.map((o) => o.day_of_week));
              const isDefaultSlot = (s: AvailabilitySlot) =>
                !s.id || String(s.id).startsWith('default-');
              const legacyKept = prev.filter(
                (s) => !officeDays.has(s.day_of_week) && !isDefaultSlot(s),
              );
              return [...officeSlots, ...legacyKept];
            });
            // RONDA 32: solo setear config si REALMENTE cambia algo (deep check).
            const firstOffice = activeOffices[0] as any;
            const rawSlot = firstOffice.slotDuration ?? firstOffice.slot_duration;
            const rawBuffer = firstOffice.bufferMinutes ?? firstOffice.buffer_minutes;
            setConfig((prev) => {
              const newSlot = rawSlot ?? prev.slot_duration;
              const newBuffer = rawBuffer ?? prev.buffer_minutes;
              if (newSlot === prev.slot_duration && newBuffer === prev.buffer_minutes) return prev;
              return { ...prev, slot_duration: newSlot, buffer_minutes: newBuffer };
            });
          }
        }
      }
    } catch {
      /* use defaults */
    }

    // Load patients for "nueva consulta" modal — GET /api/patients (NestJS backend).
    try {
      const patientsRes = await fetch('/api/patients?page=1&limit=200');
      if (patientsRes.ok) {
        const patientsJson = await patientsRes.json();
        // Backend envelope: { success: true, data: [...] } or paginated { items: [...] }
        const rawPatients: any[] = Array.isArray(patientsJson?.data)
          ? patientsJson.data
          : Array.isArray(patientsJson?.data?.items)
            ? patientsJson.data.items
            : Array.isArray(patientsJson)
              ? patientsJson
              : [];
        // Mapear camelCase → shape { id, full_name, phone }
        setPatients(
          rawPatients.map((p: any) => ({
            id: p.id,
            full_name: p.fullName ?? p.full_name ?? '',
            phone: p.phone ?? null,
          })),
        );
      }
    } catch {
      /* patients permanece vacío */
    }

    // Load pricing plans (services) — GET /api/doctor/services (NestJS backend).
    try {
      const servicesRes = await fetch('/api/doctor/services');
      if (servicesRes.ok) {
        const servicesJson = await servicesRes.json();
        const rawServices: any[] = Array.isArray(servicesJson?.data)
          ? servicesJson.data
          : Array.isArray(servicesJson)
            ? servicesJson
            : [];
        // Mapear camelCase → shape { id, name, price_usd, duration_minutes }
        const activeServices = rawServices
          .filter((s: any) => s.isActive ?? s.is_active ?? true)
          .map((s: any) => ({
            id: s.id,
            name: s.name ?? '',
            price_usd: Number(s.priceUsd ?? s.price_usd ?? 0),
            duration_minutes: Number(s.durationMinutes ?? s.duration_minutes ?? 30),
          }))
          .sort((a, b) => a.price_usd - b.price_usd);
        setPricingPlans(activeServices);
      }
    } catch {
      /* pricing plans permanece vacío */
    }

    // Load doctor's active payment methods — GET /api/doctor/profile (NestJS backend).
    try {
      const profileRes = await fetch('/api/doctor/profile');
      if (profileRes.ok) {
        const profileJson = await profileRes.json();
        const profileData = profileJson?.data ?? profileJson;
        const methods = profileData?.paymentMethods ?? profileData?.payment_methods;
        if (Array.isArray(methods)) {
          setDoctorPaymentMethods(methods);
        }
      }
    } catch {
      /* payment methods permanece vacío */
    }

    // MIGRATED (Etapa 1): appointments list → NestJS backend via listAgendaAppointments.
    // Reemplaza las 3 queries Supabase anteriores (consultations join + confirmed + pending).
    // La separación consultas/citas ya no existe en el frontend: el backend unifica todo
    // bajo /api/appointments. payment_status por filtro de pago queda DEFERRED (FASE 5):
    // el backend no expone payment_status en lista en Etapa 1 → siempre null.
    const slotDuration = config.slot_duration || 30;
    const pastCutoff = new Date();
    pastCutoff.setDate(pastCutoff.getDate() - 30);
    const futureCutoff = new Date();
    futureCutoff.setDate(futureCutoff.getDate() + 60);

    const [backendAppts, backendPending] = await Promise.all([
      // Citas confirmadas/completadas/canceladas/no_show en rango ±30/+60 días
      listAgendaAppointments(pastCutoff.toISOString(), futureCutoff.toISOString(), slotDuration),
      // Citas pendientes (status=scheduled) sin límite de fecha
      listPendingAppointments(slotDuration),
    ]);

    // Normalizar al shape CalendarAppointment que consume el JSX
    const uniqueAppts: CalendarAppointment[] = backendAppts
      .filter((a) => a.status !== 'scheduled') // pending ya viene en backendPending
      .map((a) => ({
        id: a.id,
        appointment_id: a.appointment_id,
        consultation_id: a.consultation_id,
        patient_name: a.patient_name,
        date: a.date,
        isoDate: a.isoDate,
        time: a.time,
        endTime: a.endTime,
        chief_complaint: a.chief_complaint,
        status: a.status,
        source: a.source,
        consultation_code: a.consultation_code ?? null,
        appointment_code: a.appointment_code,
        plan_name: a.plan_name,
        plan_price: a.plan_price,
        patient_phone: a.patient_phone,
        patient_email: a.patient_email,
        patient_cedula: a.patient_cedula,
        meet_link: a.meet_link,
        payment_status: a.payment_status,
      }));
    setAllAppointments(uniqueAppts);

    // Enriquecer total_sessions de citas pendientes usando GET /api/packages/doctor.
    // Construye un mapa { packageId → totalSessions } y lo aplica a las citas pendientes.
    // Degrada silenciosamente si el endpoint falla (total_sessions queda null → JSX muestra "—").
    const pkgTotalMap = await buildPackageTotalSessionsMap(backendPending);
    const pendingList: PendingAppointment[] = backendPending.map((p) => ({
      ...p,
      total_sessions:
        p.package_id != null && pkgTotalMap.has(p.package_id)
          ? (pkgTotalMap.get(p.package_id) ?? null)
          : null,
    }));

    setPendingAppointments(pendingList);

    // Bug 4 fix: load availability blocks so the day-view can mark blocked slots.
    // Uses the same route handler (GET /api/doctor/availability-blocks) that
    // AvailabilityBlocks.tsx uses, so no new backend endpoint is needed.
    try {
      const blocksFrom = new Date();
      blocksFrom.setDate(blocksFrom.getDate() - 7);
      const blocksTo = new Date();
      blocksTo.setDate(blocksTo.getDate() + 90);
      const blocksQs = new URLSearchParams({
        from: blocksFrom.toISOString(),
        to: blocksTo.toISOString(),
      });
      const blocksRes = await fetch(`/api/doctor/availability-blocks?${blocksQs.toString()}`);
      if (blocksRes.ok) {
        const blocksJson = await blocksRes.json();
        const blocksData: AvailabilityBlock[] = Array.isArray(blocksJson?.data)
          ? (blocksJson.data as AvailabilityBlock[])
          : [];
        setCalendarBlocks(blocksData);
      }
    } catch {
      /* calendarBlocks stays empty — all slots appear available in day view */
    }

    setLoading(false);
    // RONDA 32: deps vacias para que loadData NO se recree.
    // Antes la dep [config.slot_duration] causaba bucle infinito porque dentro
    // se hace setConfig({slot_duration:...}) → useCallback recrea loadData →
    // useEffect dispara loadData otra vez → loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RONDA 32: ref guard para garantizar que loadData() corra UNA SOLA VEZ al montar.
  // Cualquier refresh manual debe llamar loadData() directo (ya hay 2 lugares: linea 777 y 955).
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug 3 fix: sync horizonStr when bookingHorizonWeeks is updated by loadData()
  // (runs only on mount and when backend returns a different horizon value).
  useEffect(() => {
    setHorizonStr(String(bookingHorizonWeeks));
  }, [bookingHorizonWeeks]);

  // REALTIME ELIMINADO (Etapa 1 → FASE 5):
  // Supabase Realtime (postgres_changes en appointments/consultations/payments)
  // fue removido porque los datos ahora vienen del backend NestJS vía HTTP.
  // No existe un equivalente WebSocket en Etapa 1. El doctor puede hacer refresh
  // manual recargando la página para ver cambios recientes. (El botón "Sincronizar
  // calendario" NO es un refresh: envía las citas a Google Calendar.)
  // En FASE 5 se puede reimplementar via SSE o WebSocket en el backend.

  // ── Save availability to DB ──────────────────────────────────────────────

  async function saveSchedule() {
    setSaving(true);
    try {
      const res = await fetch('/api/doctor/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          slots: availSlots.map((s) => ({
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_enabled: s.is_enabled,
          })),
        }),
      });
      if (!res.ok) throw new Error('Error guardando');
      showToast({ type: 'success', message: 'Disponibilidad guardada' });
    } catch (e) {
      reportError('doctor/agenda', 'handleSaveAvailability', e);
      showToast({ type: 'error', message: 'Error al guardar' });
    }
    setSaving(false);
  }

  // ── Save booking horizon ─────────────────────────────────────────────────

  async function saveBookingHorizon() {
    const clamped = Math.max(1, Math.min(52, Math.round(bookingHorizonWeeks)));
    const clampedLead = Math.max(0, Math.min(90, Math.round(minLeadDays)));
    setSavingHorizon(true);
    try {
      const res = await fetch('/api/doctor/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...config,
            booking_horizon_weeks: clamped,
            booking_min_lead_days: clampedLead,
            booking_require_reason: requireReason,
          },
          slots: availSlots.map((s) => ({
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_enabled: s.is_enabled,
          })),
        }),
      });
      if (!res.ok) throw new Error('Error guardando configuración');
      setBookingHorizonWeeks(clamped);
      setMinLeadDays(clampedLead);
      showToast({ type: 'success', message: 'Configuración de booking actualizada' });
    } catch (e) {
      reportError('doctor/agenda', 'saveBookingHorizon', e);
      showToast({ type: 'error', message: 'Error al guardar configuración' });
    } finally {
      setSavingHorizon(false);
    }
  }

  // ── Accept / Reject appointments ────────────────────────────────────────

  /**
   * Busca el id de un paciente ya registrado por cédula o correo.
   * Se usa cuando el alta devuelve 409 (duplicado): el backend NO devuelve el id
   * del existente, así que hay que resolverlo con el buscador (match exacto por
   * hash de cédula/email).
   */
  async function findExistingPatientId(lookup: string | null): Promise<string | null> {
    if (!lookup?.trim()) return null;
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(lookup.trim())}`);
      if (!res.ok) return null;
      const json = await res.json();
      const items = Array.isArray(json?.data) ? json.data : [];
      return items[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  async function acceptAppointment(appt: PendingAppointment) {
    if (!doctorId) {
      showToast({
        type: 'error',
        message: 'Aún estamos cargando tu sesión. Intenta de nuevo en unos segundos.',
      });
      return;
    }
    setAccepting(appt.id);

    try {
      // Validate slot time
      const apptDate = new Date(appt.scheduled_at);
      const dayOfWeek = (apptDate.getDay() + 6) % 7; // 0=Monday
      const timeStr = toHHMM(apptDate);

      if (!isValidSlotTime(timeStr, dayOfWeek, availSlots, config)) {
        const validSlots = generateTimeSlots(dayOfWeek, availSlots, config);
        if (validSlots.length > 0) {
          showToast({
            type: 'error',
            message: `Horario ${timeStr} no es válido. Horarios disponibles: ${validSlots
              .slice(0, 5)
              .map((s) => s.time)
              .join(', ')}...`,
          });
        } else {
          showToast({
            type: 'error',
            message: `No hay horarios disponibles para ${DAYS_FULL[dayOfWeek]}`,
          });
        }
        setAccepting(null);
        return;
      }

      // Check for conflicts
      const conflict = allAppointments.find((a) => {
        if (a.date !== dateToYMD(apptDate)) return false;
        const aStart = timeToMinutes(a.time);
        const aEnd = timeToMinutes(a.endTime);
        const newStart = timeToMinutes(timeStr);
        const newEnd = newStart + config.slot_duration;
        return newStart < aEnd && newEnd > aStart;
      });

      if (conflict) {
        showToast({ type: 'error', message: `Conflicto: ya hay una cita a las ${conflict.time}` });
        setAccepting(null);
        return;
      }

      // Alta del paciente vía POST /api/patients.
      // El DTO del backend es snake_case y `.strict()`: mandar `fullName` (camelCase)
      // o sin `doctor_id` daba 400 SIEMPRE — este camino nunca llegó a funcionar.
      const patientRes = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // El backend lo sobreescribe con la identidad autenticada (anti-IDOR),
          // pero el schema lo exige.
          doctor_id: doctorId,
          full_name: appt.patient_name,
          phone: appt.patient_phone ?? undefined,
          email: appt.patient_email ?? undefined,
          cedula: appt.patient_cedula ?? undefined,
          source: 'booking',
        }),
      });
      const patientJson = await patientRes.json();

      let patientId: string | null = patientRes.ok ? (patientJson?.data?.id ?? null) : null;

      // 409 = el paciente ya está en su listado. El error no trae el id, así que
      // se resuelve buscándolo por cédula y, si no, por correo.
      if (!patientId && patientRes.status === 409) {
        patientId =
          (await findExistingPatientId(appt.patient_cedula)) ??
          (await findExistingPatientId(appt.patient_email));
      }

      if (!patientId) {
        throw new Error(
          patientJson?.error?.message ?? patientJson?.message ?? 'Error al registrar paciente',
        );
      }

      // Create consultation via route handler (thin-proxy → NestJS).
      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          appointment_id: appt.id,
          chief_complaint: appt.chief_complaint || 'Consulta agendada online',
          consultation_date: appt.scheduled_at,
          amount: appt.plan_price || 0,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error creando consulta');

      // Update local state
      setPendingAppointments((prev) => prev.filter((a) => a.id !== appt.id));
      const newAppt: CalendarAppointment = {
        id: result.consultation?.id || appt.id,
        // Bug 1 fix: DELETE cascades by appointment_id, not by the consultation id
        // stored in `id`. Without this, deleting a freshly-accepted cita gave 404.
        appointment_id: appt.id,
        patient_name: appt.patient_name,
        date: dateToYMD(apptDate),
        isoDate: appt.scheduled_at,
        time: timeStr,
        endTime: addMinutes(timeStr, config.slot_duration),
        chief_complaint: appt.chief_complaint ?? undefined,
        status: 'confirmed',
        source: 'consultation',
        consultation_code: result.code,
        appointment_code: appt.appointment_code,
        plan_name: appt.plan_name ?? undefined,
        plan_price: appt.plan_price ?? undefined,
        patient_phone: appt.patient_phone,
        patient_email: appt.patient_email,
      };
      setAllAppointments((prev) => [...prev, newAppt]);
      showToast({ type: 'success', message: `Consulta confirmada` });
    } catch (e: any) {
      showToast({ type: 'error', message: e.message || 'Error al aprobar' });
    }
    setAccepting(null);
  }

  async function rejectAppointment(apptId: string) {
    // MIGRATED: Supabase direct update → PUT /api/appointments/:id/status (NestJS backend).
    try {
      const res = await fetch(`/api/doctor/appointment-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: apptId, new_status: 'cancelled' }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast({ type: 'error', message: err?.error || 'Error al rechazar la cita' });
        return;
      }
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al rechazar la cita' });
      return;
    }
    setPendingAppointments((prev) => prev.filter((a) => a.id !== apptId));
    showToast({ type: 'success', message: 'Cita rechazada' });
  }

  async function handleUploadReceipt(apptId: string, file: File) {
    setUploadingReceipt(apptId);
    try {
      // MIGRATED: Supabase storage → POST /api/storage/upload (NestJS backend via BFF).
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', 'receipt');

      const uploadRes = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson?.error?.message ?? 'Error al subir comprobante');
      }

      const receiptUrl: string = uploadJson?.data?.url ?? '';

      // Persiste la URL en el appointment via route handler de appointment-status.
      // FASE 5: no hay endpoint PATCH /api/appointments/:id/receipt en Etapa 1;
      // el receipt_url se guarda solo en el payment si existe. Por ahora solo
      // actualizamos el estado local para reflejar el cambio en la UI.
      setPendingAppointments((prev) =>
        prev.map((a) => (a.id === apptId ? { ...a, payment_receipt_url: receiptUrl } : a)),
      );

      showToast({ type: 'success', message: 'Comprobante subido correctamente' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al subir comprobante';
      showToast({ type: 'error', message });
    }
    setUploadingReceipt(null);
  }

  async function confirmReschedule() {
    if (!rescheduling || !rescheduleDate || !rescheduleTime) return;
    try {
      const rescheduledDate = new Date(rescheduleDate + 'T' + rescheduleTime + ':00').toISOString();

      // Call API which updates appointment + consultation + Google Calendar
      const res = await fetch('/api/doctor/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: rescheduling.id, newDate: rescheduledDate }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al reagendar');
      }

      setPendingAppointments((prev) =>
        prev.map((a) => (a.id === rescheduling.id ? { ...a, scheduled_at: rescheduledDate } : a)),
      );
      showToast({ type: 'success', message: 'Cita reagendada (calendario actualizado)' });
      setRescheduling(null);
      setRescheduleDate(null);
      setRescheduleTime(null);
      setRescheduleWeekOffset(0);
    } catch (e: unknown) {
      reportError('doctor/agenda', 'handleReschedule', e);
      showToast({ type: 'error', message: e instanceof Error ? e.message : 'Error al reagendar' });
    }
  }

  // ── Google Calendar Sync ─────────────────────────────────────────────────

  async function handleCalendarSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/doctor/calendar-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult({ message: data.error || 'Error en sync', success: false });
        showToast({ type: 'error', message: data.error || 'Error al sincronizar' });
      } else {
        setSyncResult({ message: data.message, success: true });
        showToast({ type: 'success', message: data.message || 'Sincronización completada' });
        // Reload appointments to reflect changes
        loadData();
      }
    } catch (err: any) {
      setSyncResult({ message: err?.message || 'Error de conexión', success: false });
      showToast({ type: 'error', message: 'Error al sincronizar con Google Calendar' });
    }
    setSyncing(false);
    // Auto-hide result after 6 seconds
    setTimeout(() => setSyncResult(null), 6000);
  }

  // ── Delete appointment (cascade) ─────────────────────────────────────────

  async function deleteAppointmentCascade(appt: CalendarAppointment) {
    setDeletingAppt(appt.id);
    try {
      // The backend DELETE /api/appointments/:id cascades to the linked consultation,
      // so we always delete by the appointment row id (appointment_id). For a pure
      // appointment row, id === appointment_id.
      const apptId = appt.appointment_id ?? appt.id;
      const res = await fetch(`/api/doctor/appointments?id=${apptId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      // Remove from local state
      setAllAppointments((prev) => prev.filter((a) => a.id !== appt.id));
      setPendingAppointments((prev) => prev.filter((a) => a.id !== appt.id));
      setDetailAppt(null);
      setConfirmDelete(null);
      showToast({ type: 'success', message: 'Cita eliminada correctamente' });
    } catch (err: unknown) {
      reportError('doctor/agenda', 'handleDeleteAppointment', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al eliminar la cita',
      });
    }
    setDeletingAppt(null);
  }

  // ── Get appointments for a specific date ─────────────────────────────────

  function getApptsByDate(d: Date): CalendarAppointment[] {
    const ymd = dateToYMD(d);
    const pendingAsAppts: CalendarAppointment[] = pendingAppointments.map((p) => {
      const pd = new Date(p.scheduled_at);
      const timeStr = toHHMM(pd);
      return {
        id: p.id,
        patient_name: p.patient_name,
        date: dateToYMD(pd),
        isoDate: p.scheduled_at,
        time: timeStr,
        endTime: addMinutes(timeStr, config.slot_duration),
        chief_complaint: p.chief_complaint ?? undefined,
        status: 'scheduled' as const,
        source: 'appointment' as const,
        appointment_code: p.appointment_code,
        plan_name: p.plan_name ?? undefined,
        plan_price: p.plan_price ?? undefined,
        patient_phone: p.patient_phone,
        patient_email: p.patient_email,
        // F1 (2026-04-29): citas pendientes sin consulta -> payment_status null explicito.
        payment_status: null,
      };
    });
    // RONDA 25: dedupe por appointment_id (con fallback a id) para que una cita
    // que esta en `allAppointments` (como consultation) y en `pending` (como appointment)
    // no aparezca 2 veces. consultAppts.id ya es appointment_id desde ronda 25.
    const merged = [...allAppointments, ...pendingAsAppts];
    const dedupKey = (a: CalendarAppointment) => a.appointment_id || a.id;
    const unique = Array.from(new Map(merged.map((a) => [dedupKey(a), a])).values());
    // L2 (2026-04-29): combinacion de filtros de status (cita) + payment (consulta).
    return unique
      .filter((a) => a.date === ymd)
      .filter((a) => statusFilter === 'all' || a.status === statusFilter)
      .filter((a) => paymentFilter === 'all' || a.payment_status === paymentFilter)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  // Week appointments
  // RONDA 25: weekAppts antes era solo `allAppointments` que excluye status='scheduled'.
  // Las citas creadas desde el booking publico nacen como 'scheduled' y nunca aparecian
  // en la lista lateral "Citas de la semana". Ahora mergeamos con pendingAppointments
  // y deduplicamos por appointment_id (o id) para evitar el bug del doble-render.
  const weekAppts = (() => {
    const pendingAsAppts: CalendarAppointment[] = pendingAppointments.map((p) => {
      const pd = new Date(p.scheduled_at);
      const timeStr = toHHMM(pd);
      return {
        id: p.id,
        appointment_id: p.id,
        patient_name: p.patient_name,
        date: dateToYMD(pd),
        isoDate: p.scheduled_at,
        time: timeStr,
        endTime: addMinutes(timeStr, config.slot_duration),
        chief_complaint: p.chief_complaint ?? undefined,
        status: 'scheduled' as const,
        source: 'appointment' as const,
        appointment_code: p.appointment_code,
        plan_name: p.plan_name ?? undefined,
        plan_price: p.plan_price ?? undefined,
        patient_phone: p.patient_phone,
        patient_email: p.patient_email,
        // F1 (2026-04-29): citas pendientes sin consulta -> payment_status null explicito.
        payment_status: null,
      };
    });
    const merged = [...allAppointments, ...pendingAsAppts];
    return Array.from(new Map(merged.map((a) => [a.appointment_id || a.id, a])).values());
  })()
    .filter((a) => {
      const d = new Date(a.isoDate);
      return d >= weekDates[0] && d <= weekDates[6];
    })
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    // L2 (2026-04-29): aplicar tambien filtro de pago en la lista lateral semanal.
    .filter((a) => paymentFilter === 'all' || a.payment_status === paymentFilter);

  // ── Availability helpers ─────────────────────────────────────────────────

  function toggleSlot(idx: number) {
    setAvailSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, is_enabled: !s.is_enabled } : s)),
    );
  }
  function removeSlot(idx: number) {
    setAvailSlots((prev) => prev.filter((_, i) => i !== idx));
  }
  function addSlot(day: number) {
    setAvailSlots((prev) => [
      ...prev,
      { day_of_week: day, start_time: '09:00', end_time: '12:00', is_enabled: true },
    ]);
  }
  function updateSlotTime(idx: number, field: 'start_time' | 'end_time', value: string) {
    setAvailSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  async function createConsultaFromAgenda() {
    if (!newConsulta.patient_id || !newConsulta.date || !newConsulta.time) {
      showToast({ type: 'error', message: 'Completa paciente, fecha y hora' });
      return;
    }
    if (!newConsulta.plan_id) {
      showToast({ type: 'error', message: 'Selecciona un plan de consulta' });
      return;
    }
    setCreatingConsulta(true);
    try {
      const selectedPlan = pricingPlans.find((p) => p.id === newConsulta.plan_id);
      const consultationDate = new Date(`${newConsulta.date}T${newConsulta.time}:00`).toISOString();

      // Upload receipt if provided — MIGRATED: POST /api/storage/upload (NestJS backend).
      let receiptUrl: string | null = null;
      if (newReceiptFile) {
        try {
          const formData = new FormData();
          formData.append('file', newReceiptFile);
          formData.append('kind', 'receipt');
          const uploadRes = await fetch('/api/storage/upload', {
            method: 'POST',
            body: formData,
          });
          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            receiptUrl = uploadJson?.data?.url ?? null;
          }
        } catch {
          // si el upload falla se crea la consulta igual, sin comprobante
        }
      }

      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: newConsulta.patient_id,
          chief_complaint: newConsulta.reason || null,
          consultation_date: consultationDate,
          amount: selectedPlan?.price_usd || 0,
          plan_name: selectedPlan?.name || null,
          payment_method: newConsulta.payment_method || null,
          payment_reference: newConsulta.payment_reference || null,
          payment_receipt_url: receiptUrl,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al crear');
      showToast({ type: 'success', message: 'Consulta creada y agregada a la agenda' });
      setShowNewConsulta(false);
      setNewReceiptFile(null);
      setNewConsulta({
        patient_id: '',
        date: '',
        time: '',
        reason: '',
        plan_id: '',
        payment_method: '',
        payment_reference: '',
      });
      await loadData();
    } catch (err: unknown) {
      reportError('doctor/agenda', 'handleCreateConsulta', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al crear consulta',
      });
    } finally {
      setCreatingConsulta(false);
    }
  }

  // BUG-8: usar NewAppointmentFlow (acordeón estilo booking público) en lugar del modal inline
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newFlowSlotStart, setNewFlowSlotStart] = useState<string | undefined>(undefined);

  function openNewConsultaForDate(date: Date, time?: string) {
    const t = time || '09:00';
    const isoLocal = `${dateToYMD(date)}T${t}:00`;
    setNewFlowSlotStart(isoLocal);
    setShowNewFlow(true);
  }

  const prevMonth = () =>
    setMonthYear(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  const nextMonth = () =>
    setMonthYear(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );

  // ── Agenda KPIs (computed from the loaded appointment window) ───────────────
  // Horas de consulta, promedio de citas por día activo, y mejor día de la semana.
  // Excluye canceladas / no-asistió. Duración por cita = endTime - time (fallback slot).
  const agendaKpis = useMemo(() => {
    const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const toMin = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
      return (h || 0) * 60 + (m || 0);
    };
    const relevant = allAppointments.filter(
      (a) => a.status !== 'cancelled' && a.status !== 'no_show',
    );
    const fallback = config.slot_duration || 30;
    let totalMinutes = 0;
    const byDate = new Map<string, number>();
    const byWeekday = new Array<number>(7).fill(0);
    for (const a of relevant) {
      const dur = Math.max(0, toMin(a.endTime) - toMin(a.time)) || fallback;
      totalMinutes += dur;
      byDate.set(a.date, (byDate.get(a.date) ?? 0) + 1);
      // Weekday from the local date string (noon avoids timezone edge cases).
      const wd = new Date(`${a.date}T12:00:00`).getDay();
      if (wd >= 0 && wd <= 6) byWeekday[wd] += 1;
    }
    const distinctDays = byDate.size;
    let bestIdx = -1;
    let bestCount = 0;
    byWeekday.forEach((c, i) => {
      if (c > bestCount) {
        bestCount = c;
        bestIdx = i;
      }
    });
    return {
      count: relevant.length,
      totalHours: totalMinutes / 60,
      avgPerDay: distinctDays > 0 ? relevant.length / distinctDays : 0,
      bestDay: bestIdx >= 0 ? WEEKDAYS[bestIdx] : '—',
      bestDayCount: bestCount,
    };
  }, [allAppointments, config.slot_duration]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`.g-bg{background:linear-gradient(135deg,var(--dh-turquoise-700) 0%,var(--dh-turquoise) 100%)}.day-hover:hover { background: rgba(6,182,212,0.06); transition: background 0.2s; }`}</style>

      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1
              className="font-semibold tracking-tight"
              style={{
                fontFamily: 'var(--dh-font-display)',
                fontSize: 'clamp(22px, 3.2vw, 32px)',
                color: 'var(--dh-ink)',
              }}
            >
              Agenda
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-600)' }}>
              Citas cada {config.slot_duration} min
              {config.buffer_minutes > 0 && ` · ${config.buffer_minutes} min entre citas`}
              {' · '}
              {allAppointments.length} consultas
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCalendarSync}
              disabled={syncing}
              title="Enviar tus citas a Google Calendar"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
                syncing
                  ? 'bg-blue-50 border-blue-200 text-blue-500 cursor-wait'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {syncing ? 'Sincronizando…' : 'Sincronizar calendario'}
              </span>
            </button>
            <button
              onClick={() => openNewConsultaForDate(selectedDate)}
              className="flex items-center gap-2 px-4 py-2 g-bg text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva consulta
            </button>
          </div>
        </div>

        {/* Indicador de carga — la agenda trae las citas de forma asíncrona; sin esto
            el calendario se veía vacío mientras cargaba (parecía "sin citas"). */}
        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
            Cargando agenda…
          </div>
        )}

        {/* Agenda KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: 'var(--dh-turquoise)' }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Horas de consulta
              </p>
            </div>
            <p
              className="font-bold mt-1.5"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)', fontSize: 22 }}
            >
              {agendaKpis.totalHours.toLocaleString('es-VE', { maximumFractionDigits: 1 })} h
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{agendaKpis.count} citas</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: 'var(--dh-turquoise)' }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Promedio por día
              </p>
            </div>
            <p
              className="font-bold mt-1.5"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)', fontSize: 22 }}
            >
              {agendaKpis.avgPerDay.toLocaleString('es-VE', { maximumFractionDigits: 1 })}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">citas / día activo</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--dh-turquoise)' }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Mejor día
              </p>
            </div>
            <p
              className="font-bold mt-1.5"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)', fontSize: 22 }}
            >
              {agendaKpis.bestDay}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {agendaKpis.bestDayCount > 0 ? `${agendaKpis.bestDayCount} citas` : 'sin datos'}
            </p>
          </div>
        </div>

        {/* Sync result banner */}
        {syncResult && (
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
              syncResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {syncResult.success ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="flex-1">{syncResult.message}</span>
            <button onClick={() => setSyncResult(null)} className="opacity-50 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ═══ CALENDAR TAB ═══ */}
        {tab === 'calendar' && (
          <div className="space-y-4">
            {/* View toggle + nav */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                {(['week', 'month', 'day'] as CalendarView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setCalView(v);
                      if (v !== 'day') setSelectedDate(today);
                    }}
                    className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${calView === v ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    {v === 'week' ? 'Semana' : v === 'month' ? 'Mes' : 'Día'}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    if (calView === 'week') setWeekOffset((v) => v - 1);
                    else if (calView === 'month') prevMonth();
                    else setSelectedDate((d) => new Date(d.getTime() - 86400000));
                  }}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <p className="text-xs sm:text-sm font-semibold text-slate-700 min-w-[180px] sm:min-w-[220px] text-center">
                  {calView === 'week'
                    ? `${weekDates[0].toLocaleDateString('es-VE', { day: '2-digit', month: 'long' })} – ${weekDates[6].toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`
                    : calView === 'month'
                      ? `${MONTHS_ES[monthYear.month]} ${monthYear.year}`
                      : selectedDate.toLocaleDateString('es-VE', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                </p>
                <button
                  onClick={() => {
                    if (calView === 'week') setWeekOffset((v) => v + 1);
                    else if (calView === 'month') nextMonth();
                    else setSelectedDate((d) => new Date(d.getTime() + 86400000));
                  }}
                  className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <button
                onClick={() => {
                  setWeekOffset(0);
                  setMonthYear({ year: today.getFullYear(), month: today.getMonth() });
                  setSelectedDate(today);
                }}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 px-3 py-1 rounded-lg hover:bg-teal-50 transition-colors shrink-0"
              >
                Hoy
              </button>
            </div>

            {/* F1 (2026-04-29): solo se muestran chips para Agendadas y Confirmadas.
                Quitamos Rechazadas/Asistió/No asistió porque confundían al usuario
                al combinarse con el filtro de pago. Las citas en otros estados
                siguen visibles cuando statusFilter='all'. */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  {
                    key: 'all',
                    label: 'Todas',
                    active: 'bg-slate-800 text-white border-slate-800',
                  },
                  {
                    key: 'scheduled',
                    label: 'Agendadas',
                    active: 'bg-amber-500 text-white border-amber-500',
                  },
                  {
                    key: 'confirmed',
                    label: 'Confirmadas',
                    active: 'bg-teal-500  text-white border-teal-500',
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    statusFilter === f.key
                      ? f.active
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* L2 (2026-04-29): filtros de pago en una segunda fila para que se distingan
                visualmente de los filtros de status de cita/consulta. */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mr-1">
                Pago:
              </span>
              {(
                [
                  {
                    key: 'all',
                    label: 'Todos',
                    active: 'bg-slate-800   text-white border-slate-800',
                  },
                  {
                    key: 'approved',
                    label: 'Pago aprobado',
                    active: 'bg-emerald-500 text-white border-emerald-500',
                  },
                  {
                    key: 'pending',
                    label: 'Pago pendiente',
                    active: 'bg-amber-500   text-white border-amber-500',
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPaymentFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    paymentFilter === f.key
                      ? f.active
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* WEEK VIEW */}
            {calView === 'week' && (
              <>
                <div className="grid grid-cols-7 gap-1 sm:gap-2 pb-2">
                  {weekDates.map((date, idx) => {
                    const isToday = date.toDateString() === today.toDateString();
                    const dayAppts = getApptsByDate(date);
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setCalView('day');
                          setSelectedDate(date);
                        }}
                        className={`rounded-lg sm:rounded-xl border p-2 sm:p-3 min-h-[100px] sm:min-h-[120px] cursor-pointer text-left day-hover ${isToday ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="mb-2">
                          <p
                            className={`text-xs font-semibold ${isToday ? 'text-teal-600' : 'text-slate-400'}`}
                          >
                            {DAYS_SHORT[idx]}
                          </p>
                          <p
                            className={`text-lg font-bold ${isToday ? 'text-teal-700' : 'text-slate-800'}`}
                          >
                            {date.getDate()}
                          </p>
                        </div>
                        {dayAppts.slice(0, 3).map((a) => (
                          <div
                            key={a.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailAppt(a);
                            }}
                            className={`mb-1 rounded px-1.5 py-0.5 cursor-pointer text-left ${a.status === 'scheduled' ? 'bg-amber-400 hover:bg-amber-500' : 'bg-teal-500 hover:bg-teal-600'}`}
                          >
                            <p className="text-white text-[9px] font-bold">{a.time}</p>
                            <p className="text-white/90 text-[9px] truncate">{a.patient_name}</p>
                          </div>
                        ))}
                        {dayAppts.length > 3 && (
                          <p className="text-[9px] text-slate-400 font-semibold">
                            +{dayAppts.length - 3} más
                          </p>
                        )}
                        {dayAppts.length === 0 && (
                          <p className="text-xs text-slate-300 mt-1">Sin citas</p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {!loading && weekAppts.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Citas de la semana ({weekAppts.length})
                      </p>
                    </div>
                    {weekAppts
                      .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
                      .map((a, i) => (
                        <div
                          key={a.id}
                          className={`flex items-center gap-4 px-5 py-3.5 ${i < weekAppts.length - 1 ? 'border-b border-slate-100' : ''} hover:bg-slate-50 cursor-pointer`}
                          onClick={() => setDetailAppt(a)}
                        >
                          <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{a.patient_name}</p>
                            <p className="text-xs text-slate-400 truncate">
                              {new Date(a.isoDate).toLocaleDateString('es-VE', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              })}{' '}
                              · {a.time}–{a.endTime}
                              {a.consultation_code && ` · ${a.consultation_code}`}
                              {a.chief_complaint && ` · ${a.chief_complaint}`}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full shrink-0">
                            {a.time}–{a.endTime}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}

            {/* MONTH VIEW */}
            {calView === 'month' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {DAYS_SHORT.map((d) => (
                    <div
                      key={d}
                      className="px-2 py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-widest"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthCells.map((date, idx) => {
                    if (!date)
                      return (
                        <div
                          key={`e-${idx}`}
                          className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/50"
                        />
                      );
                    const isToday = date.toDateString() === today.toDateString();
                    const dayAppts = getApptsByDate(date);
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setCalView('day');
                          setSelectedDate(date);
                        }}
                        className={`min-h-[90px] border-b border-r border-slate-100 p-2 cursor-pointer day-hover text-left ${isToday ? 'bg-teal-50' : ''} ${date.getMonth() !== monthYear.month ? 'opacity-40' : ''}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-1 ${isToday ? 'g-bg text-white' : 'text-slate-700'}`}
                        >
                          {date.getDate()}
                        </div>
                        {dayAppts.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailAppt(a);
                            }}
                            className={`mb-0.5 rounded px-1.5 py-0.5 w-full text-left ${a.status === 'scheduled' ? 'bg-amber-400' : 'bg-teal-500'}`}
                          >
                            <p className="text-white text-[9px] font-bold truncate">
                              {a.time} {a.patient_name}
                            </p>
                          </div>
                        ))}
                        {dayAppts.length > 2 && (
                          <p className="text-[9px] text-slate-400 font-semibold">
                            +{dayAppts.length - 2} más
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DAY VIEW — Shows real time slots based on availability config */}
            {calView === 'day' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                    Horario del día
                  </p>
                  <p className="text-xs text-slate-400">
                    Citas de {config.slot_duration} min
                    {config.buffer_minutes > 0 && ` + ${config.buffer_minutes} min descanso`}
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {(() => {
                    const dayOfWeek = (selectedDate.getDay() + 6) % 7;
                    const timeSlots = generateTimeSlots(dayOfWeek, availSlots, config);
                    const dayAppts = getApptsByDate(selectedDate);

                    // RONDA 26: si no hay slots configurados PERO hay citas registradas para ese dia
                    // (ej. el doctor desactivo el dia despues de agendar, o el booking publico
                    // creo citas en hora libre), mostramos las citas igual. Antes se decia
                    // "No hay horarios configurados" y las citas quedaban invisibles.
                    if (timeSlots.length === 0 && dayAppts.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <Calendar className="w-10 h-10 text-slate-200 mb-3" />
                          <p className="text-slate-400 text-sm">
                            No hay horarios configurados para {DAYS_FULL[dayOfWeek]}
                          </p>
                          <a
                            href="/doctor/offices"
                            className="mt-3 text-xs text-teal-600 font-semibold hover:text-teal-700 inline-block"
                          >
                            Configurar en Consultorios
                          </a>
                        </div>
                      );
                    }
                    if (timeSlots.length === 0 && dayAppts.length > 0) {
                      // No hay slots pero SI hay citas — listamos las citas con su hora real.
                      return (
                        <>
                          <div className="bg-amber-50 border-b-2 border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-800">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>
                              No tienes horarios configurados para {DAYS_FULL[dayOfWeek]}, pero hay{' '}
                              {dayAppts.length} cita{dayAppts.length !== 1 ? 's' : ''} registrada
                              {dayAppts.length !== 1 ? 's' : ''} para este dia.
                            </span>
                          </div>
                          {dayAppts.map((a) => {
                            const sty = getApptStyle(a.status);
                            const Icon = sty.Icon;
                            return (
                              <button
                                key={a.id}
                                onClick={() => setDetailAppt(a)}
                                className="w-full text-left p-4 border-t border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-3"
                              >
                                <div className="w-20 text-center shrink-0">
                                  <p className="text-sm font-bold text-slate-700">{a.time}</p>
                                  <p className="text-[10px] text-slate-400">{a.endTime}</p>
                                </div>
                                <div className={`flex-1 rounded-lg p-3 border ${sty.card}`}>
                                  <div className="flex items-center justify-between">
                                    <p className={`text-sm flex items-center gap-1.5 ${sty.title}`}>
                                      <Icon className="w-3.5 h-3.5" />
                                      {a.patient_name}
                                    </p>
                                    {a.appointment_code && (
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {a.appointment_code}
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-xs mt-0.5 ${sty.subtitle}`}>
                                    {a.chief_complaint || sty.badgeLabel}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      );
                    }

                    // RONDA 23: una cita "calza" en un slot si su hora cae DENTRO del rango
                    // [slot.time, slot.endTime). Antes el match era exacto por string ("09:00" === "09:00")
                    // y citas a 09:30 con slots cada 60min desaparecian del dia.
                    // Tambien identificamos las "huerfanas" (no caen en NINGUN slot) para mostrarlas aparte.
                    const slotMinutes = (s: string) => {
                      const [h, m] = s.split(':').map(Number);
                      return h * 60 + m;
                    };
                    const matchedApptIds = new Set<string>();
                    const findApptForSlot = (slot: { time: string; endTime: string }) => {
                      const slotStart = slotMinutes(slot.time);
                      const slotEnd = slotMinutes(slot.endTime);
                      return dayAppts.find((a) => {
                        const apptMin = slotMinutes(a.time);
                        return apptMin >= slotStart && apptMin < slotEnd;
                      });
                    };

                    return (
                      <>
                        {timeSlots.map((slot) => {
                          const slotAppt = findApptForSlot(slot);
                          if (slotAppt) matchedApptIds.add(slotAppt.id);
                          const isPast =
                            new Date(`${dateToYMD(selectedDate)}T${slot.time}`) < new Date();

                          // Bug 4 fix: check if this slot overlaps any availability block.
                          // Overlap: slotStart < blockEnd AND slotEnd > blockStart.
                          // Both endpoints converted to Caracas (UTC-4) timestamps for
                          // exact comparison — same convention used throughout the file.
                          const slotStartMs = new Date(
                            `${dateToYMD(selectedDate)}T${slot.time}:00-04:00`,
                          ).getTime();
                          const slotEndMs = new Date(
                            `${dateToYMD(selectedDate)}T${slot.endTime}:00-04:00`,
                          ).getTime();
                          const isBlocked = calendarBlocks.some((b) => {
                            const bStart = new Date(b.starts_at).getTime();
                            const bEnd = new Date(b.ends_at).getTime();
                            return slotStartMs < bEnd && slotEndMs > bStart;
                          });

                          return (
                            <div
                              key={slot.time}
                              className={`p-4 ${isPast ? 'opacity-50' : ''} hover:bg-slate-50 transition-colors`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-20 text-center shrink-0">
                                  <p className="text-sm font-bold text-slate-700">{slot.time}</p>
                                  <p className="text-[10px] text-slate-400">{slot.endTime}</p>
                                </div>
                                <div className="flex-1">
                                  {slotAppt ? (
                                    (() => {
                                      // RONDA 19c — usa helper unificado para todos los status
                                      const sty = getApptStyle(slotAppt.status);
                                      const Icon = sty.Icon;
                                      return (
                                        <button
                                          onClick={() => setDetailAppt(slotAppt)}
                                          className={`w-full text-left rounded-lg p-3 border transition-colors ${sty.card}`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <p
                                              className={`text-sm flex items-center gap-1.5 ${sty.title}`}
                                            >
                                              <Icon className="w-3.5 h-3.5" />
                                              {slotAppt.patient_name}
                                            </p>
                                            {slotAppt.consultation_code && (
                                              <span className="text-[10px] font-mono text-slate-400">
                                                {slotAppt.consultation_code}
                                              </span>
                                            )}
                                          </div>
                                          <p className={`text-xs mt-0.5 ${sty.subtitle}`}>
                                            {slotAppt.chief_complaint || sty.badgeLabel}
                                          </p>
                                        </button>
                                      );
                                    })()
                                  ) : isBlocked ? (
                                    // Bug 4 fix: show blocked indicator instead of "Disponible"
                                    <div className="w-full h-12 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center gap-2">
                                      <CalendarX className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="text-xs text-slate-400 font-medium">
                                        Bloqueado
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        openNewConsultaForDate(selectedDate, slot.time)
                                      }
                                      className="w-full h-12 rounded-lg border border-dashed border-slate-200 flex items-center justify-center hover:border-teal-300 hover:bg-teal-50/50 transition-all group cursor-pointer"
                                    >
                                      <span className="text-xs text-slate-300 group-hover:hidden">
                                        Disponible
                                      </span>
                                      <span className="text-xs text-teal-500 font-medium hidden group-hover:flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Agendar consulta
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* RONDA 23 — Citas que NO calzaron en ningun slot configurado.
                        Se muestran al final para que el doctor las vea aunque su
                        consultorio tenga otra cuadricula horaria. */}
                        {(() => {
                          const orphans = dayAppts.filter((a) => !matchedApptIds.has(a.id));
                          if (orphans.length === 0) return null;
                          return (
                            <div className="bg-amber-50 border-t-2 border-amber-200">
                              <div className="px-4 py-2 text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Citas fuera de tu cuadrícula ({orphans.length})
                              </div>
                              {orphans.map((a) => {
                                const sty = getApptStyle(a.status);
                                const Icon = sty.Icon;
                                return (
                                  <button
                                    key={a.id}
                                    onClick={() => setDetailAppt(a)}
                                    className={`w-full text-left p-4 border-t border-amber-100 hover:bg-amber-100 transition-colors flex items-center gap-3`}
                                  >
                                    <div className="w-20 text-center shrink-0">
                                      <p className="text-sm font-bold text-slate-700">{a.time}</p>
                                      <p className="text-[10px] text-slate-400">{a.endTime}</p>
                                    </div>
                                    <div className={`flex-1 rounded-lg p-3 border ${sty.card}`}>
                                      <div className="flex items-center justify-between">
                                        <p
                                          className={`text-sm flex items-center gap-1.5 ${sty.title}`}
                                        >
                                          <Icon className="w-3.5 h-3.5" />
                                          {a.patient_name}
                                        </p>
                                        {a.appointment_code && (
                                          <span className="text-[10px] font-mono text-slate-400">
                                            {a.appointment_code}
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-xs mt-0.5 ${sty.subtitle}`}>
                                        {a.chief_complaint || sty.badgeLabel}
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ DISPONIBILIDAD — bloqueos + horizonte de booking ═══ */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setShowAvailabilityPanel((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <CalendarX className="w-4 h-4 text-teal-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Disponibilidad</p>
                <p className="text-xs text-slate-500 mt-0.5">Bloqueos · Horizonte de booking</p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${showAvailabilityPanel ? 'rotate-180' : ''}`}
            />
          </button>

          {showAvailabilityPanel && (
            <div className="px-5 pb-5 space-y-6 border-t border-slate-100">
              {/* Horizonte de semanas */}
              <div className="pt-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Semanas visibles en el booking
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Los pacientes podrán agendar citas hasta este número de semanas en el futuro.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={horizonStr}
                      onChange={(e) => setHorizonStr(e.target.value)}
                      onBlur={() => {
                        const v = parseInt(horizonStr, 10);
                        if (!isNaN(v) && v >= 1 && v <= 52) {
                          setBookingHorizonWeeks(v);
                        } else {
                          // Reset to the last valid value (or default) on invalid input
                          setHorizonStr(String(bookingHorizonWeeks));
                        }
                      }}
                      className="w-16 text-center text-sm font-semibold text-slate-800 bg-transparent outline-none border-none"
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">semanas</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    ({bookingHorizonWeeks * 7} días · mín. 1, máx. 52)
                  </span>
                  <button
                    onClick={saveBookingHorizon}
                    disabled={savingHorizon}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 text-white text-xs font-semibold rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors ml-auto"
                  >
                    {savingHorizon ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {savingHorizon ? 'Guardando…' : 'Guardar todo'}
                  </button>
                </div>
              </div>

              {/* Días de anticipación mínima */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Días de anticipación mínima
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Los pacientes solo podrán agendar con al menos N día(s) de anticipación.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={leadStr}
                      onChange={(e) => setLeadStr(e.target.value)}
                      onBlur={() => {
                        const v = parseInt(leadStr, 10);
                        if (!isNaN(v) && v >= 0 && v <= 90) {
                          setMinLeadDays(v);
                        } else {
                          setLeadStr(String(minLeadDays));
                        }
                      }}
                      className="w-16 text-center text-sm font-semibold text-slate-800 bg-transparent outline-none border-none"
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">día(s)</span>
                  </div>
                  <span className="text-xs text-slate-400">(0 = sin restricción · máx. 90)</span>
                </div>
              </div>

              {/* Requerir motivo de consulta */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Requerir motivo de consulta
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Si está activo, el paciente deberá indicar el motivo al agendar.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={requireReason}
                  onClick={() => setRequireReason((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    requireReason ? 'bg-teal-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      requireReason ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Divisor */}
              <div className="border-t border-slate-100" />

              {/* Bloqueos */}
              <AvailabilityBlocks />
            </div>
          )}
        </div>

        {/* ═══ APPOINTMENT DETAIL MODAL ═══
             Extraído a AppointmentDetailModal (agosto 2026).
             Hace su propio fetch a GET /api/doctor/appointments/:id para obtener
             el teléfono completo y no muestra appointment_code. */}
        {detailAppt && (
          <AppointmentDetailModal
            appointmentId={detailAppt.appointment_id ?? detailAppt.id}
            onClose={() => setDetailAppt(null)}
            onChanged={() => {
              void loadData();
            }}
            onReschedule={(req: RescheduleRequest) => {
              setRescheduling({
                id: req.id,
                patient_name: req.patientName,
                patient_phone: req.patientPhone,
                patient_email: req.patientEmail,
                patient_cedula: req.patientCedula,
                scheduled_at: req.scheduledAt,
                chief_complaint: req.chiefComplaint,
                plan_name: req.planName,
                plan_price: req.planPrice,
                status: req.status,
              });
              setDetailAppt(null);
            }}
          />
        )}

        {/* ═══ STATUS ACTION MODAL (marcar atendida / cancelar / no asistió) ═══ */}
        {statusAction &&
          (() => {
            const cfg = {
              completed: {
                title: 'Marcar como atendida',
                desc: 'La cita se contará como ingreso y quedará cerrada.',
                accent: 'emerald',
                btnLabel: 'Confirmar',
                showReason: false,
                successMsg: 'Cita marcada como atendida',
              },
              cancelled: {
                title: 'Cancelar cita',
                desc: 'Si la cita usaba un paquete prepagado, la sesión se restituirá automáticamente.',
                accent: 'red',
                btnLabel: 'Cancelar cita',
                showReason: true,
                successMsg: 'Cita cancelada',
              },
              no_show: {
                title: 'Paciente no asistió',
                desc: 'Se registrará como "no asistió". Si era un paquete, NO se restituye la sesión.',
                accent: 'orange',
                btnLabel: 'Registrar no-asistencia',
                showReason: false,
                successMsg: 'No-asistencia registrada',
              },
            }[statusAction.type];

            return (
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
                onClick={() => !statusSaving && setStatusAction(null)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        cfg.accent === 'emerald'
                          ? 'bg-emerald-100 text-emerald-600'
                          : cfg.accent === 'red'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-orange-100 text-orange-600'
                      }`}
                    >
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{cfg.title}</h2>
                      <p className="text-xs text-slate-500">{statusAction.appt.patient_name}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">{cfg.desc}</p>

                  {cfg.showReason && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Razón (opcional)
                      </label>
                      <textarea
                        value={statusReason}
                        onChange={(e) => setStatusReason(e.target.value)}
                        rows={2}
                        placeholder="Ej: el paciente reagendó"
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-teal-400 outline-none"
                      />
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setStatusAction(null);
                        setStatusReason('');
                      }}
                      disabled={statusSaving}
                      className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        setStatusSaving(true);
                        try {
                          // Si la fila del calendario viene de consultations, resolver appointment_id real
                          const apptId = statusAction.appt.appointment_id || statusAction.appt.id;
                          const r = await fetch('/api/doctor/appointment-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              appointment_id: apptId,
                              new_status: statusAction.type,
                              reason: statusReason || undefined,
                            }),
                          });
                          const j = await r.json();
                          if (!r.ok) throw new Error(j.error || 'Error');
                          setStatusAction(null);
                          setStatusReason('');
                          setDetailAppt(null);
                          showToast({ type: 'success', message: cfg.successMsg });
                          await loadData();
                        } catch (e: any) {
                          showToast({ type: 'error', message: e.message || 'Error al actualizar' });
                        } finally {
                          setStatusSaving(false);
                        }
                      }}
                      disabled={statusSaving}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${
                        cfg.accent === 'emerald'
                          ? 'bg-emerald-500 hover:bg-emerald-600'
                          : cfg.accent === 'red'
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-orange-500 hover:bg-orange-600'
                      }`}
                    >
                      {statusSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      {cfg.btnLabel}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Eliminar cita</h2>
              </div>
              <p className="text-sm text-slate-600">
                ¿Estás seguro de eliminar la cita de{' '}
                <span className="font-bold">{confirmDelete.patient_name}</span> del{' '}
                {new Date(confirmDelete.isoDate).toLocaleDateString('es-VE')} a las{' '}
                {confirmDelete.time}?
              </p>
              <p className="text-xs text-slate-400">
                Se eliminará la cita, consulta vinculada, historial clínico, recetas y el evento de
                Google Calendar asociado.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteAppointmentCascade(confirmDelete)}
                  disabled={deletingAppt === confirmDelete.id}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingAppt === confirmDelete.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {deletingAppt === confirmDelete.id ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESCHEDULE MODAL ═══ */}
        {rescheduling &&
          (() => {
            // Generate next 21 days excluding Sundays
            const rDates: string[] = [];
            const rToday = new Date();
            for (let d = 1; d <= 30 && rDates.length < 21; d++) {
              const dt = new Date(rToday);
              dt.setDate(rToday.getDate() + d);
              if (dt.getDay() === 0) continue;
              rDates.push(dateToYMD(dt));
            }
            const rWeekDates = rDates.slice(rescheduleWeekOffset * 5, rescheduleWeekOffset * 5 + 5);

            // Generate slots for selected date
            let rSlots: { time: string; endTime: string }[] = [];
            if (rescheduleDate) {
              const rDateObj = new Date(rescheduleDate + 'T12:00:00');
              const dayOfWeek = (rDateObj.getDay() + 6) % 7;
              rSlots = generateTimeSlots(dayOfWeek, availSlots, config);
            }

            // Check which slots are already booked
            const isRescheduleSlotBooked = (date: string, time: string): boolean => {
              return allAppointments.some((a) => {
                if (a.id === rescheduling.id) return false; // Exclude current appointment
                if (a.date !== date) return false;
                const aStart = timeToMinutes(a.time);
                const aEnd = timeToMinutes(a.endTime);
                const newStart = timeToMinutes(time);
                const newEnd = newStart + config.slot_duration;
                return newStart < aEnd && newEnd > aStart;
              });
            };

            return (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Reagendar cita</h2>
                    <button
                      onClick={() => {
                        setRescheduling(null);
                        setRescheduleDate(null);
                        setRescheduleTime(null);
                        setRescheduleWeekOffset(0);
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold">Paciente:</span> {rescheduling.patient_name}
                    </p>
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold">Actual:</span>{' '}
                      {new Date(rescheduling.scheduled_at).toLocaleDateString('es-VE')} ·{' '}
                      {toHHMM(new Date(rescheduling.scheduled_at))}
                    </p>
                  </div>

                  {/* Date picker - week navigation */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Selecciona la fecha
                    </p>
                    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <button
                        onClick={() =>
                          setRescheduleWeekOffset(Math.max(0, rescheduleWeekOffset - 1))
                        }
                        disabled={rescheduleWeekOffset === 0}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <span className="text-xs font-semibold text-slate-600">
                        {rWeekDates.length > 0 &&
                          new Date(rWeekDates[0] + 'T12:00:00').toLocaleDateString('es-VE', {
                            day: 'numeric',
                            month: 'short',
                          }) +
                            ' — ' +
                            new Date(
                              rWeekDates[rWeekDates.length - 1] + 'T12:00:00',
                            ).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
                      </span>
                      <button
                        onClick={() => setRescheduleWeekOffset(rescheduleWeekOffset + 1)}
                        disabled={(rescheduleWeekOffset + 1) * 5 >= rDates.length}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </div>

                    {/* Date cards */}
                    <div className="grid grid-cols-5 gap-2">
                      {rWeekDates.map((date) => {
                        const d = new Date(date + 'T12:00:00');
                        const dayName = d.toLocaleDateString('es-VE', { weekday: 'short' });
                        const dayNum = d.getDate();
                        const monthName = d.toLocaleDateString('es-VE', { month: 'short' });
                        const isSel = rescheduleDate === date;
                        const dayOfWeek = (d.getDay() + 6) % 7;
                        const daySlots = generateTimeSlots(dayOfWeek, availSlots, config);
                        const availCount = daySlots.filter(
                          (s) => !isRescheduleSlotBooked(date, s.time),
                        ).length;

                        return (
                          <button
                            key={date}
                            onClick={() => {
                              setRescheduleDate(date);
                              setRescheduleTime(null);
                            }}
                            className={`rounded-xl p-2.5 text-center transition-all ${
                              isSel
                                ? 'bg-teal-500 text-white shadow-md'
                                : availCount === 0
                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-white border border-slate-200 hover:border-teal-300 text-slate-700'
                            }`}
                            disabled={availCount === 0}
                          >
                            <p
                              className={`text-[10px] font-semibold uppercase ${isSel ? 'text-white/80' : 'text-slate-400'}`}
                            >
                              {dayName}
                            </p>
                            <p className={`text-lg font-bold ${isSel ? 'text-white' : ''}`}>
                              {dayNum}
                            </p>
                            <p
                              className={`text-[10px] ${isSel ? 'text-white/70' : 'text-slate-400'}`}
                            >
                              {monthName}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time slots for selected date */}
                  {rescheduleDate && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Horarios disponibles —{' '}
                        {new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-VE', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      {rSlots.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">
                          No hay horarios configurados para este día
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {rSlots.map((slot) => {
                            const booked = isRescheduleSlotBooked(rescheduleDate, slot.time);
                            const isSel = rescheduleTime === slot.time;
                            return (
                              <button
                                key={slot.time}
                                onClick={() => {
                                  if (!booked) setRescheduleTime(slot.time);
                                }}
                                disabled={booked}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                  booked
                                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                                    : isSel
                                      ? 'bg-teal-500 text-white shadow-md'
                                      : 'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600'
                                }`}
                              >
                                {slot.time}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selection summary */}
                  {rescheduleDate && rescheduleTime && (
                    <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
                      <span className="font-semibold">Nueva cita:</span>{' '}
                      {new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-VE', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      a las {rescheduleTime}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setRescheduling(null);
                        setRescheduleDate(null);
                        setRescheduleTime(null);
                        setRescheduleWeekOffset(0);
                      }}
                      className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmReschedule}
                      disabled={!rescheduleDate || !rescheduleTime}
                      className="flex-1 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-50"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* ═══ NUEVA CONSULTA MODAL ═══ */}
        {showNewConsulta &&
          (() => {
            // Generate available dates (next 30 days)
            const ncDates: string[] = [];
            const ncToday = new Date();
            // Include today
            ncDates.push(dateToYMD(ncToday));
            for (let d = 1; d <= 30; d++) {
              const dt = new Date(ncToday);
              dt.setDate(ncToday.getDate() + d);
              ncDates.push(dateToYMD(dt));
            }

            // Generate time slots for the selected date
            let ncSlots: { time: string; endTime: string }[] = [];
            if (newConsulta.date) {
              const ncDateObj = new Date(newConsulta.date + 'T12:00:00');
              const dayOfWeek = (ncDateObj.getDay() + 6) % 7;
              ncSlots = generateTimeSlots(dayOfWeek, availSlots, config);
            }

            // Check which slots are already booked
            const isSlotBooked = (date: string, time: string): boolean => {
              return [
                ...allAppointments,
                ...pendingAppointments.map((p) => {
                  const pd = new Date(p.scheduled_at);
                  return {
                    date: dateToYMD(pd),
                    time: toHHMM(pd),
                    endTime: addMinutes(toHHMM(pd), config.slot_duration),
                  };
                }),
              ].some((a) => {
                if (a.date !== date) return false;
                const aStart = timeToMinutes(a.time);
                const aEnd = timeToMinutes(a.endTime);
                const newStart = timeToMinutes(time);
                const newEnd = newStart + config.slot_duration;
                return newStart < aEnd && newEnd > aStart;
              });
            };

            // Patient search
            const filteredPatients = patients.filter((p) =>
              p.full_name.toLowerCase().includes(searchText.toLowerCase()),
            );

            return (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                        <Stethoscope className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-lg font-bold text-slate-900">Nueva consulta</h2>
                    </div>
                    <button
                      onClick={() => {
                        setShowNewConsulta(false);
                        setSearchText('');
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Step 1: Select patient */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Paciente
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar paciente..."
                        value={
                          newConsulta.patient_id
                            ? patients.find((p) => p.id === newConsulta.patient_id)?.full_name ||
                              searchText
                            : searchText
                        }
                        onChange={(e) => {
                          setSearchText(e.target.value);
                          if (newConsulta.patient_id)
                            setNewConsulta((prev) => ({ ...prev, patient_id: '' }));
                        }}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      />
                      {newConsulta.patient_id && (
                        <button
                          onClick={() => {
                            setNewConsulta((prev) => ({ ...prev, patient_id: '' }));
                            setSearchText('');
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {!newConsulta.patient_id && searchText.length > 0 && (
                      <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto">
                        {filteredPatients.length === 0 ? (
                          <p className="text-xs text-slate-400 p-3 text-center">
                            No se encontró paciente
                          </p>
                        ) : (
                          filteredPatients.slice(0, 8).map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setNewConsulta((prev) => ({ ...prev, patient_id: p.id }));
                                setSearchText('');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm text-slate-700 border-b border-slate-100 last:border-b-0 flex items-center justify-between"
                            >
                              <span className="font-medium">{p.full_name}</span>
                              {p.phone && <span className="text-xs text-slate-400">{p.phone}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {newConsulta.patient_id && (
                      <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4 text-teal-500" />
                        <span className="text-sm font-semibold text-teal-700">
                          {patients.find((p) => p.id === newConsulta.patient_id)?.full_name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Select date */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={newConsulta.date}
                      min={dateToYMD(new Date())}
                      onChange={(e) =>
                        setNewConsulta((prev) => ({ ...prev, date: e.target.value, time: '' }))
                      }
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>

                  {/* Step 3: Select time slot */}
                  {newConsulta.date && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Horario —{' '}
                        {new Date(newConsulta.date + 'T12:00:00').toLocaleDateString('es-VE', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </label>
                      {ncSlots.length === 0 ? (
                        <div className="bg-slate-50 rounded-lg p-4 text-center">
                          <p className="text-sm text-slate-400">
                            No hay horarios configurados para este día
                          </p>
                          <a
                            href="/doctor/offices"
                            className="text-xs text-teal-600 font-semibold hover:text-teal-700 mt-1 inline-block"
                          >
                            Configurar en Consultorios
                          </a>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {ncSlots.map((slot) => {
                            const booked = isSlotBooked(newConsulta.date, slot.time);
                            const isSel = newConsulta.time === slot.time;
                            return (
                              <button
                                key={slot.time}
                                onClick={() => {
                                  if (!booked)
                                    setNewConsulta((prev) => ({ ...prev, time: slot.time }));
                                }}
                                disabled={booked}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                  booked
                                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                                    : isSel
                                      ? 'bg-teal-500 text-white shadow-md'
                                      : 'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600'
                                }`}
                              >
                                {slot.time}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 4: Select plan */}
                  {newConsulta.time && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Plan de consulta <span className="text-red-400">*</span>
                      </label>
                      {pricingPlans.length === 0 ? (
                        <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                          No tienes planes configurados.{' '}
                          <a href="/doctor/services" className="font-bold underline">
                            Configura tus servicios
                          </a>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          {pricingPlans.map((plan) => (
                            <button
                              key={plan.id}
                              onClick={() =>
                                setNewConsulta((prev) => ({ ...prev, plan_id: plan.id }))
                              }
                              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                                newConsulta.plan_id === plan.id
                                  ? 'border-teal-400 bg-teal-50'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-800">
                                  {plan.name}
                                </span>
                                <span className="text-sm font-bold text-teal-600">
                                  ${plan.price_usd.toFixed(2)}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400">
                                {plan.duration_minutes} min
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 5: Payment method + reference */}
                  {newConsulta.plan_id && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Método de pago <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={newConsulta.payment_method}
                          onChange={(e) =>
                            setNewConsulta((prev) => ({ ...prev, payment_method: e.target.value }))
                          }
                          className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                        >
                          <option value="">-- Selecciona método de pago --</option>
                          {[
                            { value: 'efectivo', label: 'Efectivo USD' },
                            { value: 'efectivo_bs', label: 'Efectivo Bs' },
                            { value: 'pago_movil', label: 'Pago Móvil' },
                            { value: 'transferencia', label: 'Transferencia' },
                            { value: 'zelle', label: 'Zelle' },
                            { value: 'binance', label: 'Binance' },
                            { value: 'pos', label: 'POS / Punto de venta' },
                            { value: 'seguro', label: 'Seguro' },
                          ]
                            .filter(
                              (m) =>
                                doctorPaymentMethods.length === 0 ||
                                doctorPaymentMethods.includes(m.value),
                            )
                            .map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Referencia / Nro. comprobante
                        </label>
                        <input
                          type="text"
                          value={newConsulta.payment_reference}
                          onChange={(e) =>
                            setNewConsulta((prev) => ({
                              ...prev,
                              payment_reference: e.target.value,
                            }))
                          }
                          placeholder="Ej: #12345, último 4 dígitos..."
                          className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                        />
                      </div>

                      {/* Comprobante upload */}
                      {newConsulta.payment_method &&
                        requiresReceiptForNew(newConsulta.payment_method) && (
                          <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-2 bg-slate-50/50">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Adjuntar comprobante{' '}
                              <span className="text-xs font-normal normal-case text-slate-400">
                                (opcional)
                              </span>
                            </p>
                            <label className="flex items-center justify-center border-2 border-dashed border-teal-300/50 rounded-xl p-3 cursor-pointer hover:bg-white/80 transition-colors">
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => setNewReceiptFile(e.target.files?.[0] || null)}
                                className="hidden"
                              />
                              <div className="text-center">
                                <Upload className="w-4 h-4 mx-auto mb-1 text-teal-500" />
                                <p className="text-xs font-medium text-slate-600">
                                  {newReceiptFile ? newReceiptFile.name : 'JPG, PNG o PDF'}
                                </p>
                              </div>
                            </label>
                            {newReceiptFile && (
                              <p className="text-xs text-slate-500">
                                {(newReceiptFile.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            )}
                          </div>
                        )}
                    </div>
                  )}

                  {/* Step 6: Reason (optional) */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Motivo de consulta{' '}
                      <span className="text-slate-300 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={newConsulta.reason}
                      onChange={(e) =>
                        setNewConsulta((prev) => ({ ...prev, reason: e.target.value }))
                      }
                      placeholder="Ej: Control de rutina, seguimiento..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                  </div>

                  {/* Summary */}
                  {newConsulta.patient_id &&
                    newConsulta.date &&
                    newConsulta.time &&
                    newConsulta.plan_id && (
                      <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700 space-y-1">
                        <div>
                          <span className="font-semibold">Resumen:</span>{' '}
                          {patients.find((p) => p.id === newConsulta.patient_id)?.full_name} —{' '}
                          {new Date(newConsulta.date + 'T12:00:00').toLocaleDateString('es-VE', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          })}{' '}
                          a las {newConsulta.time}
                        </div>
                        <div className="text-xs">
                          <span className="font-semibold">Plan:</span>{' '}
                          {pricingPlans.find((p) => p.id === newConsulta.plan_id)?.name} — $
                          {pricingPlans
                            .find((p) => p.id === newConsulta.plan_id)
                            ?.price_usd.toFixed(2)}
                          {' · '}
                          <span className="font-semibold">Pago:</span>{' '}
                          {newConsulta.payment_method.replace(/_/g, ' ')}
                          {newConsulta.payment_reference &&
                            ` · Ref: ${newConsulta.payment_reference}`}
                        </div>
                        {newConsulta.reason && (
                          <div className="text-xs">
                            <span className="font-semibold">Motivo:</span> {newConsulta.reason}
                          </div>
                        )}
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowNewConsulta(false);
                        setSearchText('');
                      }}
                      className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={createConsultaFromAgenda}
                      disabled={
                        !newConsulta.patient_id ||
                        !newConsulta.date ||
                        !newConsulta.time ||
                        !newConsulta.plan_id ||
                        creatingConsulta
                      }
                      className={`flex-1 py-2.5 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                        !newConsulta.patient_id ||
                        !newConsulta.date ||
                        !newConsulta.time ||
                        !newConsulta.plan_id ||
                        creatingConsulta
                          ? 'bg-slate-300 cursor-not-allowed'
                          : 'g-bg hover:opacity-90'
                      }`}
                    >
                      {creatingConsulta ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {creatingConsulta ? 'Creando...' : 'Crear consulta'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      {/* BUG-8 fix: NewAppointmentFlow estilo booking público (acordeón) */}
      {showNewFlow && (
        <NewAppointmentFlow
          open={showNewFlow}
          onClose={() => setShowNewFlow(false)}
          onSuccess={() => {
            setShowNewFlow(false);
            // Refrescar la agenda para que aparezca la nueva cita.
            // NO usar window.location.reload(): destruye el arbol de React y con el
            // el toast que useAppointmentFlow acaba de emitir (setState de React se
            // pinta en el siguiente tick, o sea ya dentro del documento descargandose).
            void loadData();
          }}
          initialContext={{
            origin: 'agenda_btn',
            slotStart: newFlowSlotStart,
          }}
        />
      )}
    </>
  );
}
