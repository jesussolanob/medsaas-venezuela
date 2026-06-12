'use client';

import { useEffect, useState } from 'react';
import { useBcvRate } from '@/lib/useBcvRate';
import { formatUsd, formatBs } from '@/lib/finances';
import { reportError } from '@/lib/report-error';
import {
  Users,
  Calendar,
  FileText,
  TrendingUp,
  Bell,
  DollarSign,
  ArrowRight,
  Activity,
  CheckCircle,
  Clock,
  AlertCircle,
  ClipboardList,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  UserPlus,
  Receipt,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatCard, Card } from '@/components/dh';
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow';
// L3 (2026-04-29): quick action "Crear paciente" en el dashboard reusa
// el PatientForm unificado + addPatient action y muestra toast al guardar.
import PatientForm, { type PatientFormData } from '@/components/patient/PatientForm';
import { addPatient } from '@/app/doctor/patients/actions';
import { addExpense } from '@/app/doctor/finances/actions';
import { getDoctorId } from '@/app/doctor/actions';
import { showToast } from '@/components/ui/Toaster';
// MIGRATED (Etapa 1): data fetching now goes through NestJS backend actions.
import {
  getDoctorProfile,
  getTodayAppointments,
  getDashboardFinanceSummary,
  getDashboardAllTimeStats,
} from '@/app/doctor/dashboard-actions';

type Profile = {
  full_name: string;
  specialty: string | null;
  email: string;
  professional_title: string | null;
  cedula: string | null;
};

type Appointment = {
  id: string;
  patient_name: string;
  scheduled_at: string;
  status: string;
  source?: 'appointment' | 'consultation';
  // L2 (2026-04-29): se carga para que click → /doctor/consultations?open=<consultation_id>
  // cuando ya hay consulta linkeada; si no hay, fallback a /doctor/agenda.
  consultation_id?: string | null;
};

type FinancialData = {
  total_revenue: number;
  appointment_count: number;
  // Cuentas por cobrar: consultas del mes con pago aún 'pending' (no aprobado).
  pending_amount: number;
};

type AllTimeStats = {
  total_revenue_lifetime: number;
  total_patients: number;
  patients_attended: number;
};

const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Alquiler' },
  { value: 'staff', label: 'Personal' },
  { value: 'supplies', label: 'Insumos' },
  { value: 'services', label: 'Servicios' },
  { value: 'taxes', label: 'Impuestos' },
  { value: 'other', label: 'Otros' },
];

// Una cita se considera "en curso" hasta esta ventana tras su hora de inicio
// (no tenemos duración en el dashboard; usamos un default razonable).
const ACTIVE_WINDOW_MS = 60 * 60 * 1000;

