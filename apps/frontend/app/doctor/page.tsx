'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useBcvRate } from '@/lib/useBcvRate';
import { formatBs, type PaymentRow } from '@/lib/finances';
import { reportError } from '@/lib/report-error';
import { getProfessionalTitle } from '@/lib/professional-title';
import {
  Users,
  Calendar,
  Bell,
  DollarSign,
  ArrowRight,
  Activity,
  CheckCircle,
  Clock,
  ClipboardList,
  Zap,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  UserPlus,
  Receipt,
  Wallet,
  X,
  Loader2,
  Plus,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatCard, Card } from '@/components/dh';
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow';
import ImmediateConsultationModal from '@/components/doctor/ImmediateConsultationModal';
import AppointmentDetailModal, {
  type RescheduleRequest,
} from '@/components/doctor/AppointmentDetailModal';
import RescheduleModal from '@/components/doctor/RescheduleModal';
// L3 (2026-04-29): quick action "Crear paciente" en el dashboard reusa
// el PatientForm unificado + addPatient action y muestra toast al guardar.
import PatientForm, { type PatientFormData } from '@/components/patient/PatientForm';
import { addPatient, getPatients } from '@/app/doctor/patients/actions';
import {
  addExpense,
  addIncome,
  getIncomeConcepts,
  createIncomeConcept,
  updateIncomeConcept,
  deleteIncomeConcept,
  getConsultationsForReports,
  type IncomeConcept,
  type BackendConsultationRow,
} from '@/app/doctor/finances/actions';
import IncomeModal, { type IncomeForm } from '@/components/finances/IncomeModal';
import type { Patient } from '@/app/doctor/patients/actions';
import {
  getPayments,
  updatePaymentStatus as updatePaymentStatusAction,
} from '@/app/doctor/finances/payments-actions';
import { updatePaymentDetails } from '@/app/doctor/cobros/actions';
import PaymentMethodModal from '@/app/doctor/consultations/PaymentMethodModal';
import { getDoctorId } from '@/app/doctor/actions';
import { showToast } from '@/components/ui/Toaster';
import { SetupStepper } from '@/components/doctor/SetupStepper';
import { WelcomeModal } from '@/components/doctor/WelcomeModal';
import { getDoctorPlanFeatures } from '@/app/doctor/plan-features-actions';
import { planUnlocks, EMPTY_PLAN_FEATURES, type PlanFeatures } from '@/lib/plan-features';
// MIGRATED (Etapa 1): data fetching now goes through NestJS backend actions.
import {
  getDoctorProfile,
  getTodayAppointments,
  getDashboardFinanceSummary,
  getDashboardAllTimeStats,
  getScheduledAppointments,
  type ScheduledAppointment,
} from '@/app/doctor/dashboard-actions';

