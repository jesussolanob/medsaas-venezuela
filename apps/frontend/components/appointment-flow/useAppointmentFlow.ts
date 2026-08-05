'use client';

import { useEffect, useState } from 'react';
import { isValidEmail } from '@/lib/validation';
import { showToast } from '@/components/ui/Toaster';
import {
  DoctorOffice,
  PatientLookup,
  PricingPlan,
  PatientPackageInfo,
  NewPatientForm,
  GENERIC_PLAN,
  METHODS_WITH_RECEIPT,
  getTimeSlotsForDate,
  isoToCaracasHHMM,
  normalizePatient,
  normalizeService,
} from './appointment-flow.utils';
import type { AppointmentContext } from './NewAppointmentFlow';

// ---------------------------------------------------------------------------
// Fallback doctor UUID (Etapa 1 dev-stub)
// ---------------------------------------------------------------------------
const FALLBACK_DEV_DOCTOR_UUID = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

/**
 * Result returned to the parent once the appointment is fully created.
 * Emitted via onSuccess after the user dismisses the in-modal success step.
 */
export type AppointmentSuccessResult = {
  appointmentId: string;
  consultationId: string | null;
};

/**
 * Context passed to the deferred-sessions prompt shown after a successful
 * multi-session appointment creation.
 */
export type DeferredSessionsContext = {
  /** UUID of the created appointment (session 1). */
  appointmentId: string;
  /** UUID of the pricing plan (used by the bulk-create endpoint). */
  planId: string;
  /** plan.name for display purposes. */
  planName: string;
  /** Total number of sessions in the plan. */
  sessionsCount: number;
  /** UUID of the patient. */
  patientId: string;
  /** UUID of the selected office, if any. */
  officeId: string | null;
  /** Appointment mode chosen for the first session. */
  appointmentMode: 'presencial' | 'online';
};