export default function DoctorDashboard() {
  const router = useRouter();
  const { rate: bcvRate, toBs, toBsNum } = useBcvRate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [financialData, setFinancialData] = useState<FinancialData>({
    total_revenue: 0,
    appointment_count: 0,
    pending_amount: 0,
  });
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats>({
    total_revenue_lifetime: 0,
    total_patients: 0,
    patients_attended: 0,
  });
  const [loading, setLoading] = useState(true);
  // Modal "Nueva consulta"
  const [showNewFlow, setShowNewFlow] = useState(false);
  // L3 (2026-04-29): estado del modal "Crear paciente" (quick action) +
  // patientId del recien creado para abrir NewAppointmentFlow opcionalmente.
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientFormSaving, setPatientFormSaving] = useState(false);
  const [newAppointmentPatientId, setNewAppointmentPatientId] = useState<string | null>(null);

  // Quick "Registrar gasto" modal (reuses the finances addExpense action).
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [expenseForm, setExpenseForm] = useState({
    concept: '',
    amount: '',
    category: 'other',
    dueDate: todayStr,
  });

  // Month filter state (year-month)
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const goToPrevMonth = () => {
    setSelectedMonth((prev) =>
      prev.month === 0
        ? { year: prev.year - 1, month: 11 }
        : { year: prev.year, month: prev.month - 1 },
    );
  };
  const goToNextMonth = () => {
    setSelectedMonth((prev) =>
      prev.month === 11
        ? { year: prev.year + 1, month: 0 }
        : { year: prev.year, month: prev.month + 1 },
    );
  };
  const isCurrentMonth =
    selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth();
  const monthLabel = new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
  });

  // ---------------------------------------------------------------------------
  // MIGRATED (Etapa 1): all data fetching now uses NestJS backend server actions.
  // Supabase (createClient, payments, appointments, patients, consultations) removed.
  // Profile fetched from /api/doctor/profile (getDoctorProfile).
  // Today's appointments from /api/appointments with date range filter.
  // Monthly finances from /api/finances/summary?month=YYYY-MM.
  // All-time stats (patients, consultations) from respective count endpoints.
  //
  // Supabase Realtime channel removed — re-fetch triggered by selectedMonth change.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function fetchData() {
      try {
        // Build 'YYYY-MM' string for the selected month.
        const monthStr = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}`;

        // Fetch all independent data in parallel for performance.
        const [prof, appts, financeSummary, allTimeData] = await Promise.all([
          getDoctorProfile(),
          getTodayAppointments(),
          getDashboardFinanceSummary(monthStr),
          getDashboardAllTimeStats(),
        ]);

        // Map profile — DoctorProfile already uses snake_case matching the local Profile type.
        if (prof) {
          setProfile({
            full_name: prof.full_name,
            specialty: prof.specialty ?? null,
            email: prof.email,
            professional_title: prof.professional_title ?? null,
            cedula: prof.cedula ?? null,
          });
        }

        // Map DashboardAppointment (camelCase) → local Appointment type (snake_case).
        // patient_name falls back to empty string when null (masked in list view).
        setTodayAppointments(
          appts.map((a) => ({
            id: a.id,
            patient_name: a.patientName ?? '',
            scheduled_at: a.scheduledAt,
            status: a.status,
            source: 'appointment' as const,
            consultation_id: a.consultationId ?? null,
          })),
        );

        // Map monthly finance summary → FinancialData.
        // totalIncome = approved income for the month.
        // consultationCount = approved consultations for the month.
        setFinancialData({
          total_revenue: financeSummary?.totalIncome ?? 0,
          appointment_count: financeSummary?.consultationCount ?? 0,
          pending_amount: financeSummary?.pendingAmount ?? 0,
        });

        // Map all-time stats.
        // total_patients: total registered patients (meta.total from /api/patients).
        // patients_attended: total consultations (meta.total from /api/consultations).
        // total_revenue_lifetime: current-month income (lifetime endpoint pending).
        setAllTimeStats({
          total_revenue_lifetime: allTimeData.totalIncomeCurrentMonth,
          total_patients: allTimeData.totalPatients,
          patients_attended: allTimeData.totalConsultations,
        });
      } catch (error: unknown) {
        // Non-fatal — dashboard shows zeros on error; user can refresh.
        reportError('doctor/page', 'fetchData', error);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [selectedMonth]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getStatusBadgeColor = (status: string, isPast: boolean = false) => {
    // If appointment time has passed, show as "Pasada"
    if (isPast && (status === 'scheduled' || status === 'pending')) {
      return 'bg-red-50 text-red-700 border border-red-200';
    }
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'confirmed':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'pending':
      case 'scheduled':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'cancelled':
        return 'bg-slate-50 text-slate-700 border border-slate-200';
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200';
    }
  };

  const getStatusBadgeText = (apt: Appointment, isPast: boolean = false): string => {
    if (isPast && (apt.status === 'scheduled' || apt.status === 'pending')) {
      return 'Pasada';
    }
    switch (apt.status) {
      case 'completed':
        return 'Completada';
      case 'confirmed':
        return 'Confirmada';
      case 'pending':
      case 'scheduled':
        return 'Pendiente';
      case 'cancelled':
        return 'Cancelada';
      default:
        return apt.status;
    }
  };

  // L3 (2026-04-29): handler del PatientForm en modo CREATE. Replica el patron
  // de app/doctor/patients/page.tsx (reusa addPatient + revalida lista en sv).
  // Tras crear: toast, cierra modal y deja el patientId disponible para ofrecer
  // "Crear cita ahora" con NewAppointmentFlow pre-rellenado.
  async function handleCreatePatient(formData: PatientFormData) {
    setPatientFormSaving(true);
    try {
      const doctorId = await getDoctorId();
      if (!doctorId) throw new Error('Sesion expirada');
      const res = await addPatient(doctorId, {
        full_name: formData.full_name,
        age: formData.age ?? undefined,
        birth_date: formData.birth_date ?? undefined,
        phone: formData.phone ?? undefined,
        cedula: formData.cedula ?? undefined,
        email: formData.email ?? undefined,
        sex: formData.sex ?? undefined,
        notes: formData.notes ?? undefined,
        blood_type: formData.blood_type ?? undefined,
        allergies: formData.allergies ?? undefined,
        chronic_conditions: formData.chronic_conditions ?? undefined,
        emergency_contact_name: formData.emergency_contact_name ?? undefined,
        emergency_contact_phone: formData.emergency_contact_phone ?? undefined,
        address: formData.address ?? undefined,
        city: formData.city ?? undefined,
        source: 'manual',
      });
      if (!res.success) throw new Error(res.error || 'Error al crear');
      showToast({ type: 'success', message: 'Paciente creado' });
      setShowPatientForm(false);
      setNewAppointmentPatientId(res.patient_id);
    } catch (err: unknown) {
      // Re-throw para que PatientForm muestre el error inline
      throw err;
    } finally {
      setPatientFormSaving(false);
    }
  }

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (!expenseForm.concept.trim() || !isFinite(amount) || amount <= 0) {
      showToast({ type: 'error', message: 'Completa concepto y monto válido' });
      return;
    }
    setExpenseSaving(true);
    try {
      const res = await addExpense({
        concept: expenseForm.concept.trim(),
        vendorName: expenseForm.concept.trim(),
        amount,
        dueDate: expenseForm.dueDate,
        category: expenseForm.category,
      });
      if (!res.success) throw new Error(res.error);
      showToast({ type: 'success', message: 'Gasto registrado' });
      setShowExpenseModal(false);
      setExpenseForm({ concept: '', amount: '', category: 'other', dueDate: todayStr });
    } catch (err: unknown) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al registrar',
      });
    } finally {
      setExpenseSaving(false);
    }
  }

  // L2 (2026-04-29): si la cita ya tiene consulta linkeada → abrir esa consulta;
  // si no, mandar a la agenda (no a /doctor/consultations con un appointment.id
  // que no matchea ningun consultation.id, que era el bug previo).
  const handleAppointmentClick = (apt: Appointment) => {
    if (apt.consultation_id) {
      router.push(`/doctor/consultations?open=${apt.consultation_id}`);
    } else {
      router.push('/doctor/agenda');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm">Cargando tu portal...</span>
        </div>
      </div>
    );
  }

  // Cita destacada: la que está en curso ahora o la próxima del día.
  const nowMs = Date.now();
  const sortedToday = [...todayAppointments]
    .filter((a) => a.status === 'scheduled' || a.status === 'confirmed' || a.status === 'completed')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const featuredAppt =
    sortedToday.find((a) => nowMs < new Date(a.scheduled_at).getTime() + ACTIVE_WINDOW_MS) ?? null;
  const featuredIsNow =
    featuredAppt !== null && new Date(featuredAppt.scheduled_at).getTime() <= nowMs;

  return (
    <>
      <style>{`
        .g-bg { background: linear-gradient(135deg, var(--dh-turquoise-700) 0%, var(--dh-turquoise) 50%, var(--dh-turquoise-500) 100%); }
        .g-text { background: linear-gradient(135deg, var(--dh-turquoise), var(--dh-turquoise-700)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card-hover { transition: all 0.2s; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: var(--dh-shadow-md); }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'var(--dh-turquoise-700)', fontFamily: 'var(--dh-font-mono)' }}
            >
              {greeting()}
            </p>
            <h1
              className="font-semibold tracking-tight mt-1"
              style={{
                fontFamily: 'var(--dh-font-display)',
                fontSize: 'clamp(22px, 3.2vw, 32px)',
                color: 'var(--dh-ink)',
              }}
            >
              {profile?.full_name
                ? `${profile.professional_title || 'Dr.'} ${profile.full_name}`
                : 'Bienvenido'}
            </h1>
            {profile?.specialty && (
              <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-600)' }}>
                {profile.specialty}
              </p>
            )}
          </div>

          {/* Plan badge */}
          <div
            className="flex items-center gap-2 bg-white px-3 sm:px-4 py-2 sm:py-2.5 shrink-0"
            style={{
              border: '1px solid var(--dh-turquoise-100)',
              borderRadius: 'var(--dh-r-md)',
            }}
          >
            <CheckCircle className="w-4 h-4" style={{ color: 'var(--dh-turquoise)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--dh-turquoise-700)' }}>
                Plan activo
              </p>
              <p className="text-[10px]" style={{ color: 'var(--dh-gray-400)' }}>
                Acceso completo
              </p>
            </div>
          </div>
        </div>

        {/* Onboarding banner removed — access gate now lives in the layout.
            Doctors without a cedula are redirected to /doctor/onboarding before
            they ever reach this page. */}

        {/* Hero welcome card */}
        <div
          className="g-bg p-6 sm:p-8 relative overflow-hidden text-white"
          style={{ borderRadius: 'var(--dh-r-xl)' }}
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-24 h-24 rounded-full bg-cyan-400/20 blur-xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-white/80" />
              <span
                className="text-white/80 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ fontFamily: 'var(--dh-font-mono)' }}
              >
                Delta
              </span>
            </div>
            <h2
              className="font-semibold text-white mb-1"
              style={{
                fontFamily: 'var(--dh-font-display)',
                fontSize: 'clamp(20px, 2.8vw, 26px)',
                letterSpacing: '-0.02em',
              }}
            >
              Tu portal médico está listo
            </h2>
            <p className="text-white/80 text-sm max-w-lg leading-relaxed">
              Gestiona pacientes, agenda citas, lleva historial clínico y controla tus finanzas,
              todo desde un solo lugar.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-5">
              <Link
                href="/doctor/patients"
                className="flex items-center justify-center sm:justify-start gap-2 bg-white font-semibold text-[13px] px-4 py-2.5 rounded-full hover:-translate-y-px transition-all"
                style={{ color: 'var(--dh-turquoise-700)' }}
              >
                <Users className="w-4 h-4" />
                <span>Ver Pacientes</span>
              </Link>
              <Link
                href="/doctor/agenda"
                className="flex items-center justify-center sm:justify-start gap-2 backdrop-blur text-white font-semibold text-[13px] px-4 py-2.5 rounded-full transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                }}
              >
                <Calendar className="w-4 h-4" />
                <span>Ver Agenda</span>
              </Link>
              <button
                onClick={() => setShowNewFlow(true)}
                className="flex items-center justify-center sm:justify-start gap-2 backdrop-blur text-white font-semibold text-[13px] px-4 py-2.5 rounded-full transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                }}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Crear Consulta</span>
              </button>
              <button
                onClick={() => setShowPatientForm(true)}
                className="flex items-center justify-center sm:justify-start gap-2 backdrop-blur text-white font-semibold text-[13px] px-4 py-2.5 rounded-full transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                }}
              >
                <UserPlus className="w-4 h-4" />
                <span>Crear Paciente</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Cita actual / próxima destacada ── */}
        {featuredAppt && (
          <button
            onClick={() => handleAppointmentClick(featuredAppt)}
            className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left transition-all card-hover"
            style={{
              background: featuredIsNow ? 'var(--dh-turquoise-50)' : '#fff',
              border: `1px solid ${featuredIsNow ? 'var(--dh-turquoise)' : 'var(--dh-gray-200)'}`,
              borderRadius: 'var(--dh-r-xl)',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: featuredIsNow ? 'var(--dh-turquoise)' : 'var(--dh-turquoise-50)',
                  color: featuredIsNow ? '#fff' : 'var(--dh-turquoise-700)',
                }}
              >
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{
                    color: featuredIsNow ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-400)',
                    fontFamily: 'var(--dh-font-mono)',
                  }}
                >
                  {featuredIsNow ? 'Cita en curso' : 'Próxima cita'}
                </p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--dh-ink)' }}>
                  {featuredAppt.patient_name || 'Paciente sin nombre'}
                </p>
                <p className="text-xs text-slate-500">{formatTime(featuredAppt.scheduled_at)}</p>
              </div>
            </div>
            <div
              className="flex items-center gap-1.5 text-sm font-semibold shrink-0"
              style={{ color: 'var(--dh-turquoise-700)' }}
            >
              <span className="hidden sm:inline">
                {featuredAppt.consultation_id ? 'Abrir consulta' : 'Ver agenda'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        )}

        {/* ── 3 KPI Cards: ingresos, pacientes, atendidos ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <StatCard
            label="Ingresos totales"
            value={formatUsd(allTimeStats.total_revenue_lifetime)}
            icon={<DollarSign size={16} />}
            subtitle={
              bcvRate ? `≈ ${formatBs(toBsNum(allTimeStats.total_revenue_lifetime))}` : undefined
            }
          />
          <StatCard
            label="Mis pacientes"
            value={allTimeStats.total_patients.toLocaleString('es-VE')}
            icon={<Users size={16} />}
            subtitle="Registrados en tu consultorio"
          />
          <StatCard
            label="Pacientes atendidos"
            value={allTimeStats.patients_attended.toLocaleString('es-VE')}
            icon={<CheckCircle size={16} />}
            subtitle="Con al menos una consulta"
          />
        </div>

        {/* Widgets Grid - Bento style */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
          {/* Citas del Día Widget */}
          <Card padding={24}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5" style={{ color: 'var(--dh-turquoise)' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
                Citas del Día
              </h2>
              <span
                className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: 'var(--dh-gray-50)',
                  color: 'var(--dh-gray-600)',
                  fontFamily: 'var(--dh-font-mono)',
                }}
              >
                {todayAppointments.length}
              </span>
            </div>

            {todayAppointments.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                No hay citas programadas para hoy
              </p>
            ) : (
              <div className="space-y-3">
                {todayAppointments.slice(0, 3).map((apt) => {
                  const appointmentTime = new Date(apt.scheduled_at);
                  const now = new Date();
                  const isPast = appointmentTime < now;
                  return (
                    <button
                      key={apt.id}
                      onClick={() => handleAppointmentClick(apt)}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {apt.patient_name || 'Paciente sin nombre'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatTime(apt.scheduled_at)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-2 ${getStatusBadgeColor(apt.status, isPast)}`}
                      >
                        {getStatusBadgeText(apt, isPast)}
                      </span>
                    </button>
                  );
                })}
                {todayAppointments.length > 3 && (
                  <Link
                    href="/doctor/agenda"
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 pt-2"
                  >
                    Ver todas ({todayAppointments.length})
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            )}
          </Card>

          {/* Finanzas del Mes Widget */}
          <Card padding={24}>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5" style={{ color: 'var(--dh-turquoise)' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
                Finanzas
              </h2>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={goToPrevMonth}
                  className="p-1 rounded-lg transition-colors"
                  style={{ color: 'var(--dh-gray-400)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--dh-gray-50)';
                    e.currentTarget.style.color = 'var(--dh-gray-600)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--dh-gray-400)';
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span
                  className="text-xs font-semibold min-w-[110px] text-center capitalize"
                  style={{ color: 'var(--dh-gray-600)', fontFamily: 'var(--dh-font-mono)' }}
                >
                  {monthLabel}
                </span>
                <button
                  onClick={goToNextMonth}
                  disabled={isCurrentMonth}
                  className="p-1 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'var(--dh-gray-400)' }}
                  onMouseEnter={(e) => {
                    if (!isCurrentMonth) {
                      e.currentTarget.style.background = 'var(--dh-gray-50)';
                      e.currentTarget.style.color = 'var(--dh-gray-600)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--dh-gray-400)';
                  }}
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div
                className="p-4"
                style={{
                  background:
                    'linear-gradient(135deg, var(--dh-turquoise-50) 0%, var(--dh-turquoise-100) 100%)',
                  border: '1px solid var(--dh-turquoise-100)',
                  borderRadius: 'var(--dh-r-md)',
                }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--dh-gray-600)' }}>
                  Ingresos Totales
                </p>
                <p
                  className="font-semibold"
                  style={{
                    color: 'var(--dh-turquoise-700)',
                    fontFamily: 'var(--dh-font-display)',
                    fontSize: 28,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {formatUsd(financialData.total_revenue)}
                </p>
                {bcvRate && (
                  <p className="text-sm font-semibold" style={{ color: 'var(--dh-turquoise)' }}>
                    {toBs(financialData.total_revenue)}
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--dh-gray-400)' }}>
                  USD
                </p>
              </div>

              {/* Por ingresar = cuentas por cobrar (consultas con pago pendiente). */}
              <div
                className="flex items-center justify-between p-3"
                style={{
                  background: 'var(--dh-amber-50, #fffbeb)',
                  border: '1px solid var(--dh-amber-100, #fde68a)',
                  borderRadius: 'var(--dh-r-md)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" style={{ color: '#b45309' }} />
                  <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                    Por ingresar
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: '#92400e' }}>
                    {formatUsd(financialData.pending_amount)}
                  </p>
                  {bcvRate && financialData.pending_amount > 0 && (
                    <p className="text-[11px]" style={{ color: '#b45309' }}>
                      {toBs(financialData.pending_amount)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className="p-3"
                  style={{
                    background: 'var(--dh-gray-50)',
                    border: '1px solid var(--dh-gray-100)',
                    borderRadius: 'var(--dh-r-md)',
                  }}
                >
                  <p className="text-xs font-semibold" style={{ color: 'var(--dh-gray-600)' }}>
                    Citas Completadas
                  </p>
                  <p
                    className="font-bold mt-1"
                    style={{
                      color: 'var(--dh-ink)',
                      fontFamily: 'var(--dh-font-display)',
                      fontSize: 22,
                    }}
                  >
                    {financialData.appointment_count}
                  </p>
                </div>
                <div
                  className="p-3"
                  style={{
                    background: 'var(--dh-gray-50)',
                    border: '1px solid var(--dh-gray-100)',
                    borderRadius: 'var(--dh-r-md)',
                  }}
                >
                  <p className="text-xs font-semibold" style={{ color: 'var(--dh-gray-600)' }}>
                    Promedio por Cita
                  </p>
                  <p
                    className="font-bold mt-1"
                    style={{
                      color: 'var(--dh-ink)',
                      fontFamily: 'var(--dh-font-display)',
                      fontSize: 22,
                    }}
                  >
                    {formatUsd(
                      financialData.appointment_count > 0
                        ? financialData.total_revenue / financialData.appointment_count
                        : 0,
                    )}
                  </p>
                  {bcvRate && financialData.appointment_count > 0 && (
                    <p className="text-xs" style={{ color: 'var(--dh-gray-400)' }}>
                      {toBs(financialData.total_revenue / financialData.appointment_count)}
                    </p>
                  )}
                </div>
              </div>

              {/* Acciones rápidas de finanzas */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  href="/doctor/cobros"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--dh-turquoise)' }}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Registrar pago
                </Link>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: 'var(--dh-gray-50)',
                    border: '1px solid var(--dh-gray-200)',
                    color: 'var(--dh-gray-800)',
                  }}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Registrar gasto
                </button>
              </div>

              <Link
                href="/doctor/finances"
                className="text-xs font-semibold flex items-center gap-1 pt-2"
                style={{ color: 'var(--dh-turquoise-700)' }}
              >
                Ver más detalles
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: crear consulta (estilo acordeón) */}
      <NewAppointmentFlow
        open={showNewFlow}
        onClose={() => {
          setShowNewFlow(false);
          // L3 (2026-04-29): si veniamos del flujo "crear paciente → crear cita"
          // limpiamos el patientId pendiente para evitar re-mostrar el prompt.
          setNewAppointmentPatientId(null);
        }}
        onSuccess={(id) => {
          setShowNewFlow(false);
          setNewAppointmentPatientId(null);
          router.push(`/doctor/consultations?open=${id}`);
        }}
        initialContext={{
          origin: 'dashboard_btn',
          // L3 (2026-04-29): pre-rellenar paciente si viene del quick action.
          ...(newAppointmentPatientId ? { patientId: newAppointmentPatientId } : {}),
        }}
      />

      {/* L3 (2026-04-29): Modal "Crear paciente" desde dashboard.
          Replica el patron usado en /doctor/patients (PatientForm + addPatient). */}
      {showPatientForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Nuevo paciente</h2>
                  <p className="text-xs text-slate-400">
                    Completa los datos para registrar al paciente
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPatientForm(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <PatientForm
              submitting={patientFormSaving}
              onSubmit={handleCreatePatient}
              onCancel={() => setShowPatientForm(false)}
            />
          </div>
        </div>
      )}

      {/* L3 (2026-04-29): mini-prompt post creacion para ofrecer
          "Crear cita ahora" con NewAppointmentFlow pre-rellenado. */}
      {newAppointmentPatientId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto mb-3 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Paciente creado</h3>
            <p className="text-sm text-slate-500 mb-5">¿Quieres agendarle una cita ahora?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setNewAppointmentPatientId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Más tarde
              </button>
              <button
                onClick={() => {
                  // Mantenemos el id en estado: NewAppointmentFlow lo recibe via initialContext
                  setShowNewFlow(true);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600"
              >
                Crear cita ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar gasto rápido (reusa la action addExpense de finanzas) */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--dh-gray-50)', color: 'var(--dh-gray-800)' }}
                >
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Registrar gasto</h2>
                  <p className="text-xs text-slate-400">Se suma a tus finanzas del mes</p>
                </div>
              </div>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Concepto</label>
                <input
                  value={expenseForm.concept}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, concept: e.target.value }))}
                  placeholder="Ej. Insumos médicos"
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Monto (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Fecha</label>
                  <input
                    type="date"
                    value={expenseForm.dueDate}
                    onChange={(e) => setExpenseForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Categoría</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-200"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={expenseSaving}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 disabled:opacity-50"
                >
                  {expenseSaving ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