type Profile = {
  full_name: string;
  specialty: string | null;
  email: string;
  professional_title: string | null;
  cedula: string | null;
  /** Logo URL from profile — null when the doctor has not uploaded a logo yet. */
  logoUrl: string | null;
  /** Signature URL from profile — null when the doctor has not uploaded a signature yet. */
  signatureUrl: string | null;
  /** M.P.P.S. registration number — null when not set. */
  licenseNumber: string | null;
  /** Telefono de contacto — null si no lo ha cargado. */
  phone: string | null;
  /** Metodos de cobro activos. Vacio = aun no configuro ninguno. */
  paymentMethods: string[];
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
  const { rate: bcvRate, toBs, toBsNum, format } = useBcvRate();
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
  // Se incrementa tras cada mutacion del inicio para forzar el refetch del dashboard.
  const [refreshKey, setRefreshKey] = useState(0);
  // null = desconocido (cargando o fallo el fetch); el paso no se marca ni listo ni
  // pendiente hasta saberlo, para no acusar al especialista de algo que si hizo.
  const [hasServices, setHasServices] = useState<boolean | null>(null);
  // Modal de bienvenida: se abre si el perfil no tiene welcome_dismissed_at.
  const [showWelcome, setShowWelcome] = useState(false);
  // Se evalua UNA sola vez por sesion de pagina: el efecto tambien corre al cambiar
  // de mes y tras cada mutacion, y el modal no debe reaparecer en esos casos.
  const welcomeCheckedRef = useRef(false);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures>(EMPTY_PLAN_FEATURES);
  // null = desconocido (cargando o fetch falló), true = tiene consultorios, false = sin consultorios
  const [hasOffices, setHasOffices] = useState<boolean | null>(null);
  // Controla si el doctor descartó el banner de plantillas en esta sesión.
  // Modal de consulta inmediata (paciente sin cita).
  const [showImmediate, setShowImmediate] = useState(false);

  // Modal "Nueva consulta"
  const [showNewFlow, setShowNewFlow] = useState(false);
  // L3 (2026-04-29): estado del modal "Crear paciente" (quick action) +
  // patientId del recien creado para abrir NewAppointmentFlow opcionalmente.
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientFormSaving, setPatientFormSaving] = useState(false);
  // newAppointmentPatientId: controls the "¿Crear cita ahora?" mini-prompt visibility.
  // preselectPatientId: the patient to pre-fill in NewAppointmentFlow (persists while
  // the flow is open, so closing the mini-prompt doesn't lose the preselect).
  const [newAppointmentPatientId, setNewAppointmentPatientId] = useState<string | null>(null);
  const [preselectPatientId, setPreselectPatientId] = useState<string | null>(null);

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

  // "Registrar pago" modal — lista los cobros pendientes y permite aprobarlos.
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [loadingPendingPayments, setLoadingPendingPayments] = useState(false);
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);
  // Pago pendiente que requiere capturar método antes de aprobar (abre PaymentMethodModal).
  const [methodModalPayment, setMethodModalPayment] = useState<PaymentRow | null>(null);

  // "Por confirmar" widget — citas con status=scheduled pendientes de confirmación.
  const [scheduledAppointments, setScheduledAppointments] = useState<ScheduledAppointment[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Cita seleccionada para ver detalle en AppointmentDetailModal.
  const [detailApptId, setDetailApptId] = useState<string | null>(null);
  // Target for RescheduleModal (emitted by AppointmentDetailModal.onReschedule).
  const [rescheduleAppt, setRescheduleAppt] = useState<RescheduleRequest | null>(null);

  // "Registrar ingreso" modal — reutiliza el mismo IncomeModal de /doctor/finances.
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [incomeError, setIncomeError] = useState('');
  const [incomeForm, setIncomeForm] = useState<IncomeForm>({
    description: '',
    amount: '',
    conceptId: '',
    date: todayStr,
    relatedConsultationId: '',
    patientId: '',
  });
  // Datos auxiliares del modal de ingreso — se cargan al abrir el modal.
  const [incomeConcepts, setIncomeConcepts] = useState<IncomeConcept[]>([]);
  const [incomeConsultations, setIncomeConsultations] = useState<BackendConsultationRow[]>([]);
  const [incomePatients, setIncomePatients] = useState<Patient[]>([]);

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

  // Loader del inicio. Cada mutacion (registrar ingreso/gasto, aprobar cobro,
  // confirmar cita, crear paciente) incrementa `refreshKey` para que el efecto
  // vuelva a pedir los datos y las tarjetas no queden viejas. Mismo patron que
  // /doctor/finances. `loading` solo pasa a false, asi que refrescar no parpadea.
  useEffect(() => {
    async function fetchData() {
      try {
        // Build 'YYYY-MM' string for the selected month.
        const monthStr = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}`;

        // Fetch all independent data in parallel for performance.
        const [prof, appts, financeSummary, allTimeData, scheduled, planFeat] = await Promise.all([
          getDoctorProfile(),
          getTodayAppointments(),
          getDashboardFinanceSummary(monthStr),
          getDashboardAllTimeStats(),
          getScheduledAppointments(),
          getDoctorPlanFeatures(),
        ]);

        setPlanFeatures(planFeat);

        // Map profile — DoctorProfile uses camelCase (NestJS wire format).
        if (prof) {
          setProfile({
            full_name: prof.fullName,
            specialty: prof.specialty ?? null,
            email: prof.email,
            professional_title: prof.professionalTitle ?? null,
            cedula: prof.cedula ?? null,
            logoUrl: prof.logoUrl ?? null,
            signatureUrl: prof.signatureUrl ?? null,
            licenseNumber: prof.licenseNumber ?? null,
            phone: prof.phone ?? null,
            paymentMethods: prof.paymentMethods ?? [],
          });
          // Se muestra mientras el especialista no haya pedido ocultarlo. Solo en la
          // carga inicial: un refetch tras una mutacion no debe reabrirlo.
          if (!welcomeCheckedRef.current) {
            welcomeCheckedRef.current = true;
            if (!prof.welcomeDismissedAt) setShowWelcome(true);
          }
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

        // Citas pendientes de confirmación para el widget "Por confirmar".
        setScheduledAppointments(scheduled);

        // Verificar si el médico tiene consultorios configurados para mostrar alerta de onboarding.
        // No crítico: si el fetch falla, no se muestra la alerta (degradar silenciosamente).
        try {
          const officesRes = await fetch('/api/doctor/offices');
          if (officesRes.ok) {
            const officesJson = (await officesRes.json()) as {
              success?: boolean;
              data?: Array<{ isActive?: boolean }>;
            };
            const officesList = Array.isArray(officesJson?.data) ? officesJson.data : [];
            // Only ACTIVE offices generate booking slots — a doctor whose offices
            // are all inactive still cannot receive bookings, so the alert must
            // treat that the same as having no offices at all.
            const hasActiveOffice = officesList.some((o) => o?.isActive === true);
            setHasOffices(hasActiveOffice);
          }
        } catch {
          // Silencioso: la alerta no se muestra si el fetch de consultorios falla.
        }

        // Servicios activos — alimenta el paso 3 del stepper de configuracion.
        try {
          const servicesRes = await fetch('/api/doctor/services');
          if (servicesRes.ok) {
            const servicesJson = (await servicesRes.json()) as {
              data?: Array<{ isActive?: boolean; is_active?: boolean }>;
            };
            const list = Array.isArray(servicesJson?.data) ? servicesJson.data : [];
            setHasServices(list.some((s) => (s?.isActive ?? s?.is_active ?? true) === true));
          }
        } catch {
          // Silencioso: hasServices queda en null y el paso no se marca pendiente.
        }
      } catch (error: unknown) {
        // Non-fatal — dashboard shows zeros on error; user can refresh.
        reportError('doctor/page', 'fetchData', error);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [selectedMonth, refreshKey]);

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
        emergency_contact_relationship: formData.emergency_contact_relationship ?? undefined,
        address: formData.address ?? undefined,
        city: formData.city ?? undefined,
        source: 'manual',
      });
      if (!res.success) throw new Error(res.error || 'Error al crear');
      showToast({ type: 'success', message: 'Paciente creado' });
      setShowPatientForm(false);
      setNewAppointmentPatientId(res.patient_id);
      setPreselectPatientId(res.patient_id);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      // Re-throw para que PatientForm muestre el error inline
      throw err;
    } finally {
      setPatientFormSaving(false);
    }
  }

  /**
   * Persiste "no volver a mostrar" del modal de bienvenida en el perfil (no en
   * localStorage) para que la decisión acompañe al especialista entre dispositivos.
   * Si falla, se traga el error: el modal ya se cerró y como mucho vuelve a salir.
   */
  async function dismissWelcomeForever() {
    try {
      await fetch('/api/doctor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ welcome_dismissed: true }),
      });
    } catch (err: unknown) {
      reportError('doctor/page', 'dismissWelcomeForever', err);
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
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al registrar',
      });
    } finally {
      setExpenseSaving(false);
    }
  }

  // Carga los cobros pendientes desde el backend para el modal "Registrar pago".
  const loadPendingPayments = useCallback(async () => {
    setLoadingPendingPayments(true);
    try {
      const rows = await getPayments({ status: 'pending' });
      setPendingPayments(rows);
    } catch (err: unknown) {
      reportError('doctor/page', 'loadPendingPayments', err);
      setPendingPayments([]);
    } finally {
      setLoadingPendingPayments(false);
    }
  }, []);

  function handleOpenPaymentModal() {
    setShowPaymentModal(true);
    void loadPendingPayments();
  }

  // Aprueba el pago de verdad (status → approved) y lo quita de la lista.
  async function approvePaymentRow(paymentId: string) {
    setApprovingPaymentId(paymentId);
    try {
      const result = await updatePaymentStatusAction(paymentId, 'approved');
      if (!result.success) throw new Error(result.error);
      showToast({ type: 'success', message: 'Pago aprobado correctamente' });
      // Quita el pago aprobado de la lista local para dar respuesta inmediata en el modal.
      setPendingPayments((prev) => prev.filter((p) => p.id !== paymentId));
      // Y repide las cifras al servidor. Antes esto se parcheaba a mano restando el
      // monto a pending_amount y sumandolo a total_revenue: funcionaba, pero era una
      // copia local de una regla del backend y se desviaba en cuanto el servidor
      // calculaba distinto (ej. el ingreso cae en otro mes que el seleccionado).
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al aprobar el pago',
      });
    } finally {
      setApprovingPaymentId(null);
    }
  }

  // Al aprobar un cobro pendiente: si NO tiene método de pago registrado, abrir el
  // modal para capturarlo (obligatorio) + referencia/comprobante (opcionales) antes
  // de aprobar. Con método → aprueba directo. (Mismo comportamiento que la consulta.)
  function handleApprovePayment(payment: PaymentRow) {
    if (!payment.method_snapshot || !payment.method_snapshot.trim()) {
      setMethodModalPayment(payment);
      return;
    }
    void approvePaymentRow(payment.id);
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

  // Confirma una cita individual desde el widget "Por confirmar".
  // Reutiliza el route handler /api/doctor/appointment-status que usa la agenda.
  async function handleConfirmAppointment(id: string) {
    setConfirmingId(id);
    try {
      const res = await fetch('/api/doctor/appointment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointment_id: id, new_status: 'confirmed' }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        showToast({ type: 'error', message: err?.error ?? 'Error al confirmar la cita' });
        return;
      }
      showToast({ type: 'success', message: 'Cita confirmada exitosamente' });
      // Optimista para la lista "Por confirmar" + refetch para que la cita del dia
      // cambie su badge a "Confirmada" (vive en otro estado, todayAppointments).
      setScheduledAppointments((prev) => prev.filter((a) => a.id !== id));
      setRefreshKey((k) => k + 1);
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al confirmar la cita' });
    } finally {
      setConfirmingId(null);
    }
  }

  // Abre el modal de ingreso y carga conceptos/consultas/pacientes de forma lazy.
  async function handleOpenIncomeModal() {
    setIncomeError('');
    setShowIncomeModal(true);
    try {
      const doctorId = await getDoctorId();
      const [concepts, consultations, patients] = await Promise.all([
        getIncomeConcepts(),
        getConsultationsForReports(50),
        doctorId ? getPatients(doctorId) : Promise.resolve([]),
      ]);
      setIncomeConcepts(concepts);
      setIncomeConsultations(consultations);
      setIncomePatients(patients);
    } catch (err: unknown) {
      reportError('doctor/page', 'handleOpenIncomeModal', err);
    }
  }

  // Registra un ingreso manual extraordinario desde el modal de inicio.
  // Misma lógica que handleAddIncome en /doctor/finances/page.tsx.
  async function handleSaveIncome(e: React.FormEvent) {
    e.preventDefault();
    setIncomeError('');
    if (!incomeForm.description || !incomeForm.amount) {
      setIncomeError('Descripción y monto son obligatorios.');
      return;
    }
    setIncomeSaving(true);
    try {
      const res = await addIncome({
        description: incomeForm.description,
        amount: parseFloat(incomeForm.amount),
        currency: 'USD',
        conceptId: incomeForm.conceptId || undefined,
        date: incomeForm.date || undefined,
        relatedConsultationId: incomeForm.relatedConsultationId || null,
        patientId: incomeForm.relatedConsultationId ? null : incomeForm.patientId || null,
      });
      if (!res.success) {
        setIncomeError(res.error);
      } else {
        setIncomeForm({
          description: '',
          amount: '',
          conceptId: '',
          date: todayStr,
          relatedConsultationId: '',
          patientId: '',
        });
        setShowIncomeModal(false);
        showToast({ type: 'success', message: 'Ingreso registrado' });
        setRefreshKey((k) => k + 1);
      }
    } catch (err: unknown) {
      reportError('doctor/page', 'handleSaveIncome', err);
      setIncomeError('Ocurrió un error al registrar el ingreso.');
    }
    setIncomeSaving(false);
  }

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
              {/*
                Antes caía a "Dr." fijo, así que a un psicólogo la app lo trataba de
                doctor sin que él lo hubiera elegido nunca. `getProfessionalTitle` usa
                el título cargado y, si no hay, lo deriva de la especialidad
                (psicología → "Psic.", odontología → "Odont."). Es el mismo helper que
                ya usa el booking público, así que el especialista se ve igual en los
                dos lados.
              */}
              {profile?.full_name
                ? `${getProfessionalTitle(profile.professional_title, profile.specialty)} ${profile.full_name}`
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

        {/* Puesta en marcha: sustituye las dos tarjetas sueltas (plantillas /
            consultorio) por un stepper con progreso. Se oculta solo al completarse. */}
        {profile !== null && (
          <SetupStepper
            steps={[
              {
                id: 'datos',
                label: 'Completa tu información',
                hint: 'Título profesional, especialidad y teléfono de contacto.',
                href: '/doctor/settings',
                done: Boolean(profile.professional_title && profile.specialty && profile.phone),
              },
              {
                id: 'consultorio',
                label: 'Crea tu consultorio',
                hint: 'Sin un consultorio activo no se generan horarios ni se reciben citas.',
                href: '/doctor/offices',
                done: hasOffices === true,
              },
              {
                id: 'servicios',
                label: 'Define tus servicios',
                hint: 'Lo que ofreces y a qué precio; es lo que verá el paciente al agendar.',
                href: '/doctor/services',
                done: hasServices === true,
              },
              {
                id: 'branding',
                label: 'Personaliza tu marca',
                hint: 'Tu logo y tu firma salen en récipes, informes y constancias.',
                href: '/doctor/settings?tab=templates',
                done: Boolean(profile.logoUrl && profile.signatureUrl),
              },
              {
                id: 'pagos',
                label: 'Registra tus métodos de pago',
                hint: 'Sin ellos el paciente no sabe cómo pagarte al reservar.',
                href: '/doctor/settings?tab=payments',
                done: profile.paymentMethods.length > 0,
              },
            ]}
          />
        )}
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
                Delta Salud
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
              Tu portal de especialista está listo
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
              {/* Paciente que llega SIN cita: se registra con la hora actual. */}
              <button
                onClick={() => setShowImmediate(true)}
                className="flex items-center justify-center sm:justify-start gap-2 backdrop-blur text-white font-semibold text-[13px] px-4 py-2.5 rounded-full transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                }}
              >
                <Zap className="w-4 h-4" />
                <span>Consulta Inmediata</span>
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

        {/* ── Por confirmar: citas con status=scheduled pendientes de acción ── */}
        {scheduledAppointments.length > 0 && (
          <div
            className="p-4 sm:p-5"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 'var(--dh-r-xl)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4" style={{ color: '#b45309' }} />
              <h2 className="text-sm font-bold" style={{ color: '#92400e' }}>
                Por confirmar
              </h2>
              <span
                className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  fontFamily: 'var(--dh-font-mono)',
                }}
              >
                {scheduledAppointments.length}
              </span>
              <Link
                href="/doctor/agenda"
                className="ml-auto text-xs font-semibold flex items-center gap-1"
                style={{ color: '#92400e' }}
              >
                Ver agenda
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2">
              {scheduledAppointments.map((apt) => {
                const isConfirming = confirmingId === apt.id;
                const dateStr = new Intl.DateTimeFormat('es-VE', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                }).format(new Date(apt.scheduledAt));
                const timeStr = new Intl.DateTimeFormat('es-VE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                }).format(new Date(apt.scheduledAt));

                return (
                  <div
                    key={apt.id}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-yellow-50 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #fde68a' }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ver detalles de la cita de ${apt.patientName ?? 'paciente'}`}
                    onClick={() => setDetailApptId(apt.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailApptId(apt.id);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#92400e' }}>
                        {apt.patientName ?? 'Paciente'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>
                        {dateStr} · {timeStr}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        // Prevent row click from also firing
                        e.stopPropagation();
                        void handleConfirmAppointment(apt.id);
                      }}
                      disabled={isConfirming || confirmingId !== null}
                      className="shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'var(--dh-turquoise)' }}
                      aria-label={`Confirmar cita de ${apt.patientName ?? 'paciente'}`}
                    >
                      {isConfirming ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      {isConfirming ? 'Confirmando...' : 'Confirmar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 3 KPI Cards: ingresos, pacientes, atendidos ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <StatCard
            label="Ingresos totales"
            value={format(allTimeStats.total_revenue_lifetime)}
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
            label="Consultas atendidas"
            value={allTimeStats.patients_attended.toLocaleString('es-VE')}
            icon={<CheckCircle size={16} />}
            subtitle="Total de consultas registradas"
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
              <div className="space-y-2 overflow-y-auto pr-0.5" style={{ maxHeight: '320px' }}>
                {todayAppointments.map((apt) => {
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
                  {format(financialData.total_revenue)}
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
                className="p-3"
                style={{
                  background: 'var(--dh-amber-50, #fffbeb)',
                  border: '1px solid var(--dh-amber-100, #fde68a)',
                  borderRadius: 'var(--dh-r-md)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: '#b45309' }} />
                    <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                      Por ingresar
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: '#92400e' }}>
                      {format(financialData.pending_amount)}
                    </p>
                    {bcvRate && financialData.pending_amount > 0 && (
                      <p className="text-[11px]" style={{ color: '#b45309' }}>
                        {toBs(financialData.pending_amount)}
                      </p>
                    )}
                  </div>
                </div>
                {financialData.pending_amount > 0 && (
                  <Link
                    href="/doctor/cobros"
                    className="mt-2 flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: '#b45309' }}
                  >
                    Ver consultas pendientes de cobro
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
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
                    {format(
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
              {planUnlocks(planFeatures, 'finances') ? (
                <>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => void handleOpenIncomeModal()}
                      className="flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: 'var(--dh-turquoise)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ingreso
                    </button>
                    <button
                      onClick={handleOpenPaymentModal}
                      className="flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors"
                      style={{
                        background: 'var(--dh-turquoise-50)',
                        border: '1px solid var(--dh-turquoise-100)',
                        color: 'var(--dh-turquoise-700)',
                      }}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Cobros
                    </button>
                    <button
                      onClick={() => setShowExpenseModal(true)}
                      className="flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[11px] font-semibold transition-colors"
                      style={{
                        background: 'var(--dh-gray-50)',
                        border: '1px solid var(--dh-gray-200)',
                        color: 'var(--dh-gray-800)',
                      }}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Gasto
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
                </>
              ) : (
                <div
                  className="mt-2 px-4 py-3 rounded-lg flex items-center justify-between gap-3"
                  style={{
                    background: 'var(--dh-gray-50)',
                    border: '1px solid var(--dh-gray-100)',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--dh-gray-400)' }}
                    />
                    <p className="text-xs text-slate-500">
                      Finanzas disponible en Delta Base o superior
                    </p>
                  </div>
                  <Link
                    href="/doctor/upgrade"
                    className="shrink-0 text-[11px] font-bold text-white px-3 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'var(--dh-turquoise)' }}
                  >
                    Mejorar plan
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* AppointmentDetailModal — se abre al hacer click en una cita "Por confirmar" */}
      {detailApptId && (
        <AppointmentDetailModal
          appointmentId={detailApptId}
          onClose={() => setDetailApptId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onReschedule={(req: RescheduleRequest) => {
            setDetailApptId(null);
            setRescheduleAppt(req);
          }}
        />
      )}

      {/* RescheduleModal — abre cuando el doctor hace click en "Reagendar" desde el dashboard */}
      {rescheduleAppt && (
        <RescheduleModal
          appointmentId={rescheduleAppt.id}
          patientName={rescheduleAppt.patientName}
          currentScheduledAt={rescheduleAppt.scheduledAt}
          onClose={() => setRescheduleAppt(null)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {/* Modal: crear consulta (estilo acordeón).
          onSuccess: el modal maneja la navegación internamente (success step).
          Solo hacemos limpieza aquí y refrescamos el dashboard. */}
      {showImmediate && (
        <ImmediateConsultationModal
          onClose={() => setShowImmediate(false)}
          onCreated={(consultationId) => {
            setShowImmediate(false);
            setRefreshKey((k) => k + 1);
            // El paciente está enfrente: se abre la consulta para atenderlo.
            if (consultationId) router.push(`/doctor/consultations?open=${consultationId}`);
          }}
        />
      )}

      <NewAppointmentFlow
        open={showNewFlow}
        onClose={() => {
          setShowNewFlow(false);
          setPreselectPatientId(null);
        }}
        onSuccess={() => {
          setPreselectPatientId(null);
          setRefreshKey((k) => k + 1);
        }}
        initialContext={{
          origin: 'dashboard_btn',
          // L3 (2026-04-29): pre-rellenar paciente si viene del quick action.
          ...(preselectPatientId ? { patientId: preselectPatientId } : {}),
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
                onClick={() => {
                  setNewAppointmentPatientId(null);
                  setPreselectPatientId(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Más tarde
              </button>
              <button
                onClick={() => {
                  // Close the mini-prompt and open the appointment flow.
                  // preselectPatientId already holds the id; NewAppointmentFlow
                  // will read it via initialContext without the mini-prompt visible.
                  setNewAppointmentPatientId(null);
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

      {/* Modal: Registrar pago — lista cobros pendientes y permite aprobarlos */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Registrar pago</h2>
                  <p className="text-xs text-slate-400">Cobros pendientes de aprobación</p>
                </div>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5">
              {loadingPendingPayments ? (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Cargando cobros pendientes...</span>
                </div>
              ) : pendingPayments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-7 h-7 text-emerald-500" />
                  </div>
                  <p className="font-semibold text-slate-800 mb-1">Todo al día</p>
                  <p className="text-sm text-slate-400 mb-4">
                    No hay cobros pendientes de aprobación.
                  </p>
                  <Link
                    href="/doctor/cobros"
                    onClick={() => setShowPaymentModal(false)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700"
                  >
                    Ver historial completo
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingPayments.map((payment) => {
                    const patientName = payment.appointment?.patient_name || 'Paciente';
                    const concept =
                      payment.appointment?.plan_name ||
                      payment.consultation?.consultation_code ||
                      'Consulta';
                    const amount = payment.amount_usd ?? 0;
                    const dateStr = payment.appointment?.scheduled_at || payment.created_at;
                    const isApproving = approvingPaymentId === payment.id;

                    return (
                      <div
                        key={payment.id}
                        className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50"
                      >
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {patientName}
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{concept}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Intl.DateTimeFormat('es-VE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            }).format(new Date(dateStr))}
                          </p>
                        </div>

                        {/* Monto */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-900">{format(amount)}</p>
                          {bcvRate && amount > 0 && (
                            <p className="text-[11px] text-slate-400">{toBs(amount)}</p>
                          )}
                        </div>

                        {/* Botón aprobar */}
                        <button
                          onClick={() => handleApprovePayment(payment)}
                          disabled={isApproving || approvingPaymentId !== null}
                          className="shrink-0 flex items-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: 'var(--dh-turquoise)' }}
                          aria-label={`Aprobar pago de ${patientName}`}
                        >
                          {isApproving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          {isApproving ? 'Aprobando...' : 'Aprobar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {!loadingPendingPayments && pendingPayments.length > 0 && (
              <div className="p-4 pt-3 border-t border-slate-100 shrink-0 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {pendingPayments.length} cobro{pendingPayments.length !== 1 ? 's' : ''} pendiente
                  {pendingPayments.length !== 1 ? 's' : ''}
                </span>
                <Link
                  href="/doctor/cobros"
                  onClick={() => setShowPaymentModal(false)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  Ver detalle completo
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Registrar ingreso — mismo componente que /doctor/finances */}
      {showIncomeModal && (
        <IncomeModal
          concepts={incomeConcepts}
          consultations={incomeConsultations}
          patients={incomePatients}
          form={incomeForm}
          saving={incomeSaving}
          error={incomeError}
          onChangeForm={setIncomeForm}
          onSubmit={(e) => void handleSaveIncome(e)}
          onClose={() => {
            setShowIncomeModal(false);
            setIncomeError('');
          }}
          onCreateConcept={async (name) => {
            const res = await createIncomeConcept(name);
            if (res.success) {
              setIncomeConcepts((prev) => [...prev, res.data]);
              setIncomeForm((f) => ({ ...f, conceptId: res.data.id }));
            }
            return res;
          }}
          onUpdateConcept={async (id, patch) => {
            const res = await updateIncomeConcept(id, patch);
            if (res.success) {
              setIncomeConcepts((prev) => prev.map((c) => (c.id === id ? res.data : c)));
            }
            return res;
          }}
          onDeleteConcept={async (id) => {
            const res = await deleteIncomeConcept(id);
            if (res.success) {
              setIncomeConcepts((prev) => prev.filter((c) => c.id !== id));
              if (incomeForm.conceptId === id) {
                setIncomeForm((f) => ({ ...f, conceptId: '' }));
              }
            }
            return res;
          }}
          onCreatePatient={async (data) => {
            const doctorId = await getDoctorId();
            if (!doctorId) return null;
            const res = await addPatient(doctorId, {
              full_name: data.full_name,
              cedula: data.cedula ?? undefined,
              phone: data.phone ?? undefined,
              email: data.email ?? undefined,
              birth_date: data.birth_date ?? undefined,
              age: data.age ?? undefined,
              sex: data.sex ?? undefined,
              blood_type: data.blood_type ?? undefined,
              address: data.address ?? undefined,
              city: data.city ?? undefined,
              allergies: data.allergies ?? undefined,
              chronic_conditions: data.chronic_conditions ?? undefined,
              emergency_contact_name: data.emergency_contact_name ?? undefined,
              emergency_contact_phone: data.emergency_contact_phone ?? undefined,
              emergency_contact_relationship: data.emergency_contact_relationship ?? undefined,
              notes: data.notes ?? undefined,
              source: 'manual',
            });
            if (!res.success) return null;
            // Agregar el nuevo paciente a la lista local para que aparezca en el select
            setIncomePatients((prev) => [
              {
                id: res.patient_id,
                doctor_id: doctorId,
                full_name: data.full_name,
                age: data.age ?? null,
                phone: data.phone ?? null,
                cedula: data.cedula ?? null,
                email: data.email ?? null,
                sex: data.sex ?? null,
                notes: data.notes ?? null,
                source: 'manual',
                created_at: new Date().toISOString(),
              },
              ...prev,
            ]);
            return { id: res.patient_id, full_name: data.full_name };
          }}
        />
      )}

      {/* Modal de método de pago — al aprobar un cobro pendiente SIN método.
          Captura método (obligatorio) + referencia, persiste, y luego aprueba. */}
      {methodModalPayment && (
        <PaymentMethodModal
          open={!!methodModalPayment}
          consultationId={methodModalPayment.id}
          availablePaymentMethods={[]}
          onClose={() => setMethodModalPayment(null)}
          onPersist={async (id, method, reference) => {
            const res = await updatePaymentDetails(id, { method, reference });
            return res.ok
              ? { success: true as const }
              : { success: false as const, error: res.error };
          }}
          onConfirmed={() => {
            const p = methodModalPayment;
            setMethodModalPayment(null);
            if (p) void approvePaymentRow(p.id);
          }}
        />
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

      {/* Bienvenida: tour breve de los modulos segun el plan. */}
      {showWelcome && (
        <WelcomeModal
          planFeatures={planFeatures}
          onClose={() => setShowWelcome(false)}
          onDismissForever={dismissWelcomeForever}
        />
      )}
    </>
  );
}