export type AppointmentFlowState = {
  currentStep: number;
  setCurrentStep: (n: number) => void;
  doctorId: string;
  submitting: boolean;
  uploadingReceipt: boolean;
  globalError: string | null;
  setGlobalError: (msg: string | null) => void;
  submit: () => Promise<void>;
  /**
   * Set after a successful multi-session plan appointment is created.
   * Consumed by NewAppointmentFlow to show the "schedule remaining / agendar después" prompt.
   * null = no deferred prompt needed (single-session plan, or package used).
   */
  deferredContext: DeferredSessionsContext | null;
  clearDeferredContext: () => void;
  /**
   * Populated after a successful submit; consumed by NewAppointmentFlow to
   * render the in-modal success step with "Ir a la consulta" / "Cerrar".
   * null while the form is active or after the user dismisses the step.
   */
  successResult: AppointmentSuccessResult | null;
  clearSuccessResult: () => void;

  // Step 1 — Paciente
  patientQuery: string;
  setPatientQuery: (q: string) => void;
  patientResults: PatientLookup[];
  selectedPatient: PatientLookup | null;
  selectPatient: (p: PatientLookup) => void;
  searchingPatients: boolean;
  showInlineCreator: boolean;
  setShowInlineCreator: (v: boolean) => void;
  newPatient: NewPatientForm;
  setNewPatient: React.Dispatch<React.SetStateAction<NewPatientForm>>;
  creatingPatient: boolean;
  createPatientInline: (e: React.FormEvent) => Promise<void>;

  // Step 2 — Consultorio
  offices: DoctorOffice[];
  loadingOffices: boolean;
  selectedOffice: DoctorOffice | null;
  setSelectedOffice: (o: DoctorOffice | null) => void;
  mode: 'presencial' | 'online';
  setMode: (m: 'presencial' | 'online') => void;
  confirmOfficeStep: () => void;

  // Step 3 — Tipo de consulta
  filteredPlans: PricingPlan[];
  loadingPlans: boolean;
  selectedPlan: PricingPlan | null;
  setSelectedPlan: (p: PricingPlan | null) => void;
  packages: PatientPackageInfo[];
  usePackage: string | null;
  setUsePackage: (id: string | null) => void;
  chiefComplaint: string;
  setChiefComplaint: (v: string) => void;
  confirmServiceTypeStep: () => void;

  // Step 4 — Horario
  scheduledAt: string;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  selectedTime: string;
  selectTime: (t: string) => void;
  weekOffset: number;
  setWeekOffset: (n: number) => void;
  unavailableTimes: Map<string, Set<string>>;
  loadingSlots: boolean;

  // Step 5 — Pago
  profilePaymentMethods: string[];
  profilePaymentDetails: Record<string, Record<string, string>>;
  paymentMethod: string | null;
  setPaymentMethod: (m: string | null) => void;
  paymentReference: string;
  setPaymentReference: (r: string) => void;
  receiptFile: File | null;
  setReceiptFile: (f: File | null) => void;

  // Derived
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  step4Done: boolean;
  step5Done: boolean;
  canSubmit: boolean;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAppointmentFlow(
  open: boolean,
  onClose: () => void,
  onSuccess: ((result: AppointmentSuccessResult) => void) | undefined,
  initialContext: AppointmentContext,
): AppointmentFlowState {
  const [currentStep, setCurrentStep] = useState(1);
  const [doctorId, setDoctorId] = useState(initialContext.doctorId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [deferredContext, setDeferredContext] = useState<DeferredSessionsContext | null>(null);
  const [successResult, setSuccessResult] = useState<AppointmentSuccessResult | null>(null);

  // Step 1 — Paciente
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<PatientLookup[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientLookup | null>(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showInlineCreator, setShowInlineCreator] = useState(false);
  const [newPatient, setNewPatient] = useState<NewPatientForm>({
    full_name: '',
    cedula: '',
    email: '',
    phone: '',
    birth_date: '',
    sex: '',
  });
  const [creatingPatient, setCreatingPatient] = useState(false);

  // Step 2 — Consultorio
  const [offices, setOffices] = useState<DoctorOffice[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<DoctorOffice | null>(null);
  const [mode, setMode] = useState<'presencial' | 'online'>('presencial');
  const [officeStepConfirmed, setOfficeStepConfirmed] = useState(false);

  // Step 3 — Tipo de consulta
  const [allPlans, setAllPlans] = useState<PricingPlan[]>([GENERIC_PLAN]);
  const [filteredPlans, setFilteredPlans] = useState<PricingPlan[]>([GENERIC_PLAN]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(GENERIC_PLAN);
  const [packages, setPackages] = useState<PatientPackageInfo[]>([]);
  const [usePackage, setUsePackage] = useState<string | null>(initialContext.packageId ?? null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [serviceTypeConfirmed, setServiceTypeConfirmed] = useState(false);

  // Step 4 — Horario
  const [scheduledAt, setScheduledAt] = useState(initialContext.slotStart ?? '');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [unavailableTimes, setUnavailableTimes] = useState<Map<string, Set<string>>>(new Map());
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Step 5 — Pago
  const [profilePaymentMethods, setProfilePaymentMethods] = useState<string[]>([]);
  const [profilePaymentDetails, setProfilePaymentDetails] = useState<
    Record<string, Record<string, string>>
  >({});
  const [paymentMethod, setPaymentMethod] = useState<string | null>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // ── Initialization: reset state when modal opens ────────────────────────
  useEffect(() => {
    if (!open) return;

    setCurrentStep(1);
    setGlobalError(null);
    setPatientQuery('');
    setPatientResults([]);
    setShowInlineCreator(false);
    setNewPatient({ full_name: '', cedula: '', email: '', phone: '', birth_date: '', sex: '' });
    setSelectedOffice(null);
    setOfficeStepConfirmed(false);
    setServiceTypeConfirmed(false);
    setFilteredPlans(allPlans);
    setSelectedPlan(allPlans[0] ?? GENERIC_PLAN);
    setUsePackage(initialContext.packageId ?? null);
    setChiefComplaint('');
    setSelectedDate('');
    setSelectedTime('');
    setWeekOffset(0);
    setUnavailableTimes(new Map());
    setPaymentMethod('');
    setPaymentReference('');
    setReceiptFile(null);

    // Pre-fill date/time from slotStart. Extraemos la fecha en Caracas (UTC-4)
    // con aritmética UTC para que fecha y hora pertenezcan al mismo día aunque
    // el navegador esté fuera de Venezuela (consistente con isoToCaracasHHMM).
    if (initialContext.slotStart) {
      const shifted = new Date(new Date(initialContext.slotStart).getTime() - 4 * 60 * 60 * 1000);
      const yyyy = shifted.getUTCFullYear();
      const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(shifted.getUTCDate()).padStart(2, '0');
      setSelectedDate(`${yyyy}-${mm}-${dd}`);
      setSelectedTime(isoToCaracasHHMM(initialContext.slotStart));
      setScheduledAt(initialContext.slotStart);
    } else {
      setScheduledAt('');
    }

    // Resolve doctorId
    if (!doctorId) {
      if (initialContext.doctorId) {
        setDoctorId(initialContext.doctorId);
      } else {
        fetch('/api/doctor/profile')
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            const id = json?.data?.id;
            setDoctorId(typeof id === 'string' && id ? id : FALLBACK_DEV_DOCTOR_UUID);
            // Also load payment methods from profile
            const pms: unknown = json?.data?.paymentMethods;
            const pds: unknown = json?.data?.paymentDetails;
            if (Array.isArray(pms) && pms.length > 0) {
              setProfilePaymentMethods(pms as string[]);
            }
            if (pds && typeof pds === 'object' && !Array.isArray(pds)) {
              setProfilePaymentDetails(pds as Record<string, Record<string, string>>);
            }
          })
          .catch(() => setDoctorId(FALLBACK_DEV_DOCTOR_UUID));
      }
    }

    // Pre-load patient if provided
    if (initialContext.patientId) {
      // Limpiar el paciente anterior antes del fetch async: evita que
      // step1Done quede true con el paciente equivocado y dispare la carga
      // de paquetes de otro paciente durante la latencia de la solicitud.
      setSelectedPatient(null);
      fetch(`/api/patients/${initialContext.patientId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.data) {
            setSelectedPatient(normalizePatient(json.data));
            setCurrentStep(2);
          }
        })
        .catch(() => {
          /* degrade silently */
        });
    } else {
      setSelectedPatient(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Load doctor profile (payment methods) when doctorId is first resolved ─
  useEffect(() => {
    if (!open || !doctorId || profilePaymentMethods.length > 0) return;
    fetch('/api/doctor/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const pms: unknown = json?.data?.paymentMethods;
        const pds: unknown = json?.data?.paymentDetails;
        if (Array.isArray(pms) && pms.length > 0) {
          setProfilePaymentMethods(pms as string[]);
        }
        if (pds && typeof pds === 'object' && !Array.isArray(pds)) {
          setProfilePaymentDetails(pds as Record<string, Record<string, string>>);
        }
      })
      .catch(() => {
        /* use fallback methods */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doctorId]);

  // ── Load offices ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoadingOffices(true);
    fetch('/api/doctor/offices', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        // El backend devuelve camelCase (slotDuration/bufferMinutes); el resto del
        // flujo lee snake_case (slot_duration/buffer_minutes). Sin este mapeo, el
        // buffer entre consultas quedaba en undefined→0 y los slots salían cada
        // slot_duration en vez de slot_duration+buffer (p.ej. 9:00,9:30 en vez de 9:00,9:40).
        const raw = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
        const list: DoctorOffice[] = raw.map((o) => ({
          ...(o as unknown as DoctorOffice),
          slot_duration:
            (o.slot_duration as number | null | undefined) ??
            (o.slotDuration as number | null | undefined) ??
            30,
          buffer_minutes:
            (o.buffer_minutes as number | null | undefined) ??
            (o.bufferMinutes as number | null | undefined) ??
            0,
        }));
        setOffices(list);
        // Si el doctor tiene consultorios, auto-seleccionar el primero (ya no existe
        // la opción "Sin consultorio específico"). Solo si aún no hay uno elegido.
        if (list.length > 0) {
          setSelectedOffice((prev) => prev ?? list[0]);
        }
      })
      .catch(() => setOffices([]))
      .finally(() => setLoadingOffices(false));
  }, [open]);

  // ── Load initial plans (all) ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoadingPlans(true);
    fetch('/api/doctor/services', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        const raw: Record<string, unknown>[] = Array.isArray(json.data) ? json.data : [];
        const mapped = raw.map(normalizeService);
        const plans = mapped.length > 0 ? mapped : [GENERIC_PLAN];
        setAllPlans(plans);
        setFilteredPlans(plans);
        setSelectedPlan(plans[0] ?? GENERIC_PLAN);
      })
      .catch(() => {
        setAllPlans([GENERIC_PLAN]);
        setFilteredPlans([GENERIC_PLAN]);
        setSelectedPlan(GENERIC_PLAN);
      })
      .finally(() => setLoadingPlans(false));
  }, [open]);

  // ── Filter plans by selected office ────────────────────────────────────
  useEffect(() => {
    if (!selectedOffice) {
      setFilteredPlans(allPlans);
      setSelectedPlan((prev) =>
        prev && allPlans.some((p) => p.id === prev.id) ? prev : (allPlans[0] ?? GENERIC_PLAN),
      );
      return;
    }
    setLoadingPlans(true);
    fetch(`/api/doctor/services?officeId=${encodeURIComponent(selectedOffice.id)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        const raw: Record<string, unknown>[] = Array.isArray(json.data) ? json.data : [];
        const mapped = raw.map(normalizeService);
        const plans = mapped.length > 0 ? mapped : [GENERIC_PLAN];
        setFilteredPlans(plans);
        setSelectedPlan((prev) =>
          prev && plans.some((p) => p.id === prev.id) ? prev : (plans[0] ?? GENERIC_PLAN),
        );
      })
      .catch(() => setFilteredPlans(allPlans))
      .finally(() => setLoadingPlans(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOffice]);

  // ── Ajustar modalidad según consultorio ──────────────────────────────────
  useEffect(() => {
    // NO se limpia unavailableTimes aquí: la caché de ocupados/bloqueados es
    // por fecha y a nivel del DOCTOR (independiente del consultorio), y la lista
    // de slots por sede se computa aparte en StepSchedule. Limpiarla aquí
    // provocaba una carrera que borraba los ocupados recién cargados.
    if (!selectedOffice?.modality) return;
    if (selectedOffice.modality === 'in_person') setMode('presencial');
    else if (selectedOffice.modality === 'online') setMode('online');
    // 'both' → mantiene la selección actual
  }, [selectedOffice]);

  // ── Cargar paquetes del paciente ────────────────────────────────────────
  useEffect(() => {
    if (!selectedPatient || !open) return;
    fetch(`/api/doctor/patient-packages?patient_id=${selectedPatient.id}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        const all: PatientPackageInfo[] = (json.data || []) as PatientPackageInfo[];
        setPackages(all.filter((p) => p.used_sessions < p.total_sessions));
      })
      .catch(() => setPackages([]));
  }, [selectedPatient, open]);

  // ── Búsqueda de pacientes (debounced) ───────────────────────────────────
  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2) {
      setPatientResults([]);
      return;
    }
    setSearchingPatients(true);
    const t = setTimeout(async () => {
      try {
        // /api/patients (lista) IGNORA `search` → devolvía TODOS sin filtrar (bug: al
        // escribir "marco" salía "Lucas Rivas"). El search real filtra por término.
        const res = await fetch(
          `/api/patients/search?q=${encodeURIComponent(patientQuery)}&limit=8`,
        );
        const json = res.ok ? await res.json() : {};
        const raw: Record<string, unknown>[] =
          json?.data?.patients ?? json?.data ?? json?.patients ?? [];
        setPatientResults(raw.map(normalizePatient));
      } catch {
        setPatientResults([]);
      } finally {
        setSearchingPatients(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  // ── Sincronizar scheduledAt cuando cambia fecha u hora ─────────────────
  useEffect(() => {
    if (!selectedDate || !selectedTime) {
      setScheduledAt('');
      return;
    }
    // Forzar Caracas con offset explícito -04:00 (Venezuela no tiene DST).
    // Consistente con la generación de slots (más abajo) y con el booking
    // público (BookingClient "RONDA 28"). Evita que un navegador fuera de
    // Caracas produzca una hora absoluta distinta a la del slot mostrado.
    const local = new Date(`${selectedDate}T${selectedTime}:00-04:00`);
    setScheduledAt(local.toISOString());
  }, [selectedDate, selectedTime]);

  // ── Cargar slots no disponibles al cambiar la fecha ─────────────────────
  useEffect(() => {
    if (!selectedDate || !doctorId) return;
    if (unavailableTimes.has(selectedDate)) return; // ya cargado

    const fetchUnavailable = async () => {
      setLoadingSlots(true);
      const blocked = new Set<string>();

      // Citas ya ocupadas para esa fecha
      try {
        const apptRes = await fetch(
          `/api/doctor/appointments?date=${encodeURIComponent(selectedDate)}`,
        );
        if (apptRes.ok) {
          const apptJson = (await apptRes.json()) as { data?: { bookedAt?: string[] } };
          const bookedAt = apptJson?.data?.bookedAt ?? [];
          bookedAt.forEach((iso) => blocked.add(isoToCaracasHHMM(iso)));
        }
      } catch {
        /* silent */
      }

      // Bloques de disponibilidad (availability-blocks) para esa fecha
      try {
        const from = encodeURIComponent(`${selectedDate}T00:00:00-04:00`);
        const to = encodeURIComponent(`${selectedDate}T23:59:59-04:00`);
        const blocksRes = await fetch(`/api/doctor/availability-blocks?from=${from}&to=${to}`);
        if (blocksRes.ok) {
          const blocksJson = (await blocksRes.json()) as {
            data?: Array<{ starts_at: string; ends_at: string }>;
          };
          const blockList = blocksJson?.data ?? [];
          // Verificar cada slot del día contra los bloques
          const daySlots = getTimeSlotsForDate(selectedDate, selectedOffice);
          daySlots.forEach((slotTime) => {
            const slotISO = new Date(`${selectedDate}T${slotTime}:00-04:00`);
            if (
              blockList.some(
                (b) => slotISO >= new Date(b.starts_at) && slotISO < new Date(b.ends_at),
              )
            ) {
              blocked.add(slotTime);
            }
          });
        }
      } catch {
        /* silent */
      }

      setUnavailableTimes((prev) => new Map(prev).set(selectedDate, blocked));
      setLoadingSlots(false);
    };

    void fetchUnavailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, doctorId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function clearDeferredContext() {
    setDeferredContext(null);
  }

  function clearSuccessResult() {
    setSuccessResult(null);
  }

  function selectPatient(p: PatientLookup) {
    setSelectedPatient(p);
    setCurrentStep(2);
  }

  function confirmOfficeStep() {
    setOfficeStepConfirmed(true);
    setCurrentStep(3);
  }

  function confirmServiceTypeStep() {
    setServiceTypeConfirmed(true);
    setCurrentStep(4);
  }

  function selectTime(t: string) {
    setSelectedTime(t);
    // Auto-advance to step 5 after time selection
    setCurrentStep(5);
  }

  async function createPatientInline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPatient.cedula.trim() || newPatient.cedula.trim().length < 5) {
      setGlobalError('La cédula es obligatoria');
      return;
    }
    if (newPatient.email && !isValidEmail(newPatient.email)) {
      setGlobalError('El email no tiene un formato válido.');
      return;
    }
    // Al menos un canal de contacto (email O teléfono) es obligatorio.
    if (!newPatient.email?.trim() && !newPatient.phone?.trim()) {
      setGlobalError('Indica al menos un correo o un teléfono');
      return;
    }
    setCreatingPatient(true);
    setGlobalError(null);
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // doctor_id lo exige CreatePatientDtoSchema; el backend lo sobreescribe
          // con la identidad autenticada (anti-IDOR). Sin este campo el POST daba 400.
          doctor_id: doctorId || FALLBACK_DEV_DOCTOR_UUID,
          full_name: newPatient.full_name || undefined,
          cedula: newPatient.cedula || undefined,
          email: newPatient.email || undefined,
          phone: newPatient.phone || undefined,
          birth_date: newPatient.birth_date || undefined,
          sex: newPatient.sex || undefined,
          source: 'inline_booking',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.data) {
          const p = normalizePatient(json.data);
          setSelectedPatient(p);
          setShowInlineCreator(false);
          setCurrentStep(2);
          setGlobalError(`Usando paciente existente: ${p.full_name}`);
          return;
        }
        throw new Error(json?.error?.message ?? json?.message ?? 'Error al crear paciente');
      }
      if (!json?.data) throw new Error('Respuesta inesperada del servidor');
      const created = normalizePatient(json.data);
      setSelectedPatient(created);
      showToast({ type: 'success', message: 'Paciente creado correctamente' });
      setShowInlineCreator(false);
      setCurrentStep(2);
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Error al crear paciente');
    } finally {
      setCreatingPatient(false);
    }
  }

  async function submit() {
    if (!selectedPatient || !scheduledAt || (!selectedPlan && !usePackage)) {
      setGlobalError('Faltan datos obligatorios');
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    try {
      // Subir comprobante si aplica
      let receiptUrl: string | null = null;
      if (
        receiptFile &&
        paymentMethod !== null &&
        paymentMethod !== '' &&
        METHODS_WITH_RECEIPT.includes(paymentMethod)
      ) {
        setUploadingReceipt(true);
        try {
          const fd = new FormData();
          fd.append('file', receiptFile);
          fd.append('kind', 'receipt');
          const uploadRes = await fetch('/api/storage/upload', {
            method: 'POST',
            body: fd,
          });
          const uploadJson = (await uploadRes.json()) as {
            data?: { url?: string };
            error?: { message?: string };
          };
          if (!uploadRes.ok || !uploadJson?.data?.url) {
            throw new Error(uploadJson?.error?.message ?? 'Error al subir comprobante');
          }
          receiptUrl = uploadJson.data.url ?? null;
        } finally {
          setUploadingReceipt(false);
        }
      }

      const r = await fetch('/api/doctor/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          patientId: selectedPatient.id,
          patientName: selectedPatient.full_name,
          patientPhone: selectedPatient.phone,
          patientEmail: selectedPatient.email,
          patientCedula: selectedPatient.cedula,
          scheduledAt,
          chiefComplaint: chiefComplaint || null,
          planName: selectedPlan?.name ?? GENERIC_PLAN.name,
          planPrice: usePackage ? 0 : (selectedPlan?.price_usd ?? GENERIC_PLAN.price_usd),
          sessionsCount: selectedPlan?.sessions_count ?? GENERIC_PLAN.sessions_count,
          paymentMethod: usePackage ? 'package' : (paymentMethod ?? null),
          paymentReference: usePackage ? null : paymentReference || null,
          receiptUrl,
          appointmentMode: mode,
          // El BFF (/api/book) desestructura `officeId` (camelCase) y lo reenvía
          // como office_id al backend. Enviar snake_case aquí dejaba el office
          // siempre en null → el consultorio del paso 2 no se vinculaba a la cita.
          officeId: selectedOffice?.id ?? null,
          packageId: usePackage,
        }),
      });
      const j = (await r.json()) as {
        error?: string;
        appointmentId?: string;
        consultationId?: string | null;
      };
      if (!r.ok) throw new Error(j.error ?? 'Error al crear cita');

      const createdAppointmentId = j.appointmentId ?? '';
      const createdConsultationId = j.consultationId ?? null;

      // Store the result so NewAppointmentFlow can render the success step.
      // The toast is NOT shown here — the success step itself confirms creation.
      // onSuccess is called from the success step after the user dismisses it.
      setSuccessResult({
        appointmentId: createdAppointmentId,
        consultationId: createdConsultationId,
      });

      // Multi-session plan (not a package): show the deferred-sessions prompt instead.
      // Condition: plan has >1 session, we're not using an existing package,
      // and the plan has a real UUID (not the generic fallback).
      const planSessions = selectedPlan?.sessions_count ?? 1;
      const planId = selectedPlan?.id ?? 'generic';
      if (!usePackage && planSessions > 1 && planId !== 'generic' && selectedPatient) {
        // Clear successResult so the deferred modal takes priority.
        setSuccessResult(null);
        setDeferredContext({
          appointmentId: createdAppointmentId,
          planId,
          planName: selectedPlan?.name ?? '',
          sessionsCount: planSessions,
          patientId: selectedPatient.id,
          officeId: selectedOffice?.id ?? null,
          appointmentMode: mode,
        });
        // Do NOT call onClose() yet — the parent will close after the deferred prompt.
        return;
      }

      // Single-session / package: successResult is already set above.
      // Do NOT call onClose() — the success step in NewAppointmentFlow handles it.
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
      setUploadingReceipt(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const step1Done = !!selectedPatient;
  const step2Done = step1Done && officeStepConfirmed;
  const step3Done = step2Done && (!!selectedPlan || !!usePackage) && serviceTypeConfirmed;
  const step4Done = step3Done && !!scheduledAt;
  // El paso de pago se considera resuelto si se usa un paquete prepagado
  // (cubre la consulta, no requiere método) o si el médico eligió un método /
  // "pagar después" (paymentMethod !== '': un id de método o null).
  const step5Done = step4Done && (!!usePackage || paymentMethod !== '');
  // Los métodos que requieren comprobante (pago móvil, transferencia, zelle,
  // binance) necesitan referencia o imagen de comprobante para poder crear la
  // cita — salvo que se use paquete o "pagar después" (paymentMethod null).
  const requiresProof =
    !usePackage &&
    paymentMethod !== null &&
    paymentMethod !== '' &&
    METHODS_WITH_RECEIPT.includes(paymentMethod);
  const canSubmit =
    !!selectedPatient &&
    !!scheduledAt &&
    (!!selectedPlan || !!usePackage) &&
    (!!usePackage || paymentMethod !== '') &&
    (!requiresProof || !!paymentReference || !!receiptFile) &&
    !submitting;

  return {
    currentStep,
    setCurrentStep,
    doctorId,
    submitting,
    uploadingReceipt,
    globalError,
    setGlobalError,
    submit,
    deferredContext,
    clearDeferredContext,
    successResult,
    clearSuccessResult,

    patientQuery,
    setPatientQuery,
    patientResults,
    selectedPatient,
    selectPatient,
    searchingPatients,
    showInlineCreator,
    setShowInlineCreator,
    newPatient,
    setNewPatient,
    creatingPatient,
    createPatientInline,

    offices,
    loadingOffices,
    selectedOffice,
    setSelectedOffice,
    mode,
    setMode,
    confirmOfficeStep,

    filteredPlans,
    loadingPlans,
    selectedPlan,
    setSelectedPlan,
    packages,
    usePackage,
    setUsePackage,
    chiefComplaint,
    setChiefComplaint,
    confirmServiceTypeStep,

    scheduledAt,
    selectedDate,
    setSelectedDate,
    selectedTime,
    selectTime,
    weekOffset,
    setWeekOffset,
    unavailableTimes,
    loadingSlots,

    profilePaymentMethods,
    profilePaymentDetails,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    receiptFile,
    setReceiptFile,

    step1Done,
    step2Done,
    step3Done,
    step4Done,
    step5Done,
    canSubmit,
  };
}
