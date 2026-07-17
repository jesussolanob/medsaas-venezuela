'use client';

import { useState, useEffect, useTransition, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// GenerateDocumentModal: reemplaza ConsultationInformePdfButton.
// Se importa con ssr:false para excluir @react-pdf del bundle de Node
// (el PDF se genera on-demand dentro del modal, no al montarse).
const GenerateDocumentModal = dynamic(() => import('./GenerateDocumentModal'), {
  ssr: false,
  loading: () => null,
});
// L7 (2026-04-29): se eliminan los iconos del cronómetro manual (Play, Square)
// pero mantenemos Timer para mostrar la duración calculada automáticamente.
import {
  ClipboardList,
  Search,
  Calendar,
  User,
  UserCheck,
  Banknote,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowDownCircle,
  Save,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  FileText,
  Stethoscope,
  Pill,
  Filter,
  Plus,
  X,
  Check,
  Printer,
  AlertTriangle,
  Sparkles,
  Wand2,
  History,
  Copy,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Upload,
  Timer,
  ExternalLink,
  Lock,
  RefreshCw,
  ArrowUpDown,
  Mic,
  Square,
} from 'lucide-react';
// Etapa 1: Supabase removed.
// PLACEHOLDER — following data sources have no backend endpoint yet (Fase 5):
//   - profiles (doctor name/logo/template/payment_methods) → GET /api/doctor/profile
//   - doctor_quick_items → no backend endpoint
//   - pricing_plans → GET /api/doctor/services
//   - doctor_templates → no backend endpoint
//   - appointments booked times → no backend endpoint in Etapa 1
// Those state vars stay empty/zero; the UI handles them gracefully (empty selects etc).
// MIGRATED in this file:
//   - consultations list → listConsultationsPaged (actions.ts)
//   - updateConsultaStatus → optimistic local state only (status field not in Etapa-1 schema)
//   - updatePagoStatus → approveConsultationPayment (actions.ts)
//   - openConsultation → getConsultation (actions.ts)
//   - saveReport → updateConsultation (actions.ts)
//   - autoSave → updateConsultation (actions.ts)
//   - saveRecipe → createPrescription (prescriptions.client.ts → /api/doctor/prescriptions)
//   - AI callAI → /api/doctor/ai without Supabase token
//   - applyAIResult → updateConsultation (actions.ts)
//   - reposo autoSave → PATCH /api/doctor/consultations (existing BFF route)
import { getDoctorId as getDevDoctorId, getDoctorProfile, getDoctorServices } from '../actions';
import { loadTemplateConfigs } from '@/app/doctor/templates/actions';
import type { TemplateConfigPdf, ContentBlock } from '@/components/pdf/MedicalDocumentPdf';
import {
  listConsultationsPaged,
  getPatientConsultations,
  getConsultation,
  updateConsultation,
  updateConsultationPaymentDetails,
  getQuickItems,
  updateAppointmentStatus,
} from './actions';
import Paginator, { PAGE_SIZE_ALL } from '@/components/ui/Paginator';
import { getEhrPatients } from '../ehr/actions';
import { getPatientPrescriptions, createPrescription } from './prescriptions.client';
import { useBcvRate } from '@/lib/useBcvRate';
import DynamicBlocks, { SnapshotBlock } from '@/components/consultation/DynamicBlocks';
import ConsultationRecorder from '@/components/consultation/ConsultationRecorder';
// RONDA 46: renderer de markdown ligero para outputs de Gemini
import MarkdownText from '@/components/shared/MarkdownText';
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow';
import PatientFichaModal from '@/components/patient/PatientFichaModal';
import { log } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { useDoctorFeatures } from '@/hooks/useDoctorFeatures';
import { showToast } from '@/components/ui/Toaster';
import ShareDocumentsModal from './ShareDocumentsModal';
import ApprovePaymentModal, { type ExistingExtraItem } from './ApprovePaymentModal';
import PaymentMethodModal from './PaymentMethodModal';
import IncomeModal, { type IncomeForm } from '@/components/finances/IncomeModal';
import {
  getIncomeConcepts,
  addIncome,
  createIncomeConcept,
  updateIncomeConcept,
  deleteIncomeConcept,
  type IncomeConcept,
} from '../finances/actions';

type Consultation = {
  id: string;
  consultation_code: string;
  consultation_date: string;
  created_at: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'no_show'; // Estado de la CONSULTA (no del pago)
  /** Raw appointment status (scheduled/confirmed/completed/no_show) — preservado para mostrar "Por confirmar" */
  appointment_status?: string | null;
  payment_status: 'pending' | 'approved'; // Quitamos 'cancelled' — los pagos no se cancelan
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_receipt_url?: string | null;
  appointment_id: string | null;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  /** Bug 6: populado en openConsultation tras fetch a /api/doctor/patients/:id */
  patient_email?: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  /** Monto total de la consulta (base + extras) tal como persiste el backend. */
  amount?: number | null;
  /** Monto base fijo de la consulta (sin extras). Expuesto por el backend en el detalle. */
  base_amount?: number | null;
  /** Servicios adicionales registrados en esta consulta. */
  extra_items?: ExistingExtraItem[] | null;
  /** Block STRUCTURE (metadata): key/label/content_type/sort_order/printable/send_to_patient.
   *  Routed to backend `blocks_structure` column. */
  blocks_structure?: Array<{
    key: string;
    label: string;
    content_type: string;
    sort_order: number;
    printable?: boolean;
    send_to_patient?: boolean;
  }> | null;
  /** Block VALUES (filled content): record of { [key]: value }.
   *  Routed to backend `blocks_snapshot` column. */
  blocks_snapshot?: Record<string, unknown> | null;
  blocks_data?: Record<string, unknown> | null;
  // AUDIT FIX 2026-04-28 (C-5): contador para optimistic locking del autosave.
  version?: number | null;
};

// Maps the linked appointment status (scheduled/confirmed/completed/no_show)
// to the consultation status shown in this view. "Atendida" (completed) and
// "No asistió" (no_show) persist across reloads instead of resetting to pending.
function mapAppointmentStatusToConsulta(
  apptStatus: string | null | undefined,
): Consultation['status'] {
  if (apptStatus === 'completed') return 'completed';
  if (apptStatus === 'no_show') return 'no_show';
  return 'pending';
}

// Estados de CONSULTA
const CONSULTA_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: 'Pendiente', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  in_progress: { label: 'En curso', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  completed: { label: 'Atendida', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  no_show: { label: 'No asistió', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

type Patient = {
  id: string;
  full_name: string;
  phone: string | null;
  email?: string | null;
  cedula?: string | null;
  age?: number | null;
  sex?: string | null;
  blood_type?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
};

type Medication = {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  presentation: string;
  indications: string;
};

type Recipe = {
  medications: Medication[];
  notes: string;
};

type AppointmentData = {
  payment_receipt_url?: string | null;
  payment_method?: string | null;
  plan_price?: number | null;
  plan_name?: string | null;
};

// Estados de PAGO únicamente (no estados de cita ni de consulta)
// Definición del usuario: Pendiente | Aprobado. NO existe "Rechazado".
const PAYMENT_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Aprobado', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

// Helper para resolver aliases legacy ('unpaid','pending_approval','cancelled') a 'pending'
function normalizePaymentStatus(s: string | null | undefined): 'pending' | 'approved' {
  return s === 'approved' ? 'approved' : 'pending';
}

/**
 * Construye el `blocks_data` inicial del editor a partir de la respuesta del backend.
 *
 * Fuente de verdad: el JSONB `blocks_snapshot` (valores por block_key). Cuando un
 * campo legacy (chief_complaint/diagnosis/treatment/notes) NO existe en el snapshot,
 * se siembra desde la columna top-level correspondiente. Esto hace que el **motivo
 * de la reserva** — que el backend copia en `consultations.chief_complaint` al
 * confirmar la cita — aparezca en el bloque "Motivo de consulta" al abrir la consulta.
 *
 * Solo siembra cuando el snapshot no trae ya un string para esa clave (respeta un
 * vaciado intencional del doctor: `''` es string y no se sobreescribe).
 */
function buildInitialBlocksData(raw: {
  blocks_snapshot?: unknown;
  chief_complaint?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
}): Record<string, unknown> | null {
  const snap = raw.blocks_snapshot;
  const snapshot: Record<string, unknown> =
    snap && typeof snap === 'object' && !Array.isArray(snap)
      ? { ...(snap as Record<string, unknown>) }
      : {};

  const legacySeed: Record<string, string | null | undefined> = {
    chief_complaint: raw.chief_complaint,
    diagnosis: raw.diagnosis,
    treatment: raw.treatment,
    notes: raw.notes,
  };
  for (const [key, value] of Object.entries(legacySeed)) {
    if (typeof snapshot[key] !== 'string' && typeof value === 'string' && value.trim().length > 0) {
      snapshot[key] = value;
    }
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

type ViewMode = 'list' | 'consultation';
type TimeFilter = 'all' | 'upcoming' | 'past' | 'today';
type ConsultationTab = string; // dinámico según blocks_structure del doctor

/**
 * Keys de bloques del sistema que NO pueden ser renombrados por el doctor.
 * El botón de lápiz en DynamicBlocks se oculta para estos keys.
 */
const LOCKED_BLOCK_KEYS = new Set([
  'chief_complaint',
  'history',
  'diagnosis',
  'prescription',
  'indications',
  'paraclinical',
  'rest',
]);

type Prescripcion = {
  exam_name: string;
  notes: string;
};

type QuickItem = {
  id: string;
  item_type: 'exam' | 'medication';
  name: string;
  category: string | null;
  details: string | null;
};

type SavedPrescription = {
  id: string;
  medications: Medication[];
  notes: string | null;
  created_at: string;
};

interface ConsultationsClientProps {
  /**
   * Consultas precargadas desde el Server Component padre (page.tsx).
   * Si se pasan, se usan como estado inicial y se evita el spinner de carga
   * post-hidratación. El cliente sigue pudiendo refrescar/paginar normalmente.
   */
  initialConsultations?: Consultation[];
  /** Total de registros devuelto por el servidor para la paginación inicial. */
  initialTotal?: number;
}

export default function ConsultationsClient({
  initialConsultations,
  initialTotal,
}: ConsultationsClientProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
          Cargando...
        </div>
      }
    >
      <ConsultationsPage initialConsultations={initialConsultations} initialTotal={initialTotal} />
    </Suspense>
  );
}

function ConsultationsPage({ initialConsultations, initialTotal }: ConsultationsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = searchParams.get('open');
  const { rate: bcvRate, toBs } = useBcvRate();
  const { features: planFeatures, loading: planLoading } = useDoctorFeatures();

  const [view, setView] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<Consultation | null>(null);
  // Si el Server Component pasó datos iniciales, úsalos para evitar el spinner.
  // El cliente puede refrescar/paginar y actualizar este estado normalmente.
  const [consultations, setConsultations] = useState<Consultation[]>(initialConsultations ?? []);
  // No mostrar spinner si ya tenemos datos del servidor (primera pintura con filas).
  const [loading, setLoading] = useState(!initialConsultations);
  const [search, setSearch] = useState('');
  const [patientSearchText, setPatientSearchText] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref para el strip de tabs — usado por las flechas de scroll
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  // Ref con el id de la consulta actualmente abierta — permite que el auto-open effect
  // detecte si ya está abierta la misma consulta y evite un re-fetch innecesario.
  const openedConsultationIdRef = useRef<string | null>(null);
  // RONDA 38: tab inicial dinámico — se setea al abrir cada consulta segun su snapshot
  const [consultationTab, setConsultationTab] = useState<ConsultationTab>('block:chief_complaint');
  // RONDA 39: bloques actualmente ACTIVOS del doctor (config viva en /doctor/settings/consultation-blocks).
  // Se usa cuando una consulta no tiene blocks_structure congelada todavía.
  const [doctorActiveBlocks, setDoctorActiveBlocks] = useState<SnapshotBlock[]>([]);

  // RONDA 39: helper. Devuelve los bloques EFECTIVOS para una consulta:
  //   - Si la consulta tiene snapshot congelado (informe ya guardado) → usar snapshot
  //   - Si no → reflejar la config ACTUAL del doctor en tiempo real
  // Asi: cambios en /doctor/settings/consultation-blocks se ven inmediatamente
  // en consultas vacias; las consultas con informe quedan inmutables.
  const getEffectiveBlocks = useCallback(
    (consultation: Consultation | null): SnapshotBlock[] => {
      if (!consultation) return doctorActiveBlocks;
      // blocks_structure holds the metadata array (new column).
      // blocks_snapshot is now always a record of values — never use it as structure.
      const struct = consultation.blocks_structure;
      if (Array.isArray(struct) && struct.length > 0) return struct as SnapshotBlock[];
      return doctorActiveBlocks;
    },
    [doctorActiveBlocks],
  );

  /** Construye ContentBlock[] para react-pdf a partir del snapshot/config viva y de
   *  blocks_data (valores JSONB guardados en la consulta). Misma lógica que [id]/page.tsx.
   *
   *  FIX Fix 4: también considera el estado VIVO del editor (`report`) para los campos
   *  legacy (chief_complaint/diagnosis/treatment/notes). Así, si el doctor llenó
   *  esos campos pero aún no guardó (o el backend no tiene blocks_data hidratado),
   *  el Informe médico queda HABILITADO en GenerateDocumentModal. */
  function buildPdfContent(c: Consultation): ContentBlock[] {
    const blocks = getEffectiveBlocks(c);
    const bd = (c.blocks_data ?? {}) as Record<string, unknown>;
    // Mapa de campos legacy → valor vivo del editor (fuente de verdad si blocks_data no lo tiene)
    const legacyLive: Record<string, string> = {
      chief_complaint: report.chief_complaint,
      diagnosis: report.diagnosis,
      treatment: report.treatment,
      notes: report.notes,
      informe: report.notes,
    };

    // Valores sintéticos para bloques estructurados que NO viven en blocks_data:
    // - prescription: estado `recipe` / `savedPrescriptions` en el editor
    // - paraclinical: estado `prescripciones` (exámenes ordenados) en el editor
    const structuredValues: Record<string, string | string[] | null> = {};

    // prescription → lista compacta "nombre — dosis" desde savedPrescriptions / recipe en curso
    const rxItems: string[] = [];
    if (savedPrescriptions.length > 0) {
      for (const rx of savedPrescriptions) {
        for (const med of rx.medications) {
          const name = (med.name ?? '').trim();
          if (!name) continue;
          const dose = (med.dose ?? '').trim();
          rxItems.push(dose ? `${name} — ${dose}` : name);
        }
      }
    } else if (recipe.medications.length > 0) {
      for (const med of recipe.medications) {
        const name = (med.name ?? '').trim();
        if (!name) continue;
        const dose = (med.dose ?? '').trim();
        rxItems.push(dose ? `${name} — ${dose}` : name);
      }
    }
    if (rxItems.length > 0) structuredValues['prescription'] = rxItems;

    // paraclinical → lista de exámenes desde `prescripciones` (estado del editor)
    const validExams = prescripciones.filter((p) => p.exam_name.trim());
    if (validExams.length > 0) {
      structuredValues['paraclinical'] = validExams.map((p) =>
        p.notes ? `${p.exam_name} — ${p.notes}` : p.exam_name,
      );
    }

    const result = blocks
      .filter((b) => b.printable !== false)
      .map((b) => {
        // 1. Valor desde blocks_data (fuente de verdad para bloques de texto)
        const raw = bd[b.key];
        let value: string | string[] | null = null;
        if (typeof raw === 'string') value = raw.trim() || null;
        else if (Array.isArray(raw)) value = (raw as string[]).filter(Boolean);
        else if (raw != null) value = String(raw);

        // 2. Fallback a campos legacy vivos (chief_complaint, diagnosis, etc.)
        if (
          (value === null || value === '') &&
          Object.prototype.hasOwnProperty.call(legacyLive, b.key)
        ) {
          const live = legacyLive[b.key];
          if (live && live.trim()) value = live.trim();
        }

        // 3. Fallback a valores sintéticos de bloques estructurados (prescription, paraclinical)
        if (
          (value === null || value === '') &&
          Object.prototype.hasOwnProperty.call(structuredValues, b.key)
        ) {
          value = structuredValues[b.key];
        }

        return { key: b.key, label: b.label, value };
      })
      .filter(
        (b) =>
          b.value !== null && b.value !== '' && (!Array.isArray(b.value) || b.value.length > 0),
      );

    return result;
  }

  // Report fields (editable during consultation)
  const [report, setReport] = useState({
    chief_complaint: '',
    notes: '',
    diagnosis: '',
    treatment: '',
    payment_status: 'pending' as Consultation['payment_status'],
  });

  // Sort control state for the list view — actual sorting applied by the backend (server-side)
  type SortKey = 'consultation_date' | 'created_at' | 'status' | 'appointment_status';
  const [sortKey, setSortKey] = useState<SortKey>('consultation_date');

  // Server-side pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(initialTotal ?? 0);

  // Helpers that reset page=1 before changing a filter/sort. Using plain
  // React.startTransition is not needed here — the effect above fires after the
  // state batch settles and triggers a single fetch call.
  function setSortKeyAndReset(sk: SortKey) {
    setPage(1);
    setSortKey(sk);
  }
  function setPageSizeAndReset(ps: number) {
    setPage(1);
    setPageSize(ps);
  }
  function setTimeFilterAndReset(tf: TimeFilter) {
    setPage(1);
    setTimeFilter(tf);
  }

  // Estado del botón "Refrescar" del listado.
  const [refreshing, setRefreshing] = useState(false);

  // PDF include toggles
  const [includeRecipe, setIncludeRecipe] = useState(true);
  const [includePrescripciones, setIncludePrescripciones] = useState(true);

  // Reposo fields
  const [reposoDays, setReposoDays] = useState(0);
  const [reposoFrom, setReposoFrom] = useState('');
  const [reposoTo, setReposoTo] = useState('');
  const [reposoDiagnosis, setReposoDiagnosis] = useState('');
  const [reposoComments, setReposoComments] = useState('');

  // New consultation modal
  const [showNewConsultation, setShowNewConsultation] = useState(false);
  // Estado del select de pago
  const [pagoSaving, setPagoSaving] = useState(false);
  // Estado del panel de detalles de pago (método, referencia, comprobante)
  const [pagoMethod, setPagoMethod] = useState<string>('');
  const [pagoReference, setPagoReference] = useState<string>('');
  const [pagoReceiptPath, setPagoReceiptPath] = useState<string | null>(null);
  const [pagoReceiptUploading, setPagoReceiptUploading] = useState(false);
  const [pagoDetailsSaving, setPagoDetailsSaving] = useState(false);
  // Modal de aprobación de pago (con monto base + extras)
  const [showApprovePaymentModal, setShowApprovePaymentModal] = useState(false);
  // Modal de método de pago — se abre cuando el doctor intenta aprobar sin método seleccionado
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  // Callback pendiente tras seleccionar el método en el modal (aprobación o marcar pagado)
  const [pendingApprovalAfterMethod, setPendingApprovalAfterMethod] = useState(false);
  // Modal de confirmación al salir de una consulta no atendida
  const [showExitConsultationModal, setShowExitConsultationModal] = useState(false);
  // Modal de ingreso adicional (consulta ya pagada)
  const [showExtraIncomeModal, setShowExtraIncomeModal] = useState(false);
  const [extraIncomeConcepts, setExtraIncomeConcepts] = useState<IncomeConcept[]>([]);
  const [extraIncomeConceptsLoading, setExtraIncomeConceptsLoading] = useState(false);
  const [extraIncomeSaving, setExtraIncomeSaving] = useState(false);
  const [extraIncomeError, setExtraIncomeError] = useState('');
  const [extraIncomeForm, setExtraIncomeForm] = useState<IncomeForm>({
    description: '',
    amount: '',
    conceptId: '',
    date: new Date().toISOString().split('T')[0],
    relatedConsultationId: '',
    patientId: '',
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  // Cantidad de registros EHR del paciente de la consulta abierta — habilita el tipo
  // "Historia clínica" en generar/compartir (evita PDF vacío / 422 sin EHR).
  const [patientEhrCount, setPatientEhrCount] = useState(0);
  const [pricingPlans, setPricingPlans] = useState<
    { id: string; name: string; price_usd: number; duration_minutes: number }[]
  >([]);
  // Helper to get local datetime string for datetime-local input
  const getLocalDateTimeString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const [newConsultation, setNewConsultation] = useState({
    patient_id: '',
    consultation_date: getLocalDateTimeString(),
    reason: '',
    plan_id: '',
    payment_reference: '',
    amount: '',
    payment_method: 'efectivo' as
      | 'efectivo'
      | 'transferencia'
      | 'pago_movil'
      | 'zelle'
      | 'binance'
      | 'pos'
      | 'seguro',
    comments: '',
    sendEmail: true,
  });
  const [isCreatingConsultation, setIsCreatingConsultation] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const requiresReceipt = (method: string) =>
    !['efectivo', 'efectivo_bs', 'pos', ''].includes(method);

  // Schedule / time slot state for new consultation
  type AvailabilitySlot = {
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_enabled: boolean;
  };
  type BlockedSlot = { blocked_date: string; start_time?: string; end_time?: string };
  const [scheduleSlots, setScheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedSlot[]>([]);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

  // Recipe modal
  const [showRecipe, setShowRecipe] = useState(false);
  const [recipe, setRecipe] = useState<Recipe>({ medications: [], notes: '' });
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [showPrintRecipe, setShowPrintRecipe] = useState(false);

  // Dictado de receta por voz
  type DictateState = 'idle' | 'recording' | 'transcribing' | 'analyzing' | 'error';
  const [dictateState, setDictateState] = useState<DictateState>('idle');
  const [dictateError, setDictateError] = useState<string | null>(null);
  const dictateRecorderRef = useRef<MediaRecorder | null>(null);
  const dictateChunksRef = useRef<Blob[]>([]);
  const dictateStreamRef = useRef<MediaStream | null>(null);

  // Prescripciones (exámenes que el médico ordena)
  const [prescripciones, setPrescripciones] = useState<Prescripcion[]>([]);
  const [isSavingPrescripciones, setIsSavingPrescripciones] = useState(false);

  // Delete confirmation
  const [confirmDeleteConsulta, setConfirmDeleteConsulta] = useState<Consultation | null>(null);
  const [deletingConsulta, setDeletingConsulta] = useState(false);

  // AI assistant state
  // L1 (2026-04-29): el panel global ahora tiene 3 modos:
  //   - patient_history: resumir historial del paciente (todas las consultas + blocks_data)
  //   - improve_block: mejorar redacción de un bloque seleccionado por el doctor
  //   - summarize_report: resumir el informe completo (chief_complaint+notes+diagnosis+treatment+blocks)
  type AIMode = 'patient_history' | 'improve_block' | 'summarize_report';
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState<AIMode | null>(null);
  // Bloque seleccionado en el dropdown de "Mejorar redacción"
  const [aiTargetBlockKey, setAiTargetBlockKey] = useState<string>('');
  // Mostrar/ocultar el dropdown de seleccion de bloque
  const [showAiBlockPicker, setShowAiBlockPicker] = useState(false);
  // Modo de mejora de redacción — se envía como campo `mode` al endpoint improve_block
  type ImproveMode = 'improve' | 'formal' | 'shorten' | 'lengthen';
  const [improveMode, setImproveMode] = useState<ImproveMode>('improve');

  // Appointment data (for payment receipt, method, price)
  const [appointmentData, setAppointmentData] = useState<AppointmentData | null>(null);

  // L1 (2026-04-29): Modal "Generar informe" — mismo concepto que share pero
  // sin el split WhatsApp/Email; solo genera URL y la abre en otra pestaña.
  const [showGenerateReport, setShowGenerateReport] = useState(false);
  const [reportSelectedKeys, setReportSelectedKeys] = useState<Set<string>>(new Set());
  // FIX 2026-04-29: URL del informe generado, para mostrar enlace clickeable
  // dentro del modal y no depender de window.open() (Safari lo bloquea por
  // estar fuera del user gesture tras el await).
  const [generatedReportUrl, setGeneratedReportUrl] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // L1 (2026-04-29): Catálogo completo de bloques (consultation_block_catalog)
  // para el botón "+" que permite agregar bloques on-the-fly a una consulta.
  type CatalogBlock = {
    key: string;
    label: string;
    content_type: string;
    printable: boolean;
    send_to_patient: boolean;
  };
  const [blockCatalog, setBlockCatalog] = useState<CatalogBlock[]>([]);
  const [showAddBlockMenu, setShowAddBlockMenu] = useState(false);
  const [addingBlock, setAddingBlock] = useState(false);

  // Collapsible sidebar sections
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  // Ficha del paciente en modal (no saca de la consulta en curso).
  const [fichaPatientId, setFichaPatientId] = useState<string | null>(null);

  // Doctor profile for share template
  const [doctorName, setDoctorName] = useState('');
  // Logo y firma GLOBALES del doctor — se aplican a TODOS los PDFs por defecto
  // (templateConfigs[type] puede sobreescribirlos por tipo de documento)
  const [doctorLogo, setDoctorLogo] = useState<string | null>(null);
  const [doctorSignature, setDoctorSignature] = useState<string | null>(null);
  const [doctorLicense, setDoctorLicense] = useState<string | null>(null);
  // Config de plantilla lista para el componente PdfDownloadButton (recipe y prescripciones)
  const [pdfTemplateConfig, setPdfTemplateConfig] = useState<TemplateConfigPdf | null>(null);
  // Config específica para el informe de consulta (usa plantilla 'informe' si existe)
  const [informeTemplateConfig, setInformeTemplateConfig] = useState<TemplateConfigPdf | null>(
    null,
  );
  const [doctorSpecialty, setDoctorSpecialty] = useState<string | null>(null);

  // Doctor's active payment methods from settings
  const [doctorPaymentMethods, setDoctorPaymentMethods] = useState<string[]>([]);

  // L7 (2026-04-29): el cronómetro manual fue eliminado. La duración se
  // calcula automáticamente: started_at se marca cuando la cita pasa a
  // 'completed' (botón "Marcar atendida" del agenda) y ended_at +
  // duration_minutes se setean en el primer save con contenido del informe
  // (PATCH /api/doctor/consultations). Solo mostramos `duration_minutes`
  // como dato read-only cuando ya existe.

  // Template configs for PDFs
  type TemplateConfig = {
    logo_url: string | null;
    signature_url: string | null;
    font_family: string;
    header_text: string;
    footer_text: string;
    show_logo: boolean;
    show_signature: boolean;
    primary_color: string;
  };
  const defaultTemplateConfig: TemplateConfig = {
    logo_url: null,
    signature_url: null,
    font_family: 'Inter',
    header_text: '',
    footer_text: '',
    show_logo: true,
    show_signature: true,
    primary_color: '#0891b2',
  };
  const [templateConfigs, setTemplateConfigs] = useState<Record<string, TemplateConfig>>({
    informe: { ...defaultTemplateConfig },
    recipe: { ...defaultTemplateConfig },
    prescripciones: { ...defaultTemplateConfig },
    reposo: { ...defaultTemplateConfig },
  });

  // Quick items from templates (doctor_quick_items)
  const [quickExams, setQuickExams] = useState<QuickItem[]>([]);
  const [quickMeds, setQuickMeds] = useState<QuickItem[]>([]);

  // Saved prescriptions for current consultation
  const [savedPrescriptions, setSavedPrescriptions] = useState<SavedPrescription[]>([]);

  const today = new Date().toISOString().split('T')[0];

  // Generate available dates (next 30 days, based on doctor's schedule)
  const availableDates = (() => {
    const dates: { date: string; label: string; dayOfWeek: number }[] = [];
    const now = new Date();
    for (let d = 0; d <= 30; d++) {
      const dt = new Date(now);
      dt.setDate(now.getDate() + d);
      const dow = dt.getDay(); // 0=Sunday
      const dateStr = dt.toISOString().split('T')[0];
      // If schedule is loaded, only show days that have availability
      if (scheduleLoaded && scheduleSlots.length > 0) {
        const hasSlots = scheduleSlots.some((s) => s.day_of_week === dow && s.is_enabled);
        if (!hasSlots) continue;
      } else {
        // Default: skip Sundays
        if (dow === 0) continue;
      }
      // Skip blocked dates
      if (blockedDates.some((b) => b.blocked_date === dateStr)) continue;
      const label = dt.toLocaleDateString('es-VE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      dates.push({ date: dateStr, label, dayOfWeek: dow });
    }
    return dates;
  })();

  // Generate time slots for selected date
  const timeSlotsForDate = (() => {
    if (!selectedDate) return [];
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dow = dateObj.getDay();
    const duration = slotDuration || 30;

    let daySlots: { start: string; end: string }[] = [];
    if (scheduleLoaded && scheduleSlots.length > 0) {
      daySlots = scheduleSlots
        .filter((s) => s.day_of_week === dow && s.is_enabled)
        .map((s) => ({ start: s.start_time, end: s.end_time }));
    } else {
      // Default schedule
      daySlots = [
        { start: '08:00', end: '12:00' },
        { start: '14:00', end: '18:00' },
      ];
    }

    const slots: string[] = [];
    daySlots.forEach((range) => {
      const [sh, sm] = range.start.split(':').map(Number);
      const [eh, em] = range.end.split(':').map(Number);
      let current = sh * 60 + sm;
      const endMin = eh * 60 + em;
      while (current + duration <= endMin) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        current += duration;
      }
    });

    return slots;
  })();

  // Check if a time slot is booked
  const isTimeBooked = (date: string, time: string) => {
    const slotTime = new Date(`${date}T${time}:00`).getTime();
    const bufferMs = (slotDuration || 30) * 60 * 1000;
    return bookedTimes.some((bt) => {
      const bookedTime = new Date(bt).getTime();
      return Math.abs(bookedTime - slotTime) < bufferMs;
    });
  };

  // Week navigation for dates
  const weekDates = availableDates.slice(weekOffset * 5, weekOffset * 5 + 5);

  useEffect(() => {
    // MIGRATED (Etapa 1): all data from NestJS backend.
    // Supabase removed. FASE 5 placeholders: quick_items, templates stay empty.
    getDevDoctorId().then(async (doctorId) => {
      if (!doctorId) return;
      try {
        // Doctor profile → GET /api/doctor/profile (+ template config for PDF)
        Promise.all([getDoctorProfile(), loadTemplateConfigs()]).then(
          ([profileData, templates]) => {
            if (profileData) {
              const fullName =
                `${profileData.professionalTitle || ''} ${profileData.fullName || ''}`.trim();
              setDoctorName(fullName);
              if (profileData.paymentMethods && Array.isArray(profileData.paymentMethods)) {
                setDoctorPaymentMethods(profileData.paymentMethods);
              }
              setDoctorSpecialty(profileData.specialty || null);
              setDoctorLogo(profileData.logoUrl ?? null);
              setDoctorSignature(profileData.signatureUrl ?? null);
              setDoctorLicense(profileData.licenseNumber ?? null);

              // Construir pdfTemplateConfig con la plantilla de receta si existe, si no fallback.
              // Logo/firma: plantilla tiene precedencia; fallback a profile.
              const recipeTemplate =
                templates['recipe'] ??
                templates['prescripciones'] ??
                templates[Object.keys(templates)[0] ?? ''] ??
                null;
              setPdfTemplateConfig({
                header_text: recipeTemplate?.header_text || fullName || '',
                footer_text: recipeTemplate?.footer_text || '',
                primary_color: recipeTemplate?.primary_color || '#0891b2',
                font_family: recipeTemplate?.font_family || 'Helvetica',
                logo_url: recipeTemplate?.logo_url ?? profileData.logoUrl ?? null,
                signature_url: recipeTemplate?.signature_url ?? profileData.signatureUrl ?? null,
                show_logo: recipeTemplate?.show_logo !== false,
                show_signature: recipeTemplate?.show_signature !== false,
              });

              // Plantilla específica para el informe: 'informe' tiene precedencia; fallback a
              // la misma que receta (ya tiene logo/firma del perfil correctamente resueltos).
              const informeTmpl =
                templates['informe'] ?? templates[Object.keys(templates)[0] ?? ''] ?? null;
              setInformeTemplateConfig({
                header_text: informeTmpl?.header_text || fullName || '',
                footer_text: informeTmpl?.footer_text || '',
                primary_color: informeTmpl?.primary_color || '#0891b2',
                font_family: informeTmpl?.font_family || 'Helvetica',
                logo_url: informeTmpl?.logo_url ?? profileData.logoUrl ?? null,
                signature_url: informeTmpl?.signature_url ?? profileData.signatureUrl ?? null,
                show_logo: informeTmpl?.show_logo !== false,
                show_signature: informeTmpl?.show_signature !== false,
              });
            }
          },
        );

        // MIGRATED: patients → GET /api/patients (NestJS backend)
        const ehrPatients = await getEhrPatients();
        setPatients(
          ehrPatients.map((p) => ({
            id: p.id,
            full_name: p.full_name,
            phone: p.phone,
            email: null, // not in list shape — detail only
            cedula: p.id_number, // id_number is the cedula alias
            age: p.age,
            sex: p.sex,
            blood_type: null,
            allergies: null,
            chronic_conditions: null,
          })),
        );

        // Wire GET /api/doctor/quick-items — fetch exams and medications in parallel.
        // On error, lists stay empty so the UI degrades gracefully (no chips shown).
        Promise.all([getQuickItems('exam'), getQuickItems('medication')])
          .then(([exams, meds]) => {
            setQuickExams(exams);
            setQuickMeds(meds);
          })
          .catch(() => {
            setQuickExams([]);
            setQuickMeds([]);
          });

        // RONDA 39: cargar bloques ACTIVOS + horario del doctor en PARALELO.
        // Antes eran dos awaits secuenciales — ahora disparan juntos y se
        // resuelven cuando ambos terminan (Promise.allSettled para no bloquear
        // si uno falla).
        const [blocksSettled, scheduleSettled] = await Promise.allSettled([
          fetch('/api/doctor/consultation-blocks', { cache: 'no-store' }),
          fetch('/api/doctor/schedule'),
        ]);

        if (blocksSettled.status === 'fulfilled' && blocksSettled.value.ok) {
          try {
            const j = await blocksSettled.value.json();
            const resolved = (j.resolved || []) as Array<{
              key: string;
              label: string;
              content_type: string;
              sort_order: number;
              printable: boolean;
              send_to_patient: boolean;
            }>;
            setDoctorActiveBlocks(resolved as SnapshotBlock[]);
            // El backend serializa el catálogo en camelCase (defaultLabel, etc.).
            // Leerlo en snake_case dejaba label=undefined → el modal "Agregar bloque"
            // mostraba filas vacías (solo el "+"). Fix: leer camelCase.
            const catalog = (j.catalog || []) as Array<{
              key: string;
              defaultLabel: string;
              defaultContentType: string;
              defaultPrintable?: boolean;
              defaultSendToPatient?: boolean;
            }>;
            setBlockCatalog(
              catalog.map((c) => ({
                key: c.key,
                label: c.defaultLabel,
                content_type: c.defaultContentType,
                printable: c.defaultPrintable ?? true,
                send_to_patient: c.defaultSendToPatient ?? true,
              })),
            );
          } catch (err) {
            console.warn('[consultations] no se pudo parsear config de bloques:', err);
          }
        } else if (blocksSettled.status === 'rejected') {
          console.warn(
            '[consultations] no se pudo cargar config de bloques:',
            blocksSettled.reason,
          );
        }

        if (scheduleSettled.status === 'fulfilled' && scheduleSettled.value.ok) {
          try {
            const schedData = await scheduleSettled.value.json();
            setScheduleSlots(schedData.slots || []);
            setBlockedDates(schedData.blocked || []);
            setSlotDuration(schedData.config?.slot_duration || 30);
            setScheduleLoaded(true);
          } catch {
            /* schedule JSON parse error — non-fatal */
          }
        }

        // Pricing plans → GET /api/doctor/services
        getDoctorServices().then((services) => {
          setPricingPlans(
            services.map((s) => ({
              id: s.id,
              name: s.name,
              price_usd: s.price_usd ?? 0,
              duration_minutes: s.duration_minutes ?? 30,
            })),
          );
        });

        // PLACEHOLDER: booked times (appointments + consultations) — no backend
        // endpoint for booked slots in Etapa 1. bookedTimes stays empty.
        // Fase 5: wire GET /api/doctor/booked-slots?from=&to= here.
        setBookedTimes([]);

        // PLACEHOLDER: doctor_templates — no backend endpoint in Etapa 1.
        // templateConfigs stay at defaultTemplateConfig — Fase 5.

        // MIGRATED: consultations list → GET /api/consultations (server-side paged)
        // When ?open= is present we ALWAYS fetch from the client (need all IDs to find
        // the target). Otherwise, if the Server Component already provided initialConsultations,
        // skip the client-side fetch — the first paint already has the rows.
        let consultationsList = initialConsultations ?? [];

        if (openId || !initialConsultations) {
          // Need a fresh list: either because ?open= requires finding the target by ID
          // (may not be in the initial 15-row slice), or because no server data was passed.
          const initLimit = openId ? 100_000 : 15;
          const pagedResult = await listConsultationsPaged({
            page: 1,
            limit: initLimit,
            sort: 'consultation_date',
          });
          consultationsList = pagedResult.items.map((c) => ({
            id: c.id,
            consultation_code: c.consultation_code,
            consultation_date: c.consultation_date,
            created_at: c.created_at,
            chief_complaint: c.chief_complaint,
            notes: c.notes,
            diagnosis: c.diagnosis,
            treatment: c.treatment,
            status: mapAppointmentStatusToConsulta(c.appointment_status),
            appointment_status: c.appointment_status ?? null,
            payment_status: c.payment_status,
            appointment_id: c.appointment_id,
            patient_id: c.patient_id,
            patient_name: c.patient_name || 'Paciente',
            patient_phone: null,
            started_at: c.started_at,
            ended_at: c.ended_at,
            duration_minutes: c.duration_minutes,
            version: null, // optimistic lock field — Fase 5
          }));

          setConsultations(consultationsList);
          setTotal(pagedResult.total);
          setPage(1);
          if (!openId) setPageSize(15);
        }

        // Auto-open consultation if openId is in query params
        // Fix: buscar por c.id O por c.appointment_id (el dashboard redirige con appointmentId)
        // Guard: si la consulta ya está abierta (mismo id) → no re-abrir para evitar doble-fetch
        if (openId) {
          const consultationToOpen = consultationsList.find(
            (c) => c.id === openId || c.appointment_id === openId,
          );
          if (consultationToOpen && openedConsultationIdRef.current !== consultationToOpen.id) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            openConsultation(consultationToOpen);
          }
        }
      } catch (err) {
        reportError('doctor/consultations', 'loadData', err);
      }
      setLoading(false);
    });
    // initialConsultations es estable (viene del servidor, no cambia entre renders).
    // openConsultation cambia en cada render (función local) pero solo debe ejecutarse
    // cuando openId cambia — la referencia actual se captura correctamente en el closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function deleteConsultationCascade(c: Consultation) {
    setDeletingConsulta(true);
    try {
      const res = await fetch(`/api/doctor/consultations?id=${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      // Remove from local state and go back to list
      setConsultations((prev) => prev.filter((con) => con.id !== c.id));
      setSelected(null);
      setView('list');
      setConfirmDeleteConsulta(null);
      showToast({ type: 'success', message: 'Consulta eliminada correctamente' });
    } catch (err: unknown) {
      reportError('doctor/consultations', 'handleDeleteConsulta', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al eliminar la consulta',
      });
    }
    setDeletingConsulta(false);
  }

  async function updateConsultaStatus(
    consultationId: string,
    newStatus: Consultation['status'],
    appointmentId: string | null,
  ) {
    // Optimistic local update — apply immediately so the UI responds without waiting.
    setSelected((prev) => (prev ? { ...prev, status: newStatus } : prev));
    setConsultations((prev) =>
      prev.map((x) => (x.id === consultationId ? { ...x, status: newStatus } : x)),
    );

    // If there is a linked appointment, sync its status to the backend.
    // Only 'completed' and 'no_show' are valid values for PUT /api/appointments/:id/status.
    if (appointmentId && (newStatus === 'completed' || newStatus === 'no_show')) {
      const result = await updateAppointmentStatus(appointmentId, newStatus);
      if (!result.success) {
        // Non-fatal: optimistic update stays, show a non-blocking warning.
        console.warn('[updateConsultaStatus] appointment sync failed:', result.error);
        showToast({
          type: 'error',
          message: 'El estado se actualizó localmente pero falló la sincronización con la cita',
        });
        return;
      }
    }

    // Bug 7: feedback visual al doctor después de cambiar el estado de la consulta.
    const labels: Partial<Record<Consultation['status'], string>> = {
      completed: 'Consulta marcada como atendida',
      no_show: 'Paciente marcado como no asistió',
    };
    const msg = labels[newStatus];
    if (msg) showToast({ type: 'success', message: msg });
  }

  async function updatePagoStatus(
    consultationId: string,
    newStatus: 'pending' | 'approved',
    _appointmentId: string | null,
  ) {
    if (newStatus === 'approved') {
      // Abrir el modal de aprobación — no aprobar directamente
      setShowApprovePaymentModal(true);
      return;
    }

    // Solo 'pending' llega aquí (volver a pendiente se aplica directo sin modal)
    setPagoSaving(true);
    try {
      // Optimistic update — payments table sync deferred to Fase 5
      setSelected((prev) => (prev ? { ...prev, payment_status: newStatus } : prev));
      setReport((prev) => ({ ...prev, payment_status: newStatus }));
      setConsultations((prev) =>
        prev.map((x) => (x.id === consultationId ? { ...x, payment_status: newStatus } : x)),
      );
      showToast({ type: 'success', message: 'Estado de pago actualizado correctamente' });
    } catch (err: unknown) {
      reportError('doctor/consultations', 'updatePagoStatus', err);
      showToast({ type: 'error', message: 'Error al actualizar el pago' });
    } finally {
      setPagoSaving(false);
    }
  }

  /**
   * Callback invocado por ApprovePaymentModal cuando el pago fue aprobado
   * exitosamente. Actualiza el estado local con el total y los extras devueltos.
   */
  function handlePaymentApproved(total: number, extras: ExistingExtraItem[]) {
    if (!selected) return;
    const updated: Partial<Consultation> = {
      payment_status: 'approved',
      amount: total,
      extra_items: extras,
    };
    setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
    setReport((prev) => ({ ...prev, payment_status: 'approved' }));
    setConsultations((prev) =>
      prev.map((x) =>
        x.id === selected.id ? { ...x, payment_status: 'approved', amount: total } : x,
      ),
    );
  }

  /**
   * Abre el modal de ingreso adicional para una consulta ya pagada.
   * Carga los conceptos de ingreso al abrir (si aún no están cargados).
   */
  async function openExtraIncomeModal(consultationId: string, patientId: string) {
    const today = new Date().toISOString().split('T')[0];
    setExtraIncomeForm({
      description: '',
      amount: '',
      conceptId: '',
      date: today,
      relatedConsultationId: consultationId,
      patientId: patientId,
    });
    setExtraIncomeError('');
    setShowExtraIncomeModal(true);

    if (extraIncomeConcepts.length === 0) {
      setExtraIncomeConceptsLoading(true);
      try {
        const concepts = await getIncomeConcepts();
        setExtraIncomeConcepts(concepts);
      } catch (err: unknown) {
        reportError('doctor/consultations', 'openExtraIncomeModal/getIncomeConcepts', err);
      } finally {
        setExtraIncomeConceptsLoading(false);
      }
    }
  }

  /**
   * Guarda el ingreso adicional asociado a la consulta actual.
   */
  async function handleExtraIncomeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setExtraIncomeError('');
    if (!extraIncomeForm.description.trim() || !extraIncomeForm.amount) {
      setExtraIncomeError('Descripción y monto son obligatorios.');
      return;
    }
    setExtraIncomeSaving(true);
    try {
      const result = await addIncome({
        description: extraIncomeForm.description.trim(),
        amount: parseFloat(extraIncomeForm.amount),
        currency: 'USD',
        conceptId: extraIncomeForm.conceptId || undefined,
        date: extraIncomeForm.date || undefined,
        relatedConsultationId: extraIncomeForm.relatedConsultationId || null,
        patientId: extraIncomeForm.relatedConsultationId ? null : extraIncomeForm.patientId || null,
      });
      if (!result.success) {
        setExtraIncomeError(result.error);
      } else {
        setShowExtraIncomeModal(false);
        showToast({ type: 'success', message: 'Ingreso adicional registrado correctamente' });
      }
    } catch (err: unknown) {
      reportError('doctor/consultations', 'handleExtraIncomeSubmit', err);
      setExtraIncomeError('Ocurrió un error al registrar el ingreso.');
    } finally {
      setExtraIncomeSaving(false);
    }
  }

  /**
   * Convierte texto libre (transcripción/dictado) en filas ESTRUCTURADAS del récipe
   * vía IA (parse_prescription) y las agrega a `recipe.medications`.
   *
   * El bloque Récipe no es texto libre: sus medicamentos viven en el estado `recipe`,
   * no en `blocks_data`. Sin esto, aplicar la sugerencia de Récipe desde la transcripción
   * guardaba el texto en blocks_data pero "no aparecía abajo" (las filas no cambiaban).
   * Reusa el mismo flujo que el botón "Dictar receta". La IA NO inventa: los campos que
   * el médico no dictó quedan vacíos para que él los complete.
   */
  async function parseTextIntoRecipe(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    try {
      const aiRes = await fetch('/api/doctor/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse_prescription', content: clean }),
      });
      const aiData = (await aiRes.json()) as {
        result?: string;
        medications?: Array<Record<string, string>>;
        error?: string;
      };
      if (!aiRes.ok || aiData.error) {
        showToast({ type: 'error', message: aiData.error ?? 'No se pudo interpretar la receta' });
        return;
      }
      // El BFF reenvía los medicamentos en `medications`. Fallback: algunos modelos
      // devuelven el JSON dentro de `result` (compat).
      let detected: Array<Record<string, string>> = Array.isArray(aiData.medications)
        ? aiData.medications
        : [];
      if (detected.length === 0 && typeof aiData.result === 'string' && aiData.result.trim()) {
        try {
          const parsed = JSON.parse(aiData.result) as {
            medications?: Array<Record<string, string>>;
          };
          if (Array.isArray(parsed.medications)) detected = parsed.medications;
        } catch {
          // Ignorar: se maneja abajo con el mensaje de "no se detectaron medicamentos".
        }
      }
      if (detected.length === 0) {
        showToast({
          type: 'error',
          message: 'No se detectaron medicamentos en la transcripción.',
        });
        return;
      }
      const newMeds: Medication[] = detected.map((m) => ({
        name: m.name ?? '',
        dose: m.dose ?? '',
        route: m.route ?? '',
        frequency: m.frequency ?? '',
        duration: m.duration ?? '',
        presentation: m.presentation ?? '',
        indications: '',
      }));
      setRecipe((prev) => {
        const existingNonEmpty = prev.medications.filter((m) => m.name.trim() !== '');
        return { ...prev, medications: [...existingNonEmpty, ...newMeds] };
      });
      // La IA no inventa: avisa si quedan campos por completar.
      const hasMissing = newMeds.some(
        (m) =>
          !m.dose.trim() ||
          !m.route.trim() ||
          !m.frequency.trim() ||
          !m.duration.trim() ||
          !m.presentation.trim(),
      );
      showToast({
        type: 'success',
        message: hasMissing
          ? 'Receta cargada en el récipe. Completa los datos que faltan (la IA no los inventa).'
          : 'Receta cargada en el récipe.',
      });
    } catch (err: unknown) {
      reportError('doctor/consultations', 'parseTextIntoRecipe', err);
      showToast({ type: 'error', message: 'Error al interpretar la receta.' });
    }
  }

  async function openConsultation(c: Consultation) {
    // Marcar id abierto ANTES del fetch para que el guard del auto-open effect lo vea
    openedConsultationIdRef.current = c.id;
    // Reflejar el id en el URL: el sidebar "Consultas" navega a la ruta base (sin ?open=),
    // lo que cambia openId a null → el effect de cierre (if !openId && view='consultation')
    // cierra el editor automáticamente.
    router.replace(`${pathname}?open=${c.id}`, { scroll: false });

    // Fetch fresh data from backend → GET /api/consultations/:id
    try {
      const fresh_raw = await getConsultation(c.id);
      if (fresh_raw) {
        const fresh: Consultation = {
          id: fresh_raw.id,
          consultation_code: fresh_raw.consultation_code,
          consultation_date: fresh_raw.consultation_date,
          created_at: fresh_raw.created_at,
          chief_complaint: fresh_raw.chief_complaint,
          notes: fresh_raw.notes,
          diagnosis: fresh_raw.diagnosis,
          treatment: fresh_raw.treatment,
          status: mapAppointmentStatusToConsulta(fresh_raw.appointment_status),
          payment_status: fresh_raw.payment_status,
          payment_method: fresh_raw.payment_method ?? null,
          payment_reference: fresh_raw.payment_reference ?? null,
          payment_receipt_url: fresh_raw.payment_receipt_url ?? null,
          appointment_id: fresh_raw.appointment_id ?? null,
          patient_id: fresh_raw.patient_id,
          patient_name: fresh_raw.patient_name || c.patient_name,
          patient_phone: c.patient_phone,
          started_at: fresh_raw.started_at,
          ended_at: fresh_raw.ended_at,
          duration_minutes: fresh_raw.duration_minutes,
          amount: (fresh_raw as Record<string, unknown>).amount as number | null | undefined,
          base_amount: (fresh_raw as Record<string, unknown>).base_amount as
            | number
            | null
            | undefined,
          extra_items: (fresh_raw as Record<string, unknown>).extra_items as
            | ExistingExtraItem[]
            | null
            | undefined,
          // blocks_structure: metadata array (new backend column). Used by getEffectiveBlocks.
          blocks_structure: Array.isArray((fresh_raw as Record<string, unknown>).blocks_structure)
            ? ((fresh_raw as Record<string, unknown>)
                .blocks_structure as Consultation['blocks_structure'])
            : null,
          // blocks_snapshot: record of filled values (existing backend column). Read-only here;
          // buildInitialBlocksData seeds the editor from it.
          blocks_snapshot: null,
          // Backend persists the filled report VALUES in `blocks_snapshot` (JSONB record);
          // hydrate the editor so saved dynamic blocks survive a reload.
          blocks_data: buildInitialBlocksData(fresh_raw),
          version: null,
        };
        setSelected(fresh);
        // Reconciliar report con blocks_data: si blocks_data tiene valor para un campo
        // legacy, usarlo como fuente de verdad (es más reciente que la columna top-level).
        const bd = (fresh.blocks_data || {}) as Record<string, unknown>;
        const freshDiagnosis =
          typeof bd.diagnosis === 'string' ? bd.diagnosis : (fresh.diagnosis ?? '');
        setReport({
          chief_complaint:
            typeof bd.chief_complaint === 'string'
              ? bd.chief_complaint
              : (fresh.chief_complaint ?? ''),
          notes: typeof bd.notes === 'string' ? bd.notes : (fresh.notes ?? ''),
          diagnosis: freshDiagnosis,
          treatment: typeof bd.treatment === 'string' ? bd.treatment : (fresh.treatment ?? ''),
          payment_status: fresh.payment_status,
        });
        // Prefill reposo diagnosis con el diagnóstico de la consulta. Siempre se setea
        // (default '') para no arrastrar el diagnóstico de una consulta abierta antes.
        setReposoDiagnosis(freshDiagnosis || '');
        // Inicializar estado del panel de detalles de pago
        setPagoMethod(fresh.payment_method ?? '');
        setPagoReference(fresh.payment_reference ?? '');
        setPagoReceiptPath(fresh.payment_receipt_url ?? null);
        setConsultations((prev) => prev.map((x) => (x.id === fresh.id ? fresh : x)));
        // Appointment data for receipt — no backend endpoint in Etapa 1, stays null.
        setAppointmentData(null);
      } else {
        // Fallback to cached data
        setSelected(c);
        const cachedDiagnosis = c.diagnosis ?? '';
        setReport({
          chief_complaint: c.chief_complaint ?? '',
          notes: c.notes ?? '',
          diagnosis: cachedDiagnosis,
          treatment: c.treatment ?? '',
          payment_status: c.payment_status,
        });
        setReposoDiagnosis(cachedDiagnosis || '');
        setPagoMethod(c.payment_method ?? '');
        setPagoReference(c.payment_reference ?? '');
        setPagoReceiptPath(c.payment_receipt_url ?? null);
        setAppointmentData(null);
      }
    } catch {
      // Fallback to cached data on error
      setSelected(c);
      const cachedDiagnosisFallback = c.diagnosis ?? '';
      setReport({
        chief_complaint: c.chief_complaint ?? '',
        notes: c.notes ?? '',
        diagnosis: cachedDiagnosisFallback,
        treatment: c.treatment ?? '',
        payment_status: c.payment_status,
      });
      setReposoDiagnosis(cachedDiagnosisFallback || '');
      setPagoMethod(c.payment_method ?? '');
      setPagoReference(c.payment_reference ?? '');
      setPagoReceiptPath(c.payment_receipt_url ?? null);
      setAppointmentData(null);
    }

    // Bug 6: Fetch patient detail to populate patient_name, patient_phone and
    // patient_email — the list shape only carries null/placeholder values for these.
    // Non-blocking: if it fails the view still opens with partial info.
    // Also fixes "Paciente" literal shown as patient name in the opened consultation.
    fetch(`/api/doctor/patients/${c.patient_id}`)
      .then(async (r) => {
        if (!r.ok) return;
        const j: unknown = await r.json();
        const p = (j as { data?: Record<string, unknown> })?.data ?? (j as Record<string, unknown>);
        if (!p || typeof p !== 'object') return;
        const pd = p as Record<string, unknown>;
        const fullName = (pd.fullName ?? pd.full_name) as string | undefined;
        const phone = pd.phone as string | null | undefined;
        const email = pd.email as string | null | undefined;
        setSelected((prev) =>
          prev && prev.id === c.id
            ? {
                ...prev,
                patient_name: fullName ?? prev.patient_name,
                patient_phone: phone ?? prev.patient_phone,
                patient_email: email ?? null,
              }
            : prev,
        );
        // Also update the patients list so the email button (patients.find) works too
        setPatients((prev) =>
          prev.map((pt) =>
            pt.id === c.patient_id
              ? {
                  ...pt,
                  full_name: fullName ?? pt.full_name,
                  phone: phone ?? pt.phone,
                  email: email ?? pt.email,
                }
              : pt,
          ),
        );
      })
      .catch(() => {
        /* patient detail is optional — view still opens */
      });

    // Reposo: pre-poblar diagnóstico con el diagnóstico de la consulta si está disponible.
    // Fecha desde: default = HOY. Comentarios: reset.
    // NOTA: NO reseteamos reposoDiagnosis aquí — ya se prefilla más arriba con el diagnóstico
    // de la consulta (freshDiagnosis / cachedDiagnosis). Resetear aquí lo borraba.
    setReposoDays(0);
    // Fecha "desde" por defecto = hoy (formato YYYY-MM-DD)
    setReposoFrom(new Date().toISOString().split('T')[0]);
    setReposoTo('');
    setReposoComments('');

    // MIGRATED: Load prescriptions via backend → GET /api/prescriptions/patient/:id
    try {
      const rxList = await getPatientPrescriptions(c.patient_id);
      if (rxList.length > 0) {
        // Map backend prescriptions (flat schema) to legacy SavedPrescription shape
        const saved: SavedPrescription[] = rxList.map((rx) => ({
          id: rx.id,
          medications: [
            {
              name: rx.medication,
              dose: rx.dosage || '',
              route: '',
              frequency: rx.frequency || '',
              duration: rx.duration || '',
              presentation: rx.presentation || '',
              indications: rx.notes || '',
            },
          ],
          notes: rx.notes,
          created_at: rx.created_at,
        }));
        setSavedPrescriptions(saved);
        const latest = saved[0];
        setRecipe({ medications: latest.medications, notes: latest.notes || '' });
        setPrescripciones([]);
      } else {
        setSavedPrescriptions([]);
        setRecipe({ medications: [], notes: '' });
        setPrescripciones([]);
      }
    } catch {
      setSavedPrescriptions([]);
      setRecipe({ medications: [], notes: '' });
      setPrescripciones([]);
    }

    // Cargar cantidad de registros EHR del paciente → habilita "Historia clínica".
    // No bloqueante: si falla, queda en 0 (el tipo se muestra deshabilitado).
    setPatientEhrCount(0);
    fetch(`/api/ehr/patient/${c.patient_id}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return;
        const j: unknown = await r.json();
        const records = Array.isArray(j)
          ? j
          : Array.isArray((j as { data?: unknown }).data)
            ? (j as { data: unknown[] }).data
            : [];
        setPatientEhrCount(records.length);
      })
      .catch(() => {
        /* EHR opcional — el tipo Historia clínica queda deshabilitado */
      });

    setView('consultation');
    setSaved(false);
    // RONDA 38+39: tab inicial = primer bloque EFECTIVO de la consulta.
    // Reads blocks_structure (not blocks_snapshot which now holds values only).
    const struct = c.blocks_structure;
    const effective = Array.isArray(struct) && struct.length > 0 ? struct : doctorActiveBlocks;
    if (Array.isArray(effective) && effective.length > 0) {
      const sorted = [...effective].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setConsultationTab(`block:${sorted[0].key}`);
    } else {
      setConsultationTab('block:chief_complaint');
    }
  }

  async function createNewConsultation() {
    if (!newConsultation.patient_id || !newConsultation.consultation_date) {
      showToast({ type: 'error', message: 'Completa paciente y fecha' });
      return;
    }
    if (!newConsultation.plan_id) {
      showToast({ type: 'error', message: 'Selecciona un plan o servicio' });
      return;
    }
    setIsCreatingConsultation(true);
    try {
      // Find selected plan details
      const selectedPlan = pricingPlans.find((p) => p.id === newConsultation.plan_id);
      const planAmount = selectedPlan?.price_usd || 0;
      const planName = selectedPlan?.name || '';

      // Upload receipt if provided — via BFF /api/storage/upload (no Supabase)
      let receiptUrl: string | null = null;
      if (receiptFile) {
        try {
          const fd = new FormData();
          fd.append('file', receiptFile);
          fd.append('kind', 'receipt');
          const uploadRes = await fetch('/api/storage/upload', { method: 'POST', body: fd });
          const uploadJson = await uploadRes.json();
          if (uploadRes.ok && uploadJson?.data?.url) {
            receiptUrl = uploadJson.data.url;
          }
        } catch (uploadErr) {
          console.warn('[createNewConsultation] receipt upload failed:', uploadErr);
        }
      }

      // 1. Create consultation via API
      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: newConsultation.patient_id,
          chief_complaint: newConsultation.reason || null,
          notes: newConsultation.comments || null,
          consultation_date: new Date(newConsultation.consultation_date).toISOString(),
          amount: planAmount,
          plan_name: planName,
          payment_method: newConsultation.payment_method,
          payment_reference: newConsultation.payment_reference || null,
          payment_receipt_url: receiptUrl,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error al crear consulta');

      // 2. If there's an amount and payment method, register the payment
      const consultationId = result.consultation?.id;
      if (consultationId && planAmount > 0) {
        await fetch('/api/doctor/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultation_id: consultationId,
            patient_id: newConsultation.patient_id,
            amount: planAmount,
            payment_method: newConsultation.payment_method,
            payment_reference: newConsultation.payment_reference || null,
          }),
        });
      }

      // 3. Send email notification to patient if enabled
      if (newConsultation.sendEmail) {
        const patient = patients.find((p) => p.id === newConsultation.patient_id);
        if (patient?.email) {
          try {
            await fetch('/api/doctor/send-consultation-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                patientEmail: patient.email,
                patientName: patient.full_name,
                doctorName,
                consultationDate: newConsultation.consultation_date,
                reason: newConsultation.reason || 'Consulta médica',
                comments: newConsultation.comments || '',
                consultationCode: result.consultation?.consultation_code || '',
              }),
            });
          } catch (emailErr) {
            reportError('doctor/consultations', 'createConsultation:sendEmail', emailErr);
            // Don't block consultation creation if email fails
          }
        }
      }

      // Reload consultation list from backend using current paged state
      await fetchPagedConsultations();

      setShowNewConsultation(false);
      setReceiptFile(null);
      setNewConsultation({
        patient_id: '',
        consultation_date: getLocalDateTimeString(),
        reason: '',
        plan_id: '',
        payment_reference: '',
        amount: '',
        payment_method: 'efectivo',
        comments: '',
        sendEmail: true,
      });
    } catch (err) {
      reportError('doctor/consultations', 'createConsultation', err);
      showToast({ type: 'error', message: 'Error al crear consulta' });
    } finally {
      setIsCreatingConsultation(false);
    }
  }

  // RONDA 22: refactor con logs, validacion previa y manejo de errores limpio.
  // Antes lanzaba "Error al guardar" aunque el insert era exitoso porque la FK
  // estaba mal apuntada a profiles(id) — ya reparada en BD a patients(id).
  async function saveRecipe() {
    const hasContent =
      (recipe.medications && recipe.medications.length > 0) ||
      (recipe.notes && recipe.notes.replace(/<[^>]*>/g, '').trim().length > 0);
    if (!selected || !hasContent) {
      showToast({
        type: 'error',
        message: 'Agrega al menos un medicamento o escribe notas de la receta',
      });
      return;
    }
    if (!selected.patient_id) {
      log.error('[saveRecipe] selected.patient_id es null/undefined', { selected });
      showToast({ type: 'error', message: 'Error: la consulta no tiene un paciente asociado' });
      return;
    }

    // Validar campos obligatorios de cada medicamento antes de guardar
    const REQUIRED_FIELDS: Array<{ key: keyof Medication; label: string }> = [
      { key: 'name', label: 'nombre' },
      { key: 'dose', label: 'dosis' },
      { key: 'route', label: 'vía de administración' },
      { key: 'frequency', label: 'frecuencia' },
      { key: 'duration', label: 'duración' },
      { key: 'presentation', label: 'presentación' },
    ];
    for (let i = 0; i < recipe.medications.length; i++) {
      const med = recipe.medications[i];
      for (const field of REQUIRED_FIELDS) {
        if (!med[field.key].trim()) {
          const numero = recipe.medications.length > 1 ? ` ${i + 1}` : '';
          showToast({
            type: 'error',
            message: `Completa la ${field.label} del medicamento${numero}`,
          });
          return;
        }
      }
    }

    setIsSavingRecipe(true);
    try {
      // MIGRATED: create prescription via backend → POST /api/prescriptions
      // Backend schema expects flat medication fields; save first med entry.
      // Multi-medication support deferred to Fase 5 (bulk endpoint).
      for (const med of recipe.medications) {
        if (!med.name.trim()) continue;
        const result = await createPrescription({
          patient_id: selected.patient_id,
          consultation_id: selected.id,
          medication: med.name,
          dosage: med.dose || null,
          frequency: med.frequency || null,
          duration: med.duration || null,
          notes: med.indications || recipe.notes || null,
          presentation: med.presentation || null,
        });
        if (!result.success) {
          showToast({ type: 'error', message: `Error al guardar receta: ${result.error}` });
          return;
        }
      }

      // Reload prescriptions from backend
      const rxList = await getPatientPrescriptions(selected.patient_id);
      const saved: SavedPrescription[] = rxList.map((rx) => ({
        id: rx.id,
        medications: [
          {
            name: rx.medication,
            dose: rx.dosage || '',
            route: '',
            frequency: rx.frequency || '',
            duration: rx.duration || '',
            presentation: rx.presentation || '',
            indications: rx.notes || '',
          },
        ],
        notes: rx.notes,
        created_at: rx.created_at,
      }));
      setSavedPrescriptions(saved);
      setShowRecipe(false);
      showToast({ type: 'success', message: 'Receta guardada correctamente' });
    } catch (err: unknown) {
      reportError('doctor/consultations', 'saveRecipe', err);
      showToast({
        type: 'error',
        message: `Error al guardar receta: ${err instanceof Error ? err.message : 'desconocido'}`,
      });
    } finally {
      setIsSavingRecipe(false);
    }
  }

  // Helper to build PDF HTML using template config
  // CASCADA: templateConfig especifico (por tipo de doc) → profile global del doctor → vacio
  // Asi TODOS los PDFs (informe/receta/prescripciones/reposo/dinamicos) llevan logo + firma
  // sin necesidad de configurar 4 templates separados.
  function buildPdfHtml(
    templateType: string,
    title: string,
    bodyContent: string,
    patientName: string,
    code: string,
    dateStr: string,
  ) {
    const cfg = templateConfigs[templateType] || defaultTemplateConfig;
    // Color primario: respeta el configurado por el doctor; default = teal Delta
    const color = cfg.primary_color || '#0891b2';
    // RONDA 18: tipografia dinamica del template (Inter, Georgia, Times, Arial, Calibri, Palatino).
    // Antes (ronda 17) la fije en Inter por error y eso rompia el selector de tipografia.
    // Las fuentes Inter/Georgia/Palatino se traen de Google Fonts; las del sistema (Arial,
    // Times New Roman, Calibri) usan el fallback nativo del SO.
    const font = cfg.font_family || 'Inter';
    const isWebFont = [
      'Inter',
      'Georgia',
      'Palatino',
      'Roboto',
      'Open Sans',
      'Lato',
      'Montserrat',
      'Poppins',
    ].includes(font);
    // RONDA 17: SOURCE OF TRUTH = profile del doctor.
    // Ya no usamos cfg.logo_url ni cfg.signature_url — esos campos quedaron deprecados
    // como override por tipo de doc. El doctor sube logo y firma una sola vez en
    // /doctor/settings → profile.logo_url / profile.signature_url y eso aplica a TODO.
    // Las flags show_logo / show_signature por tipo de doc siguen funcionando.
    const effectiveLogo = cfg.show_logo === false ? null : doctorLogo || null;
    const effectiveSignature = cfg.show_signature === false ? null : doctorSignature || null;

    return `<!DOCTYPE html>
<html>
<head>
  <title>${title} - ${code}</title>
  <style>
    ${isWebFont ? `@import url('https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;600;700&display=swap');` : ''}
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: '${font}', 'Segoe UI', Arial, sans-serif; }
    body { padding: 40px; color: #1e293b; line-height: 1.6; }
    .header { border-bottom: 3px solid ${color}; padding-bottom: 20px; margin-bottom: 30px; display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-logo img { max-height: 60px; max-width: 180px; object-fit: contain; }
    .header h1 { color: ${color}; font-size: 24px; }
    .header p { color: #64748b; font-size: 12px; margin-top: 4px; }
    .header-text { font-size: 11px; color: #64748b; text-align: right; max-width: 250px; }
    .meta { display: flex; gap: 40px; margin-bottom: 30px; flex-wrap: wrap; }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
    .meta-value { font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 2px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: ${color}; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px; }
    .section-content { font-size: 13px; color: #334155; }
    .section-content ul, .section-content ol { padding-left: 20px; }
    .signature { margin-top: 40px; text-align: center; }
    .signature img { max-height: 80px; margin-bottom: 8px; }
    .signature-line { width: 200px; border-top: 1px solid #94a3b8; margin: 0 auto; padding-top: 6px; }
    .signature p { font-size: 11px; color: #64748b; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { font-size: 10px; color: #94a3b8; }
    .code { font-family: monospace; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${effectiveLogo ? '<div class="header-logo"><img src="' + effectiveLogo + '" alt="Logo" crossorigin="anonymous" /></div>' : ''}
      <div>
        <h1>${cfg.header_text ? cfg.header_text.split('\\n')[0] || 'Delta Salud' : 'Delta Salud'}</h1>
        <p>${title}</p>
      </div>
    </div>
    ${cfg.header_text && cfg.header_text.includes('\\n') ? '<div class="header-text">' + cfg.header_text.split('\\n').slice(1).join('<br/>') + '</div>' : ''}
  </div>

  <div class="meta">
    <div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value">${patientName}</div></div>
    <div class="meta-item"><div class="meta-label">Código</div><div class="meta-value code">${code}</div></div>
    <div class="meta-item"><div class="meta-label">Fecha</div><div class="meta-value">${dateStr}</div></div>
    <div class="meta-item"><div class="meta-label">Doctor</div><div class="meta-value">${doctorName}</div></div>
  </div>

  ${bodyContent}

  <!-- Firma del medico/especialista — siempre presente. Si hay imagen de firma se muestra; si no, solo la linea -->
  <div class="signature">
    ${effectiveSignature ? '<img src="' + effectiveSignature + '" alt="Firma" crossorigin="anonymous" />' : '<div style="height:50px"></div>'}
    <div class="signature-line">
      <p style="font-weight:600;color:#1e293b">${doctorName || 'Médico tratante'}</p>
      ${doctorLicense ? '<p style="font-size:10px;color:#64748b;margin-top:2px">Mat. ' + doctorLicense + '</p>' : ''}
    </div>
  </div>

  <div class="footer">
    ${cfg.footer_text ? '<p>' + cfg.footer_text + '</p>' : '<p>Documento generado por Delta Salud</p>'}
    <p>${code} · ${new Date().toLocaleDateString('es-VE')}</p>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
  }

  // L1 (2026-04-29): helper genérico — convierte el contenido de cualquier bloque
  // (chief_complaint/diagnosis/notes/treatment legacy o un block_key dinámico)
  // en un fragmento HTML <div class="section">…</div> listo para inyectar en el PDF.
  // Respetа la plantilla del doctor a través de buildPdfHtml (que aplica fonts/colores/firma).
  //
  // Convención: SI existe un bloque con key="informe" (o key="notes") en el snapshot,
  // "Informe" = solo ese bloque. Si NO, "Informe" = concatenado de TODOS los bloques
  // printable de la consulta (este caso lo maneja generateInformeHtml más abajo).
  function generateBlockHtml(blockKey: string, label: string): string {
    if (!selected) return '';
    // Resolver contenido: primero blocks_data, luego columnas legacy
    const bd = (selected.blocks_data || {}) as Record<string, unknown>;
    const raw = bd[blockKey];
    let content = '';
    if (Array.isArray(raw)) {
      content =
        '<ul>' +
        (raw as unknown[])
          .filter(Boolean)
          .map((v) => `<li>${String(v)}</li>`)
          .join('') +
        '</ul>';
    } else if (typeof raw === 'string' && raw.trim()) {
      content = raw;
    } else if (raw && typeof raw === 'object') {
      // Bloque "rest" (reposo) tiene shape {diagnosis, days, from, to}
      if (blockKey === 'rest' || blockKey === 'reposo') {
        const r = raw as { diagnosis?: string; days?: number; from?: string; to?: string };
        if (r.diagnosis || r.days || r.from) {
          content =
            `Diagnóstico: ${r.diagnosis || '-'}<br>Días: ${r.days ?? 0}` +
            (r.from ? `<br>Desde: ${new Date(r.from).toLocaleDateString('es-VE')}` : '') +
            (r.to ? `<br>Hasta: ${new Date(r.to).toLocaleDateString('es-VE')}` : '');
        }
      } else {
        content = JSON.stringify(raw);
      }
    }
    // Fallback a columnas legacy
    if (!content) {
      if (blockKey === 'chief_complaint' && report.chief_complaint)
        content = report.chief_complaint;
      else if (blockKey === 'diagnosis' && report.diagnosis) content = report.diagnosis;
      else if (blockKey === 'treatment' && report.treatment) content = report.treatment;
      else if ((blockKey === 'notes' || blockKey === 'informe') && report.notes)
        content = report.notes;
      else if (blockKey === 'rest' || blockKey === 'reposo') {
        if (reposoDiagnosis || reposoDays > 0 || reposoFrom) {
          content =
            `Diagnóstico: ${reposoDiagnosis || '-'}<br>Días: ${reposoDays}` +
            (reposoFrom ? `<br>Desde: ${new Date(reposoFrom).toLocaleDateString('es-VE')}` : '') +
            (reposoTo ? `<br>Hasta: ${new Date(reposoTo).toLocaleDateString('es-VE')}` : '');
        }
      } else if (blockKey === 'prescription' && recipe.medications.length > 0) {
        content = recipe.medications
          .map(
            (m, i) =>
              `<div style="margin-bottom:10px;padding:8px;border:1px solid #e2e8f0;border-radius:6px"><strong>${i + 1}. ${m.name}</strong>` +
              (m.dose ? ` | Dosis: ${m.dose}` : '') +
              (m.frequency ? ` | Freq: ${m.frequency}` : '') +
              (m.duration ? ` | Dur: ${m.duration}` : '') +
              (m.indications ? `<br><em>${m.indications}</em>` : '') +
              '</div>',
          )
          .join('');
      } else if (blockKey === 'paraclinical' && prescripciones.length > 0) {
        const valid = prescripciones.filter((p) => p.exam_name.trim());
        if (valid.length > 0)
          content =
            '<ul>' +
            valid.map((p) => `<li>${p.exam_name}${p.notes ? ' - ' + p.notes : ''}</li>`).join('') +
            '</ul>';
      }
    }
    if (!content) return '';
    return `<div class="section"><div class="section-title">${label}</div><div class="section-content">${content}</div></div>`;
  }

  // L1 (2026-04-29): construye el body del "Informe".
  // - Si existe un bloque con key='informe' o 'notes' en el snapshot/config → solo ese bloque.
  // - Si no → concatenación de TODOS los bloques printable de la consulta.
  function generateInformeHtml(): string {
    if (!selected) return '';
    const effective = getEffectiveBlocks(selected);
    const informeBlock = effective.find((b) => b.key === 'informe' || b.key === 'notes');
    if (informeBlock) {
      return generateBlockHtml(informeBlock.key, informeBlock.label);
    }
    // Fallback: si no hay bloque dedicado pero hay valor en report.notes legacy → usarlo
    if (report.notes && (!effective || effective.length === 0)) {
      return `<div class="section"><div class="section-title">Informe</div><div class="section-content">${report.notes}</div></div>`;
    }
    // Concatenar todos los bloques printable
    const printable = effective.filter((b) => b.printable);
    return printable
      .map((b) => generateBlockHtml(b.key, b.label))
      .filter(Boolean)
      .join('');
  }

  function addMedication() {
    setRecipe((p) => ({
      ...p,
      medications: [
        ...p.medications,
        {
          name: '',
          dose: '',
          route: '',
          frequency: '',
          duration: '',
          presentation: '',
          indications: '',
        },
      ],
    }));
  }

  function removeMedication(idx: number) {
    setRecipe((p) => ({
      ...p,
      medications: p.medications.filter((_, i) => i !== idx),
    }));
  }

  // Dictado de receta por voz:
  // 1. Graba el micrófono usando la misma infra que ConsultationRecorder.
  // 2. Envía el audio a /api/doctor/consultations/transcribe (mismo endpoint).
  // 3. Con el texto transcrito, llama a /api/doctor/ai con action='parse_prescription'.
  // 4. Pre-llena las filas del récipe con los medicamentos detectados.
  async function dictateRecipe() {
    setDictateError(null);

    // Solicitar permiso al micrófono
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setDictateError('No se pudo acceder al micrófono. Verifica los permisos.');
      setDictateState('error');
      return;
    }
    dictateStreamRef.current = stream;
    dictateChunksRef.current = [];

    const mimeOptions = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    const mime = mimeOptions.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    dictateRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) dictateChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Detener stream
      if (dictateStreamRef.current) {
        dictateStreamRef.current.getTracks().forEach((t) => t.stop());
        dictateStreamRef.current = null;
      }

      const chunks = dictateChunksRef.current;
      if (chunks.length === 0) {
        setDictateError('No se grabó audio. Intenta nuevamente.');
        setDictateState('error');
        return;
      }

      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      if (blob.size < 1024) {
        setDictateError('Grabación muy corta. Habla más despacio y vuelve a intentarlo.');
        setDictateState('error');
        return;
      }

      // Paso 2: Transcribir
      setDictateState('transcribing');
      let transcript = '';
      try {
        const ext = (mime || '').includes('mp4')
          ? 'm4a'
          : (mime || '').includes('ogg')
            ? 'ogg'
            : 'webm';
        const fd = new FormData();
        fd.append('audio', blob, `receta.${ext}`);
        fd.append('language', 'es-VE');

        const transRes = await fetch('/api/doctor/consultations/transcribe', {
          method: 'POST',
          body: fd,
        });
        const transData = (await transRes.json()) as {
          ok?: boolean;
          transcript?: string;
          error?: string;
        };
        if (!transRes.ok || !transData.ok) {
          throw new Error(transData.error ?? `HTTP ${transRes.status}`);
        }
        transcript = transData.transcript ?? '';
        if (!transcript.trim()) {
          setDictateError('No se detectó voz en la grabación. Intenta nuevamente.');
          setDictateState('error');
          return;
        }
      } catch (err: unknown) {
        setDictateError(err instanceof Error ? err.message : 'Error al transcribir el audio');
        setDictateState('error');
        return;
      }

      // Paso 3: Parsear con IA
      setDictateState('analyzing');
      try {
        const aiRes = await fetch('/api/doctor/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'parse_prescription', content: transcript }),
        });
        type ParsedMed = {
          name?: string;
          dose?: string;
          route?: string;
          frequency?: string;
          duration?: string;
          presentation?: string;
        };
        const aiData = (await aiRes.json()) as {
          result?: string;
          medications?: ParsedMed[];
          error?: string;
        };
        if (!aiRes.ok || aiData.error) {
          throw new Error(aiData.error ?? `HTTP ${aiRes.status}`);
        }

        // El BFF reenvía los medicamentos en `medications`. Fallback compat: JSON en `result`.
        let detected: ParsedMed[] = Array.isArray(aiData.medications) ? aiData.medications : [];
        if (detected.length === 0 && typeof aiData.result === 'string' && aiData.result.trim()) {
          try {
            const parsed = JSON.parse(aiData.result) as { medications?: ParsedMed[] };
            if (Array.isArray(parsed.medications)) detected = parsed.medications;
          } catch {
            throw new Error('La IA no devolvió un formato válido. Intenta dictando más despacio.');
          }
        }
        if (detected.length === 0) {
          showToast({
            type: 'error',
            message: 'No se detectaron medicamentos en el dictado. Intenta ser más específico.',
          });
          setDictateState('idle');
          return;
        }

        // Paso 4: Pre-llenar filas del récipe (respeta medicamentos existentes no vacíos)
        const newMeds: Medication[] = detected.map((m) => ({
          name: m.name ?? '',
          dose: m.dose ?? '',
          route: m.route ?? '',
          frequency: m.frequency ?? '',
          duration: m.duration ?? '',
          presentation: m.presentation ?? '',
          indications: '',
        }));

        setRecipe((prev) => {
          const existingNonEmpty = prev.medications.filter((m) => m.name.trim() !== '');
          return { ...prev, medications: [...existingNonEmpty, ...newMeds] };
        });

        // Avisar si quedan campos obligatorios vacíos
        const REQUIRED: Array<{ key: keyof Medication; label: string }> = [
          { key: 'dose', label: 'dosis' },
          { key: 'route', label: 'vía de administración' },
          { key: 'frequency', label: 'frecuencia' },
          { key: 'duration', label: 'duración' },
          { key: 'presentation', label: 'presentación' },
        ];
        const missing: string[] = [];
        for (const med of newMeds) {
          for (const field of REQUIRED) {
            if (!med[field.key].trim() && !missing.includes(field.label)) {
              missing.push(field.label);
            }
          }
        }
        if (missing.length > 0) {
          showToast({
            type: 'error',
            message: `Completa los campos faltantes: ${missing.join(', ')}`,
          });
        } else {
          showToast({
            type: 'success',
            message: `${detected.length} medicamento${detected.length > 1 ? 's' : ''} agregado${detected.length > 1 ? 's' : ''} al récipe`,
          });
        }

        setDictateState('idle');
      } catch (err: unknown) {
        setDictateError(err instanceof Error ? err.message : 'Error al analizar con IA');
        setDictateState('error');
      }
    };

    // Grabar en chunks de 1s
    recorder.start(1000);
    setDictateState('recording');

    // Detener automáticamente tras 30 segundos para evitar grabaciones infinitas
    setTimeout(() => {
      if (dictateRecorderRef.current?.state === 'recording') {
        dictateRecorderRef.current.stop();
      }
    }, 30_000);
  }

  function stopDictateRecording() {
    if (dictateRecorderRef.current && dictateRecorderRef.current.state === 'recording') {
      dictateRecorderRef.current.stop();
    }
  }

  function cancelDictateRecording() {
    if (dictateRecorderRef.current) {
      try {
        dictateRecorderRef.current.stop();
      } catch {}
    }
    if (dictateStreamRef.current) {
      dictateStreamRef.current.getTracks().forEach((t) => t.stop());
      dictateStreamRef.current = null;
    }
    dictateChunksRef.current = [];
    setDictateState('idle');
    setDictateError(null);
  }

  function saveReport() {
    if (!selected) return;
    startTransition(async () => {
      // MIGRATED: update clinical fields via backend → PUT /api/consultations/:id
      const result = await updateConsultation(selected.id, {
        chief_complaint: report.chief_complaint || null,
        notes: report.notes || null,
        diagnosis: report.diagnosis || null,
        treatment: report.treatment || null,
      });
      if (!result.success) {
        showToast({ type: 'error', message: `Error al guardar: ${result.error}` });
        return;
      }
      setConsultations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...report } : c)));
      setSelected((prev) => (prev ? { ...prev, ...report } : null));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  // L7 (2026-04-29): toda la lógica del cronómetro manual fue eliminada.
  // - started_at: lo escribe el endpoint /api/doctor/appointment-status al
  //   marcar la cita como 'completed'.
  // - ended_at + duration_minutes: los escribe el PATCH de
  //   /api/doctor/consultations en el primer save con contenido.
  // El UI solo lee `selected.duration_minutes` para mostrarlo en formato
  // "45 min" o "1h 5min" via formatDuration().
  function formatDuration(mins: number | null | undefined): string {
    if (mins == null || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
    return `${m} min`;
  }

  // Auto-save: debounce 3 seconds after any report field changes
  const reportRef = useRef(report);
  reportRef.current = report;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    if (!selected) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!selectedRef.current) return;
      const r = reportRef.current;
      if (!r.chief_complaint && !r.notes && !r.diagnosis && !r.treatment) return;
      setAutoSaving(true);
      // MIGRATED: auto-save via backend → PUT /api/consultations/:id
      // Version-based optimistic locking deferred to Fase 5 (no version field in Etapa-1).
      updateConsultation(selectedRef.current.id, {
        chief_complaint: r.chief_complaint || null,
        notes: r.notes || null,
        diagnosis: r.diagnosis || null,
        treatment: r.treatment || null,
      }).then((result) => {
        setAutoSaving(false);
        if (result.success) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          setConsultations((prev) =>
            prev.map((c) => (c.id === selectedRef.current?.id ? { ...c, ...r } : c)),
          );
        }
      });
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    report.chief_complaint,
    report.notes,
    report.diagnosis,
    report.treatment,
    report.payment_status,
    selected?.id,
  ]);

  // Timer para auto-save de BLOQUES DINÁMICOS (block:xxx) — debounce 1.5s
  const blocksAutoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  /** Ejecuta el guardado pendiente de blocks_data de forma inmediata (sin esperar debounce).
   *  Llamar antes de cambiar de tab o antes de cerrar la consulta. */
  const flushBlocksSave = useCallback(() => {
    if (!blocksAutoSaveTimer.current) return;
    clearTimeout(blocksAutoSaveTimer.current);
    blocksAutoSaveTimer.current = null;
    const cur = selectedRef.current;
    if (!cur) return;
    const bd = cur.blocks_data;
    if (!bd || Object.keys(bd).length === 0) return;
    setAutoSaving(true);
    fetch('/api/doctor/consultations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cur.id, blocks_data: bd }),
    })
      .then(() => {
        setAutoSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {
        setAutoSaving(false);
      });
    // Sync legacy columns for chief_complaint/diagnosis/treatment/notes
    const legacyKeys = ['chief_complaint', 'diagnosis', 'treatment', 'notes'] as const;
    const legacyUpdates: Record<string, string | null> = {};
    let hasLegacy = false;
    for (const k of legacyKeys) {
      if (k in bd && typeof bd[k] === 'string') {
        legacyUpdates[k] = (bd[k] as string) || null;
        hasLegacy = true;
      }
    }
    if (hasLegacy) {
      updateConsultation(cur.id, legacyUpdates).catch(() => {});
    }
  }, []);

  /**
   * Guarda AHORA (y ESPERA) los bloques + columnas legacy de la consulta a la BD.
   * A diferencia de flushBlocksSave (fire-and-forget, solo si hay timer pendiente),
   * esto persiste SIEMPRE el estado actual y se puede await.
   *
   * Se usa antes de COMPARTIR: el PDF compartido se arma server-side desde los datos
   * PERSISTIDOS (blocks_snapshot), así que si el doctor compartía con ediciones sin
   * guardar, el paciente recibía "No hay contenido disponible". Con esto el compartir
   * refleja lo que el doctor ve en el editor.
   */
  const saveBlocksNow = useCallback(async (): Promise<void> => {
    if (blocksAutoSaveTimer.current) {
      clearTimeout(blocksAutoSaveTimer.current);
      blocksAutoSaveTimer.current = null;
    }
    const cur = selectedRef.current;
    if (!cur) return;
    const bd = cur.blocks_data;
    if (!bd || Object.keys(bd).length === 0) return;
    setAutoSaving(true);
    try {
      await fetch('/api/doctor/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cur.id, blocks_data: bd }),
      });
      // Sync de columnas legacy (chief_complaint/diagnosis/treatment/notes).
      const legacyKeys = ['chief_complaint', 'diagnosis', 'treatment', 'notes'] as const;
      const legacyUpdates: Record<string, string | null> = {};
      let hasLegacy = false;
      for (const k of legacyKeys) {
        if (k in bd && typeof bd[k] === 'string') {
          legacyUpdates[k] = (bd[k] as string) || null;
          hasLegacy = true;
        }
      }
      if (hasLegacy) await updateConsultation(cur.id, legacyUpdates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* best-effort: si falla, el compartir seguirá con lo que haya en BD */
    } finally {
      setAutoSaving(false);
    }
  }, []);

  /** Cambia de tab flusheando el guardado pendiente antes de hacerlo. */
  const handleTabChange = useCallback(
    (newTab: string) => {
      flushBlocksSave();
      setConsultationTab(newTab);
    },
    [flushBlocksSave],
  );

  // Flush pendiente al desmontar (navegar fuera de la página de consulta)
  useEffect(() => {
    return () => {
      flushBlocksSave();
    };
  }, [flushBlocksSave]);

  // Fix: cuando el usuario navega al sidebar "Consultas" sin ?open=,
  // searchParams cambia y openId queda null → cerrar el editor inline.
  useEffect(() => {
    if (!openId && view === 'consultation') {
      flushBlocksSave();
      openedConsultationIdRef.current = null;
      setView('list');
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // ---------------------------------------------------------------------------
  // Maps UI sort keys to backend sort param values.
  // Backend accepts: consultation_date | created_at | consultation_status | confirmation_status
  // ---------------------------------------------------------------------------
  function mapSortKey(sk: SortKey): string {
    if (sk === 'status') return 'consultation_status';
    if (sk === 'appointment_status') return 'confirmation_status';
    return sk; // 'consultation_date' | 'created_at' pass through unchanged
  }

  // ---------------------------------------------------------------------------
  // Maps timeFilter to date_from / date_to for the backend query.
  // 'all' → no date filter
  // 'today' → date_from = date_to = YYYY-MM-DD
  // 'upcoming' → date_from = tomorrow
  // 'past' → date_to = yesterday
  // ---------------------------------------------------------------------------
  function mapTimeFilter(tf: TimeFilter): { dateFrom?: string; dateTo?: string } {
    const todayStr = new Date().toISOString().split('T')[0];
    if (tf === 'today') return { dateFrom: todayStr, dateTo: todayStr };
    if (tf === 'upcoming') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { dateFrom: tomorrow.toISOString().split('T')[0] };
    }
    if (tf === 'past') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return { dateTo: yesterday.toISOString().split('T')[0] };
    }
    return {};
  }

  // ---------------------------------------------------------------------------
  // Central paged fetch. All list loads go through here so sort/filter/page are
  // always consistent. Maps local state into `listConsultationsPaged` params.
  // ---------------------------------------------------------------------------
  const fetchPagedConsultations = useCallback(
    async (opts: { p?: number; ps?: number; sk?: SortKey; tf?: TimeFilter } = {}) => {
      const p = opts.p ?? page;
      const ps = opts.ps ?? pageSize;
      const sk = opts.sk ?? sortKey;
      const tf = opts.tf ?? timeFilter;

      const effectiveLimit = ps === PAGE_SIZE_ALL ? 100_000 : ps;
      const { dateFrom, dateTo } = mapTimeFilter(tf);

      try {
        const result = await listConsultationsPaged({
          page: p,
          limit: effectiveLimit,
          sort: mapSortKey(sk),
          dateFrom,
          dateTo,
        });

        setConsultations(
          result.items.map((c) => ({
            id: c.id,
            consultation_code: c.consultation_code,
            consultation_date: c.consultation_date,
            created_at: c.created_at,
            chief_complaint: c.chief_complaint,
            notes: c.notes,
            diagnosis: c.diagnosis,
            treatment: c.treatment,
            status: mapAppointmentStatusToConsulta(c.appointment_status),
            appointment_status: c.appointment_status ?? null,
            payment_status: c.payment_status,
            appointment_id: c.appointment_id,
            patient_id: c.patient_id,
            patient_name: c.patient_name || 'Paciente',
            patient_phone: null,
            started_at: c.started_at,
            ended_at: c.ended_at,
            duration_minutes: c.duration_minutes,
            amount: (c as Record<string, unknown>).amount as number | null | undefined,
            version: null,
          })),
        );
        setTotal(result.total);
      } catch {
        /* no-op: se reintenta en la próxima oportunidad */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize, sortKey, timeFilter],
  );

  // Fix (2026-07-11): recarga SOLO la tabla de consultas desde el backend.
  // La lista quedaba STALE al volver a la página (Router Cache de Next servía la
  // versión vieja) → las consultas recién creadas no aparecían sin recargar a mano.
  // Ahora delega en fetchPagedConsultations para mantener consistencia con la
  // paginación / ordenamiento / filtro activos.
  const reloadConsultationsTable = useCallback(async () => {
    await fetchPagedConsultations();
  }, [fetchPagedConsultations]);

  // Refetch al recuperar foco/visibilidad de la pestaña (volver desde otra ventana/pestaña).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void reloadConsultationsTable();
    }
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reloadConsultationsTable]);

  // Refetch al NAVEGAR a la página de Consultas (p.ej. desde Inicio/Agenda por el sidebar).
  // Cubre el caso en que la consulta se creó en OTRA pantalla: al entrar aquí se re-buscan
  // los datos y se repinta la tabla. Sin polling — solo cuando el usuario llega a la lista.
  useEffect(() => {
    if (pathname === '/doctor/consultations') void reloadConsultationsTable();
  }, [pathname, reloadConsultationsTable]);

  // Al llegar con ?open=<id> (p.ej. redirigido desde el inicio tras crear la cita),
  // refrescar la tabla para que la consulta recién creada esté presente y se pueda abrir.
  useEffect(() => {
    if (openId) void reloadConsultationsTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // Al cambiar sort, pageSize o timeFilter → re-fetchear con los nuevos parámetros.
  // La página ya fue reseteada a 1 en el handler (setSortKeyAndReset / setPageSizeAndReset /
  // setTimeFilterAndReset), por lo que el efecto solo necesita disparar el fetch.
  useEffect(() => {
    void fetchPagedConsultations({ p: page, sk: sortKey, ps: pageSize, tf: timeFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, pageSize, timeFilter, page]);

  // Auto-save BLOQUE REPOSO en blocks_data — debounce 1.5s
  // Reposo NO tiene tabla propia, se persiste en consultations.blocks_data['reposo']
  const reposoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!selected) return;
    if (!reposoDiagnosis && reposoDays === 0 && !reposoFrom && !reposoTo) return;
    if (reposoSaveTimer.current) clearTimeout(reposoSaveTimer.current);
    reposoSaveTimer.current = setTimeout(async () => {
      if (!selectedRef.current) return;
      // MIGRATED: reposo blocks_data via BFF PATCH route.
      // blocks_data not in Etapa-1 backend schema — save via existing PATCH route.
      // blocks_data.reposo merge with existing data deferred to Fase 5 (no GET blocks_data endpoint).
      const reposoPayload = {
        diagnosis: reposoDiagnosis,
        days: reposoDays,
        from: reposoFrom,
        to: reposoTo,
        comments: reposoComments,
        updated_at: new Date().toISOString(),
      };
      fetch('/api/doctor/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRef.current.id,
          blocks_data: { reposo: reposoPayload },
        }),
      }).catch((err) => console.warn('[reposo autosave]', err));
      // Merge con blocks_data existente para no sobrescribir otros bloques
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              blocks_data: {
                ...((prev.blocks_data as Record<string, unknown>) || {}),
                reposo: reposoPayload,
              } as any,
            }
          : prev,
      );
    }, 1500);
    return () => {
      if (reposoSaveTimer.current) clearTimeout(reposoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reposoDiagnosis, reposoDays, reposoFrom, reposoTo, reposoComments, selected?.id]);

  // L1 (2026-04-29): callAI unificado — un solo punto de entrada para los 3 modos.
  // - patient_history: solo necesita patientId; el endpoint extrae historial completo.
  // - improve_block: requiere blockKey; serializa el contenido actual del bloque y manda.
  // - summarize_report: serializa TODOS los bloques + chief_complaint/notes/diagnosis/treatment.
  async function callAI(mode: AIMode, opts?: { blockKey?: string }) {
    if (!selected) return;
    setAiLoading(true);
    setAiAction(mode);
    setAiResult('');
    try {
      // Etapa 1: Supabase auth removed. /api/doctor/ai uses x-dev-user headers injected
      // server-side. Endpoint may return 501 until AI module is wired in Fase 5.
      const headers = { 'Content-Type': 'application/json' };
      let payload: Record<string, unknown> = {};

      if (mode === 'patient_history') {
        payload = { action: 'patient_history', patientId: selected.patient_id };
      } else if (mode === 'improve_block') {
        const blockKey = opts?.blockKey || aiTargetBlockKey;
        if (!blockKey) {
          setAiResult('Error: selecciona un bloque para mejorar.');
          return;
        }
        const effective = getEffectiveBlocks(selected);
        const block = effective.find((b) => b.key === blockKey);
        const label = block?.label || blockKey;
        const bd = (selected.blocks_data || {}) as Record<string, unknown>;
        let content = '';
        const raw = bd[blockKey];
        if (Array.isArray(raw))
          content = (raw as unknown[])
            .filter(Boolean)
            .map((s) => `- ${s}`)
            .join('\n');
        else if (typeof raw === 'string') content = raw;
        else if (raw != null) content = String(raw);
        if (!content.trim()) {
          if (blockKey === 'chief_complaint') content = report.chief_complaint;
          else if (blockKey === 'diagnosis') content = report.diagnosis;
          else if (blockKey === 'treatment') content = report.treatment;
          else if (blockKey === 'notes' || blockKey === 'informe') content = report.notes;
        }
        if (!content.trim()) {
          setAiResult(`El bloque "${label}" está vacío. Escribe algo antes de mejorar con IA.`);
          return;
        }
        payload = {
          action: 'improve_block',
          content,
          block_key: blockKey,
          block_label: label,
          mode: improveMode,
        };
      } else if (mode === 'summarize_report') {
        const effective = getEffectiveBlocks(selected);
        payload = {
          action: 'summarize_report',
          legacy: {
            chief_complaint: report.chief_complaint,
            notes: report.notes,
            diagnosis: report.diagnosis,
            treatment: report.treatment,
          },
          blocks_data: selected.blocks_data || {},
          blocks_meta: effective.map((b) => ({
            key: b.key,
            label: b.label,
            printable: b.printable,
          })),
        };
      }

      const res = await fetch('/api/doctor/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) setAiResult(`Error: ${data.error}`);
      else if (!res.ok) setAiResult('Función de IA no disponible aún.');
      else setAiResult(data.result);
    } catch {
      setAiResult('Error al conectar con la IA');
    } finally {
      setAiLoading(false);
    }
  }

  // L1 (2026-04-29): aplica el resultado de IA al bloque correspondiente.
  // - improve_block → escribe en blocks_data[aiTargetBlockKey] (y sync legacy si aplica).
  // - summarize_report → escribe en notes (informe).
  function applyAIResult() {
    if (!selected || !aiResult) return;
    if (aiAction === 'improve_block' && aiTargetBlockKey) {
      const blockKey = aiTargetBlockKey;
      const effective = getEffectiveBlocks(selected);
      const block = effective.find((b) => b.key === blockKey);
      let value: unknown = aiResult;
      if (block?.content_type === 'list') {
        value = aiResult
          .split('\n')
          .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
          .filter(Boolean);
      }
      const data = (selected.blocks_data || {}) as Record<string, unknown>;
      const next = { ...data, [blockKey]: value };
      setSelected({ ...selected, blocks_data: next });
      if (typeof value === 'string') {
        if (blockKey === 'chief_complaint')
          setReport((p) => ({ ...p, chief_complaint: value as string }));
        else if (blockKey === 'diagnosis') setReport((p) => ({ ...p, diagnosis: value as string }));
        else if (blockKey === 'treatment') setReport((p) => ({ ...p, treatment: value as string }));
        else if (blockKey === 'notes' || blockKey === 'informe')
          setReport((p) => ({ ...p, notes: value as string }));
      }
      // Persist: update clinical fields + blocks_data via PATCH BFF (non-blocking)
      const legacyUpdates: Record<string, string | null> = {};
      if (
        typeof value === 'string' &&
        ['chief_complaint', 'diagnosis', 'treatment', 'notes'].includes(blockKey)
      ) {
        legacyUpdates[blockKey] = value;
      }
      updateConsultation(selected.id, legacyUpdates).catch(() => {});
      fetch('/api/doctor/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, blocks_data: next }),
      }).catch(() => {});
    } else if (aiAction === 'summarize_report') {
      setReport((p) => ({ ...p, notes: aiResult }));
      // Persist via backend action (non-blocking)
      updateConsultation(selected.id, { notes: aiResult }).catch(() => {});
    }
    setAiResult('');
    setAiAction(null);
  }

  // Filtering (sorting is a UI-only control wired to backend via query param — Fase server-side)
  const now = new Date();
  const filtered = consultations.filter((c) => {
    const matchSearch =
      !search ||
      c.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      c.consultation_code.toLowerCase().includes(search.toLowerCase());
    const cDate = new Date(c.consultation_date);
    const matchTime =
      timeFilter === 'all'
        ? true
        : timeFilter === 'upcoming'
          ? cDate > now
          : timeFilter === 'past'
            ? cDate < now
            : c.consultation_date.startsWith(today);
    return matchSearch && matchTime;
  });

  const upcoming = consultations.filter((c) => new Date(c.consultation_date) > now).length;
  const todayCount = consultations.filter((c) => c.consultation_date.startsWith(today)).length;

  if (view === 'consultation' && selected) {
    const ps = PAYMENT_STATUS[report.payment_status];

    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.safari-tab { border-radius: 8px 8px 0 0; padding: 8px 16px; } .safari-tab.active { background: white; border: 1px solid #e2e8f0; border-bottom: none; box-shadow: 0 -2px 8px rgba(0,0,0,0.03); }@keyframes toastSlide { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>

        {/* Bug 7: pagoToast eliminado — ahora se usa showToast() global */}

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Main Content (Left ~65%) */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Header: estructura compacta de 2 filas
                Fila 1: Volver + Badges de estado (consulta + pago)
                Fila 2: Acciones de status (atendida/no asistió/aprobar pago) | Acciones de archivo (PDF/Imprimir/Eliminar/Compartir) */}
            <div className="space-y-3">
              {/* Fila 1: navegación + badges en vivo */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  onClick={() => {
                    // Si la consulta no está atendida, mostrar modal de confirmación
                    if (
                      selected &&
                      selected.status !== 'completed' &&
                      selected.status !== 'no_show'
                    ) {
                      setShowExitConsultationModal(true);
                      return;
                    }
                    flushBlocksSave();
                    openedConsultationIdRef.current = null;
                    setView('list');
                    setSelected(null);
                    if (openId) router.push(pathname, { scroll: false });
                  }}
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver a consultas
                </button>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${CONSULTA_STATUS[selected.status]?.color || 'bg-slate-100 text-slate-700'}`}
                    title="Estado de la consulta"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${CONSULTA_STATUS[selected.status]?.dot || 'bg-slate-400'}`}
                    ></span>
                    Consulta: {CONSULTA_STATUS[selected.status]?.label || selected.status}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${PAYMENT_STATUS[selected.payment_status]?.color || 'bg-slate-100 text-slate-700'}`}
                    title="Estado del pago"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${PAYMENT_STATUS[selected.payment_status]?.dot || 'bg-slate-400'}`}
                    ></span>
                    Pago:{' '}
                    {PAYMENT_STATUS[selected.payment_status]?.label || selected.payment_status}
                  </span>
                </div>
              </div>

              {/* Fila 2: acciones agrupadas */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Grupo izquierdo: cambios de status (solo aparecen si aplican) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selected.status !== 'completed' && (
                    <button
                      onClick={() =>
                        updateConsultaStatus(selected.id, 'completed', selected.appointment_id)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors"
                      title="Marcar consulta como atendida"
                    >
                      <Check className="w-3.5 h-3.5" /> Atendida
                    </button>
                  )}
                  {selected.status !== 'no_show' && (
                    <button
                      onClick={() => {
                        if (confirm('¿Confirmas que el paciente NO asistió?'))
                          updateConsultaStatus(selected.id, 'no_show', selected.appointment_id);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      title="Marcar como no asistido"
                    >
                      <X className="w-3.5 h-3.5" /> No asistió
                    </button>
                  )}
                  {/* El cambio de estado de pago se centralizo en el select del panel derecho
                      "Configuracion de la consulta" (ronda 14). Aqui solo se ven los badges. */}
                </div>

                {/* Grupo derecho: acciones de archivo */}
                {(() => {
                  // Constantes compartidas por GenerateDocumentModal y ShareDocumentsModal
                  const sharedInformeContent = buildPdfContent(selected);

                  const sharedPatientConsultationCount = consultations.filter(
                    (x) => x.patient_id === selected.patient_id,
                  ).length;

                  // El reposo solo cuenta como "configurado" si tiene días > 0.
                  // `reposoFrom` (hoy) y `reposoDiagnosis` (prefill del diagnóstico de
                  // la consulta) vienen precargados, así que NO deben habilitar por sí
                  // solos la generación del reposo — si no hay días, no hay reposo.
                  const sharedReposoContentStr =
                    reposoDays > 0
                      ? [
                          `Reposo de ${reposoDays} día${reposoDays !== 1 ? 's' : ''}`,
                          reposoFrom
                            ? `desde ${new Date(reposoFrom).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : null,
                          reposoTo
                            ? `hasta ${new Date(reposoTo).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : null,
                          reposoDiagnosis ? `Diagnóstico: ${reposoDiagnosis}` : null,
                        ]
                          .filter(Boolean)
                          .join('. ')
                      : null;

                  const tmplCfg = informeTemplateConfig ?? pdfTemplateConfig;

                  return (
                    <div className="flex items-center gap-1.5">
                      {tmplCfg && doctorName && (
                        <GenerateDocumentModal
                          consultationCode={selected.consultation_code}
                          consultationDate={selected.consultation_date}
                          patientId={selected.patient_id}
                          patientName={selected.patient_name}
                          patientCedula={
                            patients.find((p) => p.id === selected.patient_id)?.cedula ?? null
                          }
                          templateConfig={tmplCfg}
                          doctor={{
                            fullName: doctorName,
                            specialty: doctorSpecialty,
                            licenseNumber: doctorLicense,
                          }}
                          informeContent={sharedInformeContent}
                          savedPrescriptions={savedPrescriptions}
                          patientConsultationCount={sharedPatientConsultationCount}
                          patientEhrCount={patientEhrCount}
                          restContent={sharedReposoContentStr}
                          restData={
                            reposoDays > 0
                              ? {
                                  diagnosis: reposoDiagnosis,
                                  days: reposoDays,
                                  from: reposoFrom,
                                  to: reposoTo,
                                  comments: reposoComments,
                                }
                              : null
                          }
                        />
                      )}
                      <ShareDocumentsModal
                        consultationId={selected.id}
                        patientPhone={selected.patient_phone}
                        patientName={selected.patient_name}
                        doctorName={doctorName}
                        informeContent={sharedInformeContent}
                        savedPrescriptions={savedPrescriptions}
                        patientConsultationCount={sharedPatientConsultationCount}
                        patientEhrCount={patientEhrCount}
                        restContent={sharedReposoContentStr}
                        onBeforeShare={saveBlocksNow}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── GRABAR CONSULTA (minutas tipo Google Meet) — requiere ai_transcription ──
                2026-05-02: el doctor activa el micrófono, la IA transcribe
                el audio y sugiere distribución entre bloques. Aplicar las
                sugerencias actualiza directamente selected.blocks_data — el
                doctor sigue presionando "Guardar" después como siempre.
                Mientras planLoading es true, se muestra el placeholder bloqueado para
                evitar el flash del componente premium antes de resolver el gate. */}
            {planLoading || !planFeatures.ai_transcription ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700">Grabar la consulta</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {planLoading ? 'Verificando plan...' : 'Disponible en un plan superior'}
                  </p>
                </div>
                {!planLoading && (
                  <a
                    href="/doctor/upgrade"
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
                  >
                    Ver planes
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
                    Grabar la consulta
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-600)' }}>
                    Activa el micrófono y la IA transcribe + sugiere cómo distribuirlo en tus
                    bloques.
                  </p>
                </div>
                <ConsultationRecorder
                  availableBlocks={getEffectiveBlocks(selected).map((b) => ({
                    key: b.key,
                    label: b.label,
                  }))}
                  onApplyToBlock={(blockKey, content, mode) => {
                    // El Récipe es estructurado (recipe.medications), no texto libre.
                    // Parsear la sugerencia a filas para que SÍ aparezca abajo.
                    if (blockKey === 'prescription') {
                      void parseTextIntoRecipe(content);
                      return;
                    }
                    setSelected((prev) => {
                      if (!prev) return prev;
                      const currentData = (prev.blocks_data || {}) as Record<string, unknown>;
                      const existing = currentData[blockKey];
                      let next: unknown = content;
                      if (mode === 'append' && typeof existing === 'string' && existing.trim()) {
                        next = existing.trimEnd() + '\n\n' + content;
                      }
                      return {
                        ...prev,
                        blocks_data: { ...currentData, [blockKey]: next },
                      };
                    });
                    // Sync con campos legacy (chief_complaint/diagnosis/treatment/notes)
                    // que viven en columnas top-level además de blocks_data — para que
                    // el resto de la UI (PDF, share, etc.) los lea correctamente.
                    if (typeof content === 'string') {
                      setReport((r) => {
                        const map: Record<string, keyof typeof r> = {
                          chief_complaint: 'chief_complaint',
                          diagnosis: 'diagnosis',
                          treatment: 'treatment',
                          notes: 'notes',
                          informe: 'notes',
                        };
                        const field = map[blockKey];
                        if (!field) return r;
                        const current = (r as any)[field] as string | undefined;
                        const newVal =
                          mode === 'append' && current && current.trim()
                            ? current.trimEnd() + '\n\n' + content
                            : content;
                        return { ...r, [field]: newVal } as any;
                      });
                    }
                  }}
                />
              </div>
            )}

            {/* Medical Report Form with Safari-style Tabs */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Safari-style Tab Navigation — DINÁMICAS según blocks_structure del doctor.
                  Si no hay snapshot (consultas viejas), usamos las 5 tabs clásicas.
                  L1 (2026-04-29): se agrega botón "+" al final para sumar bloques on-the-fly.
                  Flechas ‹ › para desplazar el strip cuando no caben todos los tabs. */}
              <div className="flex items-stretch bg-slate-50 border-b border-slate-200">
                {/* Flecha izquierda */}
                <button
                  type="button"
                  aria-label="Desplazar tabs a la izquierda"
                  onClick={() =>
                    tabsScrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' })
                  }
                  className="shrink-0 flex items-center justify-center px-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Strip de tabs con scroll horizontal suave */}
                <div
                  ref={tabsScrollRef}
                  className="flex items-end gap-1 px-2 pt-4 overflow-x-auto flex-1 scroll-smooth"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {(() => {
                    // RONDA 38+39: tabs 100% dinamicas.
                    //   - Si la consulta tiene blocks_structure congelada → usarla (inmutable)
                    //   - Si no → reflejar la config ACTUAL del doctor en tiempo real
                    // Fallback ultimo: motivo + diagnostico para que el doctor nunca vea
                    // un informe vacio.
                    let dynamicTabs: { key: string; label: string }[] = [];
                    const effective = getEffectiveBlocks(selected as Consultation);
                    if (effective && effective.length > 0) {
                      const sorted = [...effective].sort((a, b) => a.sort_order - b.sort_order);
                      // Label desde el bloque; nunca mostrar el key técnico en la UI.
                      // Overrides de UI: prescription → Récipe, indications → Evaluación actual.
                      const LOCKED_BLOCK_LABELS: Record<string, string> = {
                        prescription: 'Récipe',
                        indications: 'Evaluación actual',
                      };
                      dynamicTabs = sorted.map((b) => ({
                        key: `block:${b.key}`,
                        label: LOCKED_BLOCK_LABELS[b.key] ?? b.label ?? b.key,
                      }));
                    } else {
                      dynamicTabs = [
                        { key: 'block:chief_complaint', label: 'Motivo de consulta' },
                        { key: 'block:diagnosis', label: 'Diagnóstico' },
                      ];
                    }
                    return dynamicTabs.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => handleTabChange(t.key)}
                        className={`safari-tab text-sm font-semibold transition-all whitespace-nowrap ${
                          consultationTab === t.key
                            ? 'active border-t border-l border-r border-slate-200 text-slate-900'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ));
                  })()}
                  {/* FIX 2026-04-29: el contenedor padre tiene overflow-x-auto que
                      clipea cualquier dropdown absolute. Solución: convertir a
                      MODAL global (fixed inset-0) para escapar el clip. */}
                  <button
                    type="button"
                    onClick={() => setShowAddBlockMenu(true)}
                    title="Agregar bloque"
                    className="safari-tab text-sm font-bold whitespace-nowrap bg-slate-100 text-teal-600 hover:bg-slate-200 transition-all"
                  >
                    +
                  </button>
                </div>

                {/* Flecha derecha */}
                <button
                  type="button"
                  aria-label="Desplazar tabs a la derecha"
                  onClick={() => tabsScrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
                  className="shrink-0 flex items-center justify-center px-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {showAddBlockMenu &&
                selected &&
                (() => {
                  const effective = getEffectiveBlocks(selected);
                  const activeKeys = new Set(effective.map((b) => b.key));
                  return (
                    <div
                      className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4"
                      onClick={() => !addingBlock && setShowAddBlockMenu(false)}
                    >
                      <div
                        className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-base font-bold text-slate-800">
                            Agregar bloque a esta consulta
                          </p>
                          <button
                            onClick={() => !addingBlock && setShowAddBlockMenu(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">
                          Selecciona un bloque del catálogo. Los que ya están activos se ven en
                          gris.
                        </p>
                        {blockCatalog.length === 0 ? (
                          <p className="text-xs text-slate-400 italic px-2 py-2">Catálogo vacío.</p>
                        ) : (
                          blockCatalog.map((c) => {
                            const alreadyActive = activeKeys.has(c.key);
                            return (
                              <button
                                key={c.key}
                                disabled={addingBlock || alreadyActive}
                                onClick={async () => {
                                  if (alreadyActive) return;
                                  if (!selected) return;
                                  setAddingBlock(true);
                                  try {
                                    // FIX: agregar un bloque a UNA consulta solo debe afectar
                                    // el blocks_structure de ESA consulta, nunca la config global
                                    // del doctor (PUT /api/doctor/consultation-blocks). La config
                                    // global se gestiona únicamente desde
                                    // /doctor/settings/consultation-blocks.
                                    //
                                    // Caso A — la consulta ya tiene blocks_structure congelada:
                                    //   → agregar el bloque a la estructura existente.
                                    // Caso B — la consulta aún usa la config viva (sin estructura):
                                    //   → materializar la estructura desde getEffectiveBlocks +
                                    //     el nuevo bloque, congelando así esta consulta con
                                    //     exactamente los bloques actuales del doctor más el extra.
                                    const currentStruct = selected.blocks_structure;
                                    const baseBlocks: SnapshotBlock[] =
                                      Array.isArray(currentStruct) && currentStruct.length > 0
                                        ? (currentStruct as SnapshotBlock[])
                                        : getEffectiveBlocks(selected);
                                    const maxSort = baseBlocks.reduce(
                                      (m, b) => Math.max(m, b.sort_order ?? 0),
                                      0,
                                    );
                                    const newSnap: SnapshotBlock[] = [
                                      ...baseBlocks,
                                      {
                                        key: c.key,
                                        label: c.label,
                                        content_type:
                                          c.content_type as SnapshotBlock['content_type'],
                                        sort_order: maxSort + 1,
                                        printable: c.printable,
                                        send_to_patient: c.send_to_patient,
                                      },
                                    ];
                                    const res = await fetch('/api/doctor/consultations', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        id: selected.id,
                                        blocks_structure: newSnap,
                                      }),
                                    });
                                    if (!res.ok) {
                                      const e = await res.json().catch(() => ({}));
                                      showToast({
                                        type: 'error',
                                        message: e.error || 'No se pudo agregar el bloque',
                                      });
                                      return;
                                    }
                                    // Actualizar estado local para que el tab aparezca de inmediato.
                                    // newSnap es compatible con Consultation.blocks_structure.
                                    const updated: Consultation = {
                                      ...selected,
                                      blocks_structure: newSnap,
                                    };
                                    setSelected(updated);
                                    setConsultations((prev) =>
                                      prev.map((x) => (x.id === selected.id ? updated : x)),
                                    );
                                    setShowAddBlockMenu(false);
                                    handleTabChange(`block:${c.key}`);
                                  } catch (err) {
                                    reportError('doctor/consultations', 'addBlock', err);
                                    showToast({
                                      type: 'error',
                                      message: 'Error agregando el bloque',
                                    });
                                  } finally {
                                    setAddingBlock(false);
                                  }
                                }}
                                className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 ${
                                  alreadyActive
                                    ? 'opacity-60 cursor-not-allowed bg-slate-50'
                                    : 'hover:bg-slate-50 disabled:opacity-50'
                                }`}
                              >
                                <Plus
                                  className={`w-3.5 h-3.5 shrink-0 ${alreadyActive ? 'text-slate-300' : 'text-teal-500'}`}
                                />
                                <span
                                  className={`flex-1 ${alreadyActive ? 'text-slate-400' : 'text-slate-700'}`}
                                >
                                  {c.label}
                                </span>
                                {alreadyActive && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                    Ya activo
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* RONDA 38: renderer del bloque dinámico.
                  - Si el block_key tiene un FLUJO ESPECIAL (prescription, requested_exams, rest,
                    internal_notes) → no renderizamos DynamicBlocks, dejamos que la sección
                    hardcoded de abajo lo muestre con su catálogo/datos especiales.
                  - Para cualquier otro block_key → render genérico con DynamicBlocks.
                  - Si el snapshot está vacío y el doctor está en chief_complaint/diagnosis,
                    construimos un bloque FAKE para que igual pueda escribir (fallback). */}
              {consultationTab.startsWith('block:') &&
                (() => {
                  const blockKey = consultationTab.replace('block:', '');
                  // Bloques con UI especial — NO usar DynamicBlocks aquí
                  // 'paraclinical' pasa a ser el bloque estructurado de exámenes (antes 'requested_exams').
                  const SPECIAL_BLOCKS = new Set([
                    'prescription',
                    'paraclinical',
                    'rest',
                    'internal_notes',
                  ]);
                  if (SPECIAL_BLOCKS.has(blockKey)) return null;

                  // RONDA 39: usar bloques EFECTIVOS (snapshot si existe, config viva si no)
                  const effective = getEffectiveBlocks(selected as Consultation);
                  let oneBlock = effective.filter((b) => b.key === blockKey);
                  // "Referencia" (requested_exams) ahora es texto libre (antes lista/UI de exámenes).
                  if (blockKey === 'requested_exams') {
                    oneBlock = oneBlock.map((b) => ({ ...b, content_type: 'rich_text' as const }));
                  }

                  // Fallback: snapshot vacío + el doctor está en motivo/diagnóstico → bloque fake
                  if (
                    oneBlock.length === 0 &&
                    (blockKey === 'chief_complaint' || blockKey === 'diagnosis')
                  ) {
                    oneBlock = [
                      {
                        key: blockKey,
                        label:
                          blockKey === 'chief_complaint' ? 'Motivo de consulta' : 'Diagnóstico',
                        content_type: 'rich_text',
                        sort_order: blockKey === 'chief_complaint' ? 1 : 2,
                        printable: true,
                        send_to_patient: true,
                      },
                    ];
                  }
                  if (oneBlock.length === 0) return null;

                  const data = (selected as Consultation).blocks_data || {};
                  return (
                    <div className="p-6">
                      <DynamicBlocks
                        blocks={oneBlock}
                        values={data}
                        onChange={(key, value) => {
                          // Inmutable: no mutar selected directamente.
                          // Merge con el estado ACTUAL en el ref para no perder keys de otros bloques.
                          const currentData =
                            (selectedRef.current?.blocks_data as Record<string, unknown>) || {};
                          const next = { ...currentData, [key]: value };
                          setSelected((prev) => (prev ? { ...prev, blocks_data: next } : prev));
                          // Sync estado legacy si aplica (para que report.* y blocks_data.* sean consistentes)
                          if (
                            key === 'chief_complaint' ||
                            key === 'diagnosis' ||
                            key === 'treatment' ||
                            key === 'notes'
                          ) {
                            const legacyVal = typeof value === 'string' ? value : '';
                            setReport((p) => ({ ...p, [key]: legacyVal }));
                          }
                          // Autosave debounced — lee blocks_data frescos del ref al disparar.
                          if (blocksAutoSaveTimer.current)
                            clearTimeout(blocksAutoSaveTimer.current);
                          setAutoSaving(false);
                          blocksAutoSaveTimer.current = setTimeout(() => {
                            if (!selectedRef.current) return;
                            // Leer blocks_data ACTUAL (no el next capturado en el closure)
                            const latestBd =
                              (selectedRef.current.blocks_data as Record<string, unknown>) || {};
                            setAutoSaving(true);
                            fetch('/api/doctor/consultations', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                id: selectedRef.current.id,
                                blocks_data: latestBd,
                              }),
                            })
                              .then(() => {
                                setAutoSaving(false);
                                setSaved(true);
                                setTimeout(() => setSaved(false), 2000);
                              })
                              .catch(() => setAutoSaving(false));
                            // Sync legacy columns
                            const legacyKeys = [
                              'chief_complaint',
                              'diagnosis',
                              'treatment',
                              'notes',
                            ] as const;
                            const legacyUpdates: Record<string, string | null> = {};
                            let hasLegacy = false;
                            for (const k of legacyKeys) {
                              if (k in latestBd && typeof latestBd[k] === 'string') {
                                legacyUpdates[k] = (latestBd[k] as string) || null;
                                hasLegacy = true;
                              }
                            }
                            if (hasLegacy) {
                              updateConsultation(selectedRef.current.id, legacyUpdates).catch(
                                () => {},
                              );
                            }
                          }, 1500);
                        }}
                        lockedKeys={LOCKED_BLOCK_KEYS}
                        onSave={async () => {
                          // Guardado manual inmediato — usa selectedRef para datos frescos
                          if (!selectedRef.current) return;
                          await fetch('/api/doctor/consultations', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: selectedRef.current.id,
                              blocks_data:
                                (selectedRef.current.blocks_data as Record<string, unknown>) || {},
                            }),
                          });
                          showToast({ type: 'success', message: 'Bloque guardado' });
                        }}
                      />
                    </div>
                  );
                })()}

              {/* RONDA 38: Tab Content — Las únicas tabs que aún usan UI hardcoded son
                  las que tienen FLUJO ESPECIAL (catálogo de medicamentos, exámenes, días reposo,
                  notas internas). Todas las demás se renderizan dinámicamente arriba con DynamicBlocks.
                  La condición de visibilidad ahora aparta el contenedor solo si la tab activa
                  es una de las especiales. */}
              <div
                className={`p-6 space-y-4 ${
                  [
                    'block:prescription',
                    'block:paraclinical',
                    'block:rest',
                    'block:internal_notes',
                  ].includes(consultationTab)
                    ? ''
                    : 'hidden'
                }`}
              >
                {/* Récipe Tab — block:prescription */}
                {consultationTab === 'block:prescription' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Pill className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Récipe</p>
                      </div>
                      <button
                        onClick={() => setShowRecipe(true)}
                        className="flex items-center gap-2 px-3 py-1.5 g-bg rounded-lg text-xs font-bold text-white hover:opacity-90"
                      >
                        <Pill className="w-3.5 h-3.5" />{' '}
                        {recipe.medications.length > 0 ? 'Editar receta' : 'Generar receta'}
                      </button>
                    </div>

                    {/* Show saved medications summary */}
                    {recipe.medications.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Medicamentos en receta ({recipe.medications.length})
                        </p>
                        {recipe.medications.map((med, idx) => (
                          <div
                            key={idx}
                            className="bg-teal-50 border border-teal-200 rounded-lg p-3"
                          >
                            <p className="text-sm font-bold text-teal-900">{med.name}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              {med.dose && (
                                <span className="text-xs text-teal-700">Dosis: {med.dose}</span>
                              )}
                              {med.route && (
                                <span className="text-xs text-teal-700">Vía: {med.route}</span>
                              )}
                              {med.frequency && (
                                <span className="text-xs text-teal-700">
                                  Frecuencia: {med.frequency}
                                </span>
                              )}
                              {med.duration && (
                                <span className="text-xs text-teal-700">
                                  Duración: {med.duration}
                                </span>
                              )}
                              {med.presentation && (
                                <span className="text-xs text-teal-700">
                                  Presentación: {med.presentation}
                                </span>
                              )}
                            </div>
                            {med.indications && (
                              <p className="text-xs text-teal-600 mt-1">{med.indications}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick meds: catálogo precargado del doctor — clic para agregar al instante */}
                    {quickMeds.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                          Medicamentos frecuentes (clic para agregar)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickMeds.map((q) => (
                            <button
                              key={q.id}
                              onClick={() =>
                                setRecipe((p) => ({
                                  ...p,
                                  medications: [
                                    ...p.medications,
                                    {
                                      name: q.name,
                                      dose: q.details || '',
                                      route: '',
                                      frequency: '',
                                      duration: '',
                                      presentation: '',
                                      indications: '',
                                    },
                                  ],
                                }))
                              }
                              className="text-xs px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium"
                            >
                              + {q.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generación on-click del récipe PDF — sin pre-render constante.
                        Solo medicamentos en el récipe (el diagnóstico NO va en el récipe). */}
                    <div className="flex gap-2 pt-2">
                      {pdfTemplateConfig && recipe.medications.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { pdf } = await import('@react-pdf/renderer');
                              const { MedicalDocumentPdf } =
                                await import('@/components/pdf/MedicalDocumentPdf');
                              const { buildRecetasContent, buildRecipeHoja2Content } =
                                await import('./consultation-documents');

                              // Convertir recipe.medications al shape de SavedPrescription
                              const syntheticPrescriptions = [
                                {
                                  id: 'local',
                                  medications: recipe.medications,
                                  notes: recipe.notes || null,
                                  created_at: '',
                                },
                              ];

                              // Hoja 1: solo nombre/dosis (el diagnóstico NO va en el récipe)
                              const hoja1Blocks: ContentBlock[] = [
                                ...buildRecetasContent(syntheticPrescriptions),
                              ];

                              // Hoja 2: detalles completos por medicamento
                              const hoja2Blocks = buildRecipeHoja2Content(syntheticPrescriptions);

                              const docPages = [
                                ...(hoja1Blocks.length > 0
                                  ? [{ docType: 'recipe', content: hoja1Blocks }]
                                  : []),
                                ...(hoja2Blocks.length > 0
                                  ? [{ docType: 'indications', content: hoja2Blocks }]
                                  : []),
                              ];

                              const patientCedula =
                                patients.find((p) => p.id === selected.patient_id)?.cedula ?? null;

                              const el = (
                                <MedicalDocumentPdf
                                  docType="recipe"
                                  templateConfig={pdfTemplateConfig}
                                  doctor={{
                                    fullName: doctorName || '',
                                    specialty: doctorSpecialty,
                                    licenseNumber: doctorLicense,
                                  }}
                                  patient={{
                                    fullName: selected.patient_name || '—',
                                    cedula: patientCedula,
                                  }}
                                  docDate={selected.consultation_date}
                                  consultationCode={selected.consultation_code}
                                  content={docPages[0]?.content ?? []}
                                  documents={docPages.length > 1 ? docPages : undefined}
                                />
                              );
                              const blob = await pdf(el).toBlob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `Recipe-${(selected.consultation_code || 'consulta').replace(/[^\w-]/g, '')}.pdf`;
                              // Anchor en el DOM → el navegador respeta el nombre (si no,
                              // descargaba un UUID sin extensión tras el await).
                              a.style.display = 'none';
                              document.body.appendChild(a);
                              a.click();
                              setTimeout(() => {
                                URL.revokeObjectURL(url);
                                a.remove();
                              }, 1000);
                            } catch (err) {
                              showToast({ type: 'error', message: 'Error al generar el PDF' });
                              console.error('[RecipePdf]', err);
                            }
                          }}
                          className="flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                        >
                          <Printer className="w-4 h-4" /> Descargar récipe PDF
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Exámenes Tab — block:paraclinical (exámenes médicos estructurados) */}
                {consultationTab === 'block:paraclinical' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Prescripciones médicas</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Exámenes e indicaciones que el médico ordena al paciente (laboratorio,
                      imágenes, etc.)
                    </p>

                    {/* Quick exams from templates */}
                    {quickExams.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">
                          Exámenes frecuentes (clic para agregar):
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickExams.map((q) => (
                            <button
                              key={q.id}
                              onClick={() =>
                                setPrescripciones((prev) => [
                                  ...prev,
                                  { exam_name: q.name, notes: q.details || '' },
                                ])
                              }
                              className="text-xs px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium"
                            >
                              + {q.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {prescripciones.map((p, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                placeholder="Nombre del examen (ej: Hematología completa, Rx de tórax...)"
                                value={p.exam_name}
                                onChange={(e) =>
                                  setPrescripciones((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, exam_name: e.target.value } : item,
                                    ),
                                  )
                                }
                                className={fi}
                              />
                              <input
                                type="text"
                                placeholder="Indicaciones (ej: En ayunas, contraste oral...)"
                                value={p.notes}
                                onChange={(e) =>
                                  setPrescripciones((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, notes: e.target.value } : item,
                                    ),
                                  )
                                }
                                className={fi}
                              />
                            </div>
                            <button
                              onClick={() =>
                                setPrescripciones((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-red-500 hover:text-red-700 mt-1"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() =>
                        setPrescripciones((prev) => [...prev, { exam_name: '', notes: '' }])
                      }
                      className="w-full border-2 border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50"
                    >
                      + Agregar examen
                    </button>

                    {prescripciones.length > 0 && (
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={async () => {
                            if (
                              !selected ||
                              prescripciones.filter((p) => p.exam_name.trim()).length === 0
                            ) {
                              showToast({
                                type: 'error',
                                message: 'Agrega al menos un examen con nombre',
                              });
                              return;
                            }
                            // RONDA 22: validar patient_id + capturar error de Supabase por insert
                            if (!selected.patient_id) {
                              showToast({
                                type: 'error',
                                message: 'Error: la consulta no tiene un paciente asociado',
                              });
                              return;
                            }
                            log.debug('[savePrescripciones] insertando', {
                              patient_id: selected.patient_id,
                              consultation_id: selected.id,
                            });
                            setIsSavingPrescripciones(true);
                            try {
                              // MIGRATED: save exams via backend → POST /api/prescriptions
                              const exams = prescripciones.filter((p) => p.exam_name.trim());
                              const failed: string[] = [];
                              let lastError = '';
                              for (const exam of exams) {
                                const result = await createPrescription({
                                  patient_id: selected.patient_id,
                                  consultation_id: selected.id,
                                  medication: exam.exam_name,
                                  notes: exam.notes
                                    ? `Examen: ${exam.exam_name} - ${exam.notes}`
                                    : `Examen: ${exam.exam_name}`,
                                });
                                if (!result.success) {
                                  reportError(
                                    'doctor/consultations',
                                    'savePrescripciones:exam',
                                    new Error(String(result.error)),
                                  );
                                  failed.push(exam.exam_name);
                                  lastError = result.error;
                                }
                              }
                              // Reload prescriptions from backend
                              const rxList = await getPatientPrescriptions(selected.patient_id);
                              const saved: SavedPrescription[] = rxList.map((rx) => ({
                                id: rx.id,
                                medications: [
                                  {
                                    name: rx.medication,
                                    dose: rx.dosage || '',
                                    route: '',
                                    frequency: rx.frequency || '',
                                    duration: rx.duration || '',
                                    presentation: rx.presentation || '',
                                    indications: rx.notes || '',
                                  },
                                ],
                                notes: rx.notes,
                                created_at: rx.created_at,
                              }));
                              setSavedPrescriptions(saved);
                              if (failed.length > 0) {
                                showToast({
                                  type: 'error',
                                  message: `No se pudo guardar: ${failed.join(', ')}${lastError ? ` — ${lastError}` : ''}`,
                                });
                              } else {
                                showToast({
                                  type: 'success',
                                  message: `Prescripciones guardadas (${exams.length})`,
                                });
                              }
                            } catch (err: unknown) {
                              reportError('doctor/consultations', 'savePrescripciones', err);
                              showToast({
                                type: 'error',
                                message: `Error al guardar prescripciones: ${err instanceof Error ? err.message : 'desconocido'}`,
                              });
                            } finally {
                              setIsSavingPrescripciones(false);
                            }
                          }}
                          disabled={isSavingPrescripciones}
                          className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {isSavingPrescripciones ? (
                            'Guardando...'
                          ) : (
                            <>
                              <Save className="w-4 h-4" /> Guardar
                            </>
                          )}
                        </button>
                        {/* Botón "PDF" viejo (print HTML) ELIMINADO: descargaba un archivo
                            distinto al branded. Para el PDF del paraclínico usar "Generar
                            Documento" (MedicalDocumentPdf branded, mismo formato que compartir). */}
                      </div>
                    )}
                  </div>
                )}

                {/* Reposo Tab — block:rest */}
                {consultationTab === 'block:rest' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Constancia de reposo</p>
                      </div>
                      {(reposoDiagnosis || reposoDays > 0 || reposoFrom) && (
                        <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                          <Check className="w-3 h-3" /> Guardado
                        </span>
                      )}
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                      Los datos de reposo se guardan automáticamente en la consulta. Quedan
                      disponibles aunque cierres y vuelvas.
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400" /> Diagnóstico
                      </label>
                      <input
                        type="text"
                        placeholder="Diagnóstico para el reposo"
                        value={reposoDiagnosis}
                        onChange={(e) => setReposoDiagnosis(e.target.value)}
                        className={fi}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> Días de reposo
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        min="0"
                        value={reposoDays}
                        onChange={(e) => {
                          const days = parseInt(e.target.value) || 0;
                          setReposoDays(days);
                          if (reposoFrom) {
                            const fromDate = new Date(reposoFrom);
                            const toDate = new Date(fromDate);
                            toDate.setDate(toDate.getDate() + days);
                            setReposoTo(toDate.toISOString().split('T')[0]);
                          }
                        }}
                        className={fi}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Desde
                        </label>
                        <input
                          type="date"
                          value={reposoFrom}
                          onChange={(e) => {
                            setReposoFrom(e.target.value);
                            if (reposoDays > 0) {
                              const fromDate = new Date(e.target.value);
                              const toDate = new Date(fromDate);
                              toDate.setDate(toDate.getDate() + reposoDays);
                              setReposoTo(toDate.toISOString().split('T')[0]);
                            }
                          }}
                          className={fi}
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Hasta
                        </label>
                        <input
                          type="date"
                          value={reposoTo}
                          disabled
                          className={fi + ' opacity-60'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400" /> Comentarios{' '}
                        <span className="text-slate-400 font-normal text-xs">(opcional)</span>
                      </label>
                      <textarea
                        placeholder="Observaciones adicionales del médico..."
                        value={reposoComments}
                        onChange={(e) => setReposoComments(e.target.value)}
                        rows={3}
                        className={fi + ' resize-none'}
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!reposoFrom || !reposoDiagnosis || reposoDays === 0) {
                          showToast({
                            type: 'error',
                            message: 'Completa diagnóstico, días y fecha de inicio',
                          });
                          return;
                        }
                        try {
                          const { pdf } = await import('@react-pdf/renderer');
                          const { MedicalDocumentPdf } =
                            await import('@/components/pdf/MedicalDocumentPdf');
                          const tmplCfg = informeTemplateConfig ?? pdfTemplateConfig;
                          if (!tmplCfg) {
                            showToast({ type: 'error', message: 'Plantilla no disponible aún' });
                            return;
                          }
                          const reposoBlocks = [
                            { key: 'reposo-diag', label: 'Diagnóstico', value: reposoDiagnosis },
                            {
                              key: 'reposo-period',
                              label: 'Período de reposo',
                              value:
                                `${reposoDays} día${reposoDays !== 1 ? 's' : ''}` +
                                ` — desde ${new Date(reposoFrom).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}` +
                                (reposoTo
                                  ? ` hasta ${new Date(reposoTo).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                                  : ''),
                            },
                            ...(reposoComments
                              ? [
                                  {
                                    key: 'reposo-comments',
                                    label: 'Comentarios',
                                    value: reposoComments,
                                  },
                                ]
                              : []),
                          ];
                          const element = (
                            <MedicalDocumentPdf
                              docType="rest"
                              templateConfig={tmplCfg}
                              doctor={{
                                fullName: doctorName || '',
                                specialty: doctorSpecialty,
                                licenseNumber: doctorLicense,
                              }}
                              patient={{
                                fullName: selected.patient_name || '—',
                                cedula:
                                  patients.find((p) => p.id === selected.patient_id)?.cedula ??
                                  null,
                              }}
                              docDate={selected.consultation_date}
                              consultationCode={selected.consultation_code}
                              content={reposoBlocks}
                            />
                          );
                          const blob = await pdf(element).toBlob();
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement('a');
                          anchor.href = url;
                          anchor.download = `Reposo-${(selected.consultation_code || 'consulta').replace(/[^\w-]/g, '')}.pdf`;
                          // Anchor en el DOM → el navegador respeta el nombre.
                          anchor.style.display = 'none';
                          document.body.appendChild(anchor);
                          anchor.click();
                          setTimeout(() => {
                            URL.revokeObjectURL(url);
                            anchor.remove();
                          }, 1000);
                        } catch (err) {
                          showToast({
                            type: 'error',
                            message: err instanceof Error ? err.message : 'Error al generar el PDF',
                          });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90"
                    >
                      <Printer className="w-4 h-4" /> Descargar PDF Reposo
                    </button>
                  </div>
                )}

                {/* Notas internas Tab — block:internal_notes */}
                {consultationTab === 'block:internal_notes' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <p className="text-sm font-bold text-slate-800">Notas internas</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      Notas privadas del médico sobre esta consulta. No se incluyen en documentos
                      del paciente.
                    </p>
                    <RichTextEditor
                      value={
                        ((((selected as Consultation).blocks_data || {}) as Record<string, unknown>)
                          .internal_notes as string | undefined) || ''
                      }
                      onChange={(html) => {
                        // RONDA 38: persistir en blocks_data.internal_notes (no en columna legacy diagnosis)
                        // Inmutable: merge con estado actual del ref para no perder otros bloques.
                        const currentData =
                          (selectedRef.current?.blocks_data as Record<string, unknown>) || {};
                        const next = { ...currentData, internal_notes: html };
                        setSelected((prev) => (prev ? { ...prev, blocks_data: next } : prev));
                        if (blocksAutoSaveTimer.current) clearTimeout(blocksAutoSaveTimer.current);
                        blocksAutoSaveTimer.current = setTimeout(() => {
                          if (!selectedRef.current) return;
                          const latestBd =
                            (selectedRef.current.blocks_data as Record<string, unknown>) || {};
                          fetch('/api/doctor/consultations', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: selectedRef.current.id,
                              blocks_data: latestBd,
                            }),
                          }).catch(() => {});
                        }, 1500);
                      }}
                      placeholder="Notas internas, observaciones, seguimiento pendiente..."
                    />
                  </div>
                )}
              </div>
            </div>

            {/* L1 (2026-04-29): Asistente IA UNIFICADO — único panel de IA en la consulta.
                3 modos: resumir historial, mejorar redacción (con dropdown de bloque),
                resumir informe completo. Antes existían dos sistemas duplicados (panel
                global con summarize/improve/patient_history + botón "Mejorar con IA"
                por bloque). Ahora todo vive aquí.
                Plan gating: requiere feature ai_assistant.
                Mientras planLoading es true, se muestra el placeholder bloqueado para
                evitar el flash del componente premium antes de resolver el gate. */}
            {planLoading || !planFeatures.ai_assistant ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700">Asistente IA</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {planLoading ? 'Verificando plan...' : 'Disponible en un plan superior'}
                  </p>
                </div>
                {!planLoading && (
                  <a
                    href="/doctor/upgrade"
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
                  >
                    Ver planes
                  </a>
                )}
              </div>
            ) : (
              <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Asistente IA</p>
                    <p className="text-[10px] text-slate-500">Powered by Gemini</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setShowAiBlockPicker(false);
                      callAI('patient_history');
                    }}
                    disabled={aiLoading}
                    className="flex items-center gap-2 px-3 py-2.5 bg-white border border-violet-200 rounded-xl text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {aiLoading && aiAction === 'patient_history' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <History className="w-3.5 h-3.5" />
                    )}
                    Resumir historial del paciente
                  </button>

                  <button
                    onClick={() => {
                      // L1 (2026-04-29): toggle dropdown de selección de bloque.
                      setShowAiBlockPicker((v) => !v);
                    }}
                    disabled={aiLoading}
                    className="flex items-center gap-2 px-3 py-2.5 bg-white border border-violet-200 rounded-xl text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {aiLoading && aiAction === 'improve_block' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    Mejorar redacción
                  </button>
                </div>

                {/* L1 (2026-04-29): dropdown de selección de bloque para "Mejorar redacción" */}
                {showAiBlockPicker &&
                  selected &&
                  (() => {
                    const effective = getEffectiveBlocks(selected);
                    return (
                      <div className="bg-white border border-violet-200 rounded-xl p-3 space-y-2">
                        <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wide">
                          Selecciona un bloque para mejorar
                        </p>
                        {/* Chips de modo — controlan el tipo de mejora enviado al backend */}
                        {(() => {
                          const IMPROVE_CHIPS: { value: ImproveMode; label: string }[] = [
                            { value: 'improve', label: 'Mejorar' },
                            { value: 'formal', label: 'Formal' },
                            { value: 'shorten', label: 'Acortar' },
                            { value: 'lengthen', label: 'Ampliar' },
                          ];
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {IMPROVE_CHIPS.map((chip) => (
                                <button
                                  key={chip.value}
                                  type="button"
                                  onClick={() => setImproveMode(chip.value)}
                                  className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border transition-all ${
                                    improveMode === chip.value
                                      ? 'bg-teal-500 text-white border-teal-500'
                                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {chip.label}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {effective.filter(
                            (b) =>
                              b.key !== 'prescription' && b.key !== 'rest' && b.key !== 'reposo',
                          ).length === 0 && (
                            <p className="text-xs text-slate-400 italic col-span-full">
                              No hay bloques activos en esta consulta.
                            </p>
                          )}
                          {effective
                            .filter(
                              (b) =>
                                b.key !== 'prescription' && b.key !== 'rest' && b.key !== 'reposo',
                            )
                            .map((b) => (
                              <button
                                key={b.key}
                                onClick={() => {
                                  setAiTargetBlockKey(b.key);
                                  setShowAiBlockPicker(false);
                                  callAI('improve_block', { blockKey: b.key });
                                }}
                                className="text-xs px-2 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg font-medium text-left truncate"
                              >
                                {b.label}
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })()}

                {/* AI Result — panel colapsable con Aplicar / Descartar */}
                {(aiResult || aiLoading) && (
                  <div className="bg-white border border-violet-100 rounded-xl p-4 space-y-3">
                    {aiLoading ? (
                      <div className="flex items-center gap-2 text-sm text-violet-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analizando con IA...</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                            {aiAction === 'patient_history'
                              ? 'Historial del paciente'
                              : aiAction === 'summarize_report'
                                ? 'Resumen del informe'
                                : (() => {
                                    const blockLabel =
                                      aiTargetBlockKey && selected
                                        ? (getEffectiveBlocks(selected).find(
                                            (b) => b.key === aiTargetBlockKey,
                                          )?.label ?? aiTargetBlockKey)
                                        : null;
                                    return `Texto mejorado${blockLabel ? ` (${blockLabel})` : ''}`;
                                  })()}
                          </p>
                          <div className="flex gap-1">
                            {/* Aplicar — solo aplica si el modo soporta escritura.
                              patient_history es solo lectura informativa. */}
                            {(aiAction === 'improve_block' || aiAction === 'summarize_report') && (
                              <button
                                onClick={applyAIResult}
                                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Aplicar
                              </button>
                            )}
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(aiResult);
                              }}
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> Copiar
                            </button>
                            <button
                              onClick={() => {
                                setAiResult('');
                                setAiAction(null);
                              }}
                              title="Descartar"
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
                            >
                              <X className="w-3 h-3" /> Descartar
                            </button>
                          </div>
                        </div>
                        {/* RONDA 46: render markdown del output de Gemini (bold, listas, headers) */}
                        <MarkdownText
                          text={aiResult}
                          className="text-sm text-slate-700 leading-relaxed"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* L7 (2026-04-29): Display read-only de la duración automática.
                started_at se setea al marcar la cita 'completed' en el agenda.
                ended_at + duration_minutes se calculan en el primer save con
                contenido del informe. No hay botones de Play/Stop. */}
            {(selected.started_at || selected.duration_minutes != null) && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Timer className="w-5 h-5 text-teal-500 shrink-0" />
                  <div className="flex-1">
                    {selected.duration_minutes != null ? (
                      <>
                        <p className="text-xs text-slate-500">Duración de la consulta</p>
                        <p className="text-sm font-bold text-slate-800">
                          {formatDuration(selected.duration_minutes)}
                        </p>
                      </>
                    ) : selected.started_at ? (
                      <>
                        <p className="text-xs text-slate-500">Consulta iniciada</p>
                        <p className="text-sm font-bold text-slate-800">
                          {new Date(selected.started_at).toLocaleTimeString('es-VE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          <span className="text-xs font-normal text-slate-400 ml-2">
                            (la duración se calcula al guardar el informe)
                          </span>
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Save button + auto-save status */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {autoSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
                      <span className="text-xs text-teal-600 font-medium">Guardando...</span>
                    </>
                  ) : saved ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">Guardado</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-xs text-slate-500">Auto-guardado activo</span>
                    </>
                  )}
                </div>
                <button
                  onClick={saveReport}
                  disabled={isPending || autoSaving}
                  className="flex items-center gap-2 g-bg px-4 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar consulta
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Los cambios se guardan automaticamente. El informe queda registrado en el historial
                clinico del paciente.
              </p>
            </div>

            {/* L7 (2026-04-29): el modal "Finalizar consulta" fue eliminado
                junto con el cronómetro manual. La duración se cierra sola en
                el primer save del informe. */}
          </div>

          {/* Right Sidebar Toggle (when hidden) */}
          {!showRightSidebar && (
            <button
              onClick={() => setShowRightSidebar(true)}
              className="hidden lg:flex fixed right-4 top-24 z-30 items-center justify-center w-10 h-10 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 hover:shadow-md transition-all"
              title={selected.patient_name}
            >
              <User className="w-4 h-4 text-teal-500" />
            </button>
          )}

          {/* Right Sidebar — Slim: patient header + payment */}
          {showRightSidebar && (
            <div className="lg:w-72 space-y-0 shrink-0">
              <div className="bg-white border border-slate-200 rounded-xl p-5 sticky top-20">
                {/* Compact header: patient name + code + ficha link + hide button */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm leading-tight truncate">
                      {selected.patient_name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {selected.consultation_code}
                    </p>
                    {selected.patient_id && (
                      <button
                        type="button"
                        onClick={() => setFichaPatientId(selected.patient_id)}
                        className="inline-flex items-center gap-0.5 mt-1 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                      >
                        Ver ficha del paciente <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowRightSidebar(false)}
                    className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0"
                    title="Ocultar panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Payment — collapsible */}
                <div className="border-t border-slate-100 mt-3 pt-3">
                  <button
                    onClick={() => setShowPaymentDetails(!showPaymentDetails)}
                    className="w-full flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold text-slate-600 uppercase">Pago</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${ps.color}`}
                      >
                        <span className={`w-1 h-1 rounded-full ${ps.dot}`} />
                        {ps.label}
                      </span>
                      {showPaymentDetails ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </button>
                  {showPaymentDetails && (
                    <div className="mt-3 space-y-2">
                      {/* Datos de cita (read-only) */}
                      {appointmentData &&
                        (appointmentData.payment_method || appointmentData.plan_price) && (
                          <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                            {appointmentData.plan_name && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Plan:</span>
                                <span className="font-semibold text-slate-800">
                                  {appointmentData.plan_name}
                                </span>
                              </div>
                            )}
                            {appointmentData.plan_price != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Monto:</span>
                                <div className="text-right">
                                  <span className="font-semibold text-slate-800">
                                    ${appointmentData.plan_price.toFixed(2)}
                                  </span>
                                  {bcvRate && (
                                    <span className="block text-[10px] text-slate-400">
                                      {toBs(appointmentData.plan_price)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {appointmentData.payment_method && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Método:</span>
                                <span className="font-semibold text-slate-800">
                                  {appointmentData.payment_method.replace(/_/g, ' ')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                      {/* === Detalles del pago (editables) — método PRIMERO para no dejarlo en blanco === */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          Detalles del pago
                        </p>

                        {/* Método de pago */}
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                            Método de pago
                          </label>
                          <div className="relative">
                            <select
                              value={pagoMethod}
                              disabled={pagoDetailsSaving}
                              onChange={(e) => setPagoMethod(e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded-lg py-1.5 pl-2.5 pr-8 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all appearance-none bg-white text-slate-700 disabled:text-slate-400 disabled:cursor-wait"
                            >
                              <option value="">— Sin especificar —</option>
                              {(doctorPaymentMethods.length > 0
                                ? [
                                    { value: 'efectivo', label: 'Efectivo USD' },
                                    { value: 'efectivo_bs', label: 'Efectivo Bs' },
                                    { value: 'pago_movil', label: 'Pago Móvil' },
                                    { value: 'transferencia', label: 'Transferencia' },
                                    { value: 'zelle', label: 'Zelle' },
                                    { value: 'binance', label: 'Binance' },
                                    { value: 'pos', label: 'POS / Punto de venta' },
                                    { value: 'seguro', label: 'Seguro' },
                                  ].filter((m) => doctorPaymentMethods.includes(m.value))
                                : [
                                    { value: 'efectivo', label: 'Efectivo USD' },
                                    { value: 'efectivo_bs', label: 'Efectivo Bs' },
                                    { value: 'pago_movil', label: 'Pago Móvil' },
                                    { value: 'transferencia', label: 'Transferencia' },
                                    { value: 'zelle', label: 'Zelle' },
                                    { value: 'binance', label: 'Binance' },
                                    { value: 'pos', label: 'POS / Punto de venta' },
                                    { value: 'seguro', label: 'Seguro' },
                                  ]
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              <ChevronDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </div>
                        </div>

                        {/* Referencia */}
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                            Referencia / Nro. comprobante
                          </label>
                          <input
                            type="text"
                            value={pagoReference}
                            disabled={pagoDetailsSaving}
                            onChange={(e) => setPagoReference(e.target.value)}
                            placeholder="Ej: #12345, últimos 4 dígitos…"
                            className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-2.5 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 placeholder:text-slate-400 disabled:text-slate-400 disabled:cursor-wait"
                          />
                        </div>

                        {/* Comprobante de pago */}
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                            Comprobante{' '}
                            <span className="text-slate-400 normal-case font-normal">
                              (opcional)
                            </span>
                          </label>
                          {pagoReceiptPath ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={pagoReceiptPath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1"
                              >
                                <FileText className="w-3 h-3" /> Ver comprobante
                              </a>
                              <button
                                type="button"
                                disabled={pagoDetailsSaving || pagoReceiptUploading}
                                onClick={() => setPagoReceiptPath(null)}
                                className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                              {pagoReceiptUploading ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-teal-500" />
                                  <span className="text-[10px] text-teal-600">Subiendo…</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3 text-slate-400" />
                                  <span className="text-[10px] text-slate-500">
                                    Adjuntar comprobante
                                  </span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={pagoReceiptUploading || pagoDetailsSaving}
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setPagoReceiptUploading(true);
                                  try {
                                    const fd = new FormData();
                                    fd.append('file', file);
                                    fd.append('kind', 'receipt');
                                    const uploadRes = await fetch('/api/storage/upload', {
                                      method: 'POST',
                                      body: fd,
                                    });
                                    const uploadJson: unknown = await uploadRes.json();
                                    const urlData = uploadJson as {
                                      data?: { url?: string; path?: string };
                                    };
                                    const path = urlData?.data?.path ?? urlData?.data?.url ?? null;
                                    if (uploadRes.ok && path) {
                                      setPagoReceiptPath(path);
                                    } else {
                                      showToast({
                                        type: 'error',
                                        message: 'No se pudo subir el comprobante',
                                      });
                                    }
                                  } catch {
                                    showToast({
                                      type: 'error',
                                      message: 'Error al subir el comprobante',
                                    });
                                  } finally {
                                    setPagoReceiptUploading(false);
                                    // Reset input so the same file can be re-selected
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* === Estado del pago (marcar pagado) — ÚLTIMO: exige método elegido === */}
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Estado del pago
                        </label>
                        <div className="relative">
                          <select
                            value={normalizePaymentStatus(report.payment_status)}
                            disabled={pagoSaving}
                            onChange={(e) => {
                              const next = e.target.value as 'pending' | 'approved';
                              if (next === normalizePaymentStatus(report.payment_status)) return;
                              // Candado: sin método de pago → abre el modal para capturarlo
                              // en vez de bloquear con un toast de error.
                              if (next === 'approved' && !pagoMethod.trim()) {
                                setPendingApprovalAfterMethod(true);
                                setShowPaymentMethodModal(true);
                                return;
                              }
                              updatePagoStatus(selected.id, next, selected.appointment_id);
                            }}
                            className={`w-full text-xs font-semibold border-2 rounded-lg py-2 pl-3 pr-9 outline-none focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none bg-white ${
                              pagoSaving
                                ? 'border-slate-200 text-slate-400 cursor-wait'
                                : 'border-slate-200 text-slate-700 hover:border-teal-300 cursor-pointer'
                            }`}
                          >
                            {(['pending', 'approved'] as const).map((key) => (
                              <option key={key} value={key}>
                                {PAYMENT_STATUS[key].label}
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            {pagoSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </div>
                        {pagoSaving && (
                          <p className="text-[10px] text-teal-600 mt-1 flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Guardando…
                          </p>
                        )}
                      </div>

                      {/* Total cobrado (visible cuando el pago está aprobado) */}
                      {selected.payment_status === 'approved' && selected.amount != null && (
                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-1">
                          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                            Total cobrado
                          </p>
                          <p className="text-sm font-extrabold text-emerald-700">
                            ${Number(selected.amount).toFixed(2)}
                          </p>
                          {selected.extra_items && selected.extra_items.length > 0 && (
                            <div className="pt-1 space-y-0.5">
                              {selected.base_amount != null && (
                                <div className="flex justify-between text-[10px] text-emerald-600">
                                  <span>Consulta base</span>
                                  <span>${Number(selected.base_amount).toFixed(2)}</span>
                                </div>
                              )}
                              {selected.extra_items.map((ei, idx) => (
                                <div
                                  key={ei.id ?? idx}
                                  className="flex justify-between text-[10px] text-emerald-600"
                                >
                                  <span className="truncate mr-2">{ei.description}</span>
                                  <span className="shrink-0">
                                    ${Number(ei.amount_usd).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ingreso adicional — visible solo cuando el pago está aprobado */}
                      {selected.payment_status === 'approved' && (
                        <button
                          type="button"
                          onClick={() =>
                            void openExtraIncomeModal(selected.id, selected.patient_id)
                          }
                          className="w-full flex items-center justify-center gap-1.5 border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 text-xs font-semibold rounded-lg py-2 transition-colors"
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" />
                          Ingreso adicional
                        </button>
                      )}

                      {/* Botón Guardar pago — write final (persiste método/referencia/comprobante y aprueba) */}
                      <button
                        type="button"
                        disabled={pagoDetailsSaving || pagoReceiptUploading}
                        onClick={async () => {
                          // "Guardar pago" es el ÚNICO punto que escribe a BD. Si el
                          // estado del pago es "Aprobado", aquí se aprueba de verdad
                          // (status + extras + método) y el método ES OBLIGATORIO.
                          const isApproving =
                            normalizePaymentStatus(report.payment_status) === 'approved';
                          if (isApproving && !pagoMethod.trim()) {
                            // Abrir modal de método de pago en lugar de bloquear con toast.
                            // El doctor SÍ está aprobando → tras registrar el método, marcar pagado.
                            setPendingApprovalAfterMethod(true);
                            setShowPaymentMethodModal(true);
                            return;
                          }
                          setPagoDetailsSaving(true);
                          try {
                            // 1. Guardar detalles (método/referencia/comprobante).
                            const result = await updateConsultationPaymentDetails(selected.id, {
                              payment_method: pagoMethod || null,
                              payment_reference: pagoReference || null,
                              payment_receipt_url: pagoReceiptPath,
                            });
                            if (!result.success) {
                              showToast({
                                type: 'error',
                                message: result.error ?? 'Error al guardar el pago',
                              });
                              return;
                            }
                            // 2. Si el estado es "Aprobado", persistir la aprobación
                            //    (status + extras confirmados + método) en la BD.
                            if (isApproving) {
                              const extras = (selected.extra_items || []).map((e) => ({
                                description: e.description,
                                amount_usd: e.amount_usd,
                              }));
                              const res = await fetch(
                                `/api/doctor/consultations/${selected.id}/approve-payment`,
                                {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ extras, method: pagoMethod }),
                                },
                              );
                              const json = (await res.json()) as {
                                success?: boolean;
                                error?: string;
                              };
                              if (!res.ok || !json.success) {
                                showToast({
                                  type: 'error',
                                  message: json.error ?? 'No se pudo aprobar el cobro',
                                });
                                return;
                              }
                            }
                            // Actualizar estado local de forma inmutable
                            const updated = {
                              payment_method: pagoMethod || null,
                              payment_reference: pagoReference || null,
                              payment_receipt_url: pagoReceiptPath,
                            };
                            setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
                            setConsultations((prev) =>
                              prev.map((x) => (x.id === selected.id ? { ...x, ...updated } : x)),
                            );
                            showToast({
                              type: 'success',
                              message: isApproving
                                ? 'Cobro aprobado y guardado'
                                : 'Pago actualizado',
                            });
                          } finally {
                            setPagoDetailsSaving(false);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-wait text-white text-xs font-semibold rounded-lg py-2 transition-colors"
                      >
                        {pagoDetailsSaving ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" /> Guardando…
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3" /> Guardar pago
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Ingreso adicional (consulta ya pagada) */}
        {showExtraIncomeModal && selected && (
          <IncomeModal
            concepts={extraIncomeConcepts}
            consultations={[
              {
                id: selected.id,
                consultation_code: selected.consultation_code ?? null,
                consultation_date: selected.consultation_date ?? null,
                patient_name: selected.patient_name,
                patient_email: selected.patient_email ?? null,
                patient_phone: selected.patient_phone ?? null,
                patient_cedula: null,
                appointment_status: selected.appointment_status ?? null,
                consultation_status: null,
                payment_status: selected.payment_status ?? null,
                duration_minutes: selected.duration_minutes ?? null,
                diagnosis: selected.diagnosis ?? null,
                amount_usd: selected.amount ?? null,
                plan_name: null,
                chief_complaint: selected.chief_complaint ?? null,
                treatment: selected.treatment ?? null,
                notes: selected.notes ?? null,
                blocks_data: null,
                blocks_snapshot: null,
                scheduled_at: null,
                appointment_mode: null,
                payment_method: selected.payment_method ?? null,
                payment_reference: selected.payment_reference ?? null,
              },
            ]}
            patients={patients.map((p) => ({
              id: p.id,
              doctor_id: '',
              full_name: p.full_name,
              age: p.age ?? null,
              phone: p.phone ?? null,
              cedula: p.cedula ?? null,
              email: p.email ?? null,
              sex: p.sex ?? null,
              notes: null,
              source: null,
              blood_type: p.blood_type ?? null,
              allergies: p.allergies ?? null,
              chronic_conditions: p.chronic_conditions ?? null,
              created_at: '',
            }))}
            form={extraIncomeForm}
            saving={extraIncomeSaving || extraIncomeConceptsLoading}
            error={extraIncomeError}
            onChangeForm={setExtraIncomeForm}
            onSubmit={(e) => void handleExtraIncomeSubmit(e)}
            onClose={() => setShowExtraIncomeModal(false)}
            onCreateConcept={async (name) => {
              const res = await createIncomeConcept(name);
              if (res.success) {
                setExtraIncomeConcepts((prev) => [...prev, res.data]);
              }
              return res;
            }}
            onUpdateConcept={async (id, patch) => {
              const res = await updateIncomeConcept(id, patch);
              if (res.success) {
                setExtraIncomeConcepts((prev) => prev.map((c) => (c.id === id ? res.data : c)));
              }
              return res;
            }}
            onDeleteConcept={async (id) => {
              const res = await deleteIncomeConcept(id);
              if (res.success) {
                setExtraIncomeConcepts((prev) => prev.filter((c) => c.id !== id));
              }
              return res;
            }}
          />
        )}

        {/* Modal: Recipe */}
        {showRecipe && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Pill className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Nueva receta</h2>
                </div>
                <div className="flex items-center gap-2">
                  {/* Botón "Dictar receta" — gating ai_transcription (misma feature que Grabar consulta) */}
                  {!planLoading && planFeatures.ai_transcription && (
                    <>
                      {dictateState === 'idle' && (
                        <button
                          onClick={dictateRecipe}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
                          style={{ background: 'var(--dh-coral, #FF8A65)' }}
                          title="Dicta los medicamentos por voz y la IA los pre-llena en la receta"
                        >
                          <Mic className="w-3.5 h-3.5" /> Dictar receta
                        </button>
                      )}
                      {dictateState === 'recording' && (
                        <button
                          onClick={stopDictateRecording}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors animate-pulse"
                        >
                          <Square className="w-3.5 h-3.5" fill="white" /> Detener
                        </button>
                      )}
                      {(dictateState === 'transcribing' || dictateState === 'analyzing') && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {dictateState === 'transcribing' ? 'Transcribiendo…' : 'Analizando…'}
                        </span>
                      )}
                      {dictateState === 'error' && dictateError && (
                        <span className="flex items-center gap-1.5 text-xs text-red-600 max-w-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{dictateError}</span>
                          <button onClick={cancelDictateRecording} className="shrink-0 underline">
                            cerrar
                          </button>
                        </span>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setShowRecipe(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                {recipe.medications.map((med, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
                  >
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Medicamento {idx + 1}
                    </p>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          placeholder="Nombre del medicamento"
                          value={med.name}
                          onChange={(e) =>
                            setRecipe((p) => ({
                              ...p,
                              medications: p.medications.map((m, i) =>
                                i === idx ? { ...m, name: e.target.value } : m,
                              ),
                            }))
                          }
                          className={fi}
                        />
                        <input
                          type="text"
                          placeholder="Dosis (ej: 500mg)"
                          value={med.dose}
                          onChange={(e) =>
                            setRecipe((p) => ({
                              ...p,
                              medications: p.medications.map((m, i) =>
                                i === idx ? { ...m, dose: e.target.value } : m,
                              ),
                            }))
                          }
                          className={fi}
                        />
                        <input
                          type="text"
                          placeholder="Vía de administración (ej: oral, intramuscular)"
                          value={med.route}
                          onChange={(e) =>
                            setRecipe((p) => ({
                              ...p,
                              medications: p.medications.map((m, i) =>
                                i === idx ? { ...m, route: e.target.value } : m,
                              ),
                            }))
                          }
                          className={fi}
                        />
                        <input
                          type="text"
                          placeholder="Frecuencia (ej: cada 8h)"
                          value={med.frequency}
                          onChange={(e) =>
                            setRecipe((p) => ({
                              ...p,
                              medications: p.medications.map((m, i) =>
                                i === idx ? { ...m, frequency: e.target.value } : m,
                              ),
                            }))
                          }
                          className={fi}
                        />
                        <input
                          type="text"
                          placeholder="Duración (ej: 7 días)"
                          value={med.duration}
                          onChange={(e) =>
                            setRecipe((p) => ({
                              ...p,
                              medications: p.medications.map((m, i) =>
                                i === idx ? { ...m, duration: e.target.value } : m,
                              ),
                            }))
                          }
                          className={fi}
                        />
                        {/* Selector de presentación farmacéutica — obligatorio */}
                        <div className="flex gap-2">
                          <select
                            value={
                              med.presentation &&
                              ![
                                'Tabletas',
                                'Cápsulas',
                                'Gotas',
                                'Jarabe',
                                'Spray',
                                'Crema',
                                'Ungüento',
                                'Ampolla/Inyección',
                                'Supositorio',
                                'Óvulo',
                                'Inhalador',
                                'Polvo',
                                'Solución',
                                'Parche',
                              ].includes(med.presentation)
                                ? 'Otro'
                                : med.presentation
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setRecipe((p) => ({
                                ...p,
                                medications: p.medications.map((m, i) =>
                                  i === idx ? { ...m, presentation: val === 'Otro' ? '' : val } : m,
                                ),
                              }));
                            }}
                            className={`${fi} flex-1`}
                          >
                            <option value="">Presentación</option>
                            <option value="Tabletas">Tabletas</option>
                            <option value="Cápsulas">Cápsulas</option>
                            <option value="Gotas">Gotas</option>
                            <option value="Jarabe">Jarabe</option>
                            <option value="Spray">Spray</option>
                            <option value="Crema">Crema</option>
                            <option value="Ungüento">Ungüento</option>
                            <option value="Ampolla/Inyección">Ampolla/Inyección</option>
                            <option value="Supositorio">Supositorio</option>
                            <option value="Óvulo">Óvulo</option>
                            <option value="Inhalador">Inhalador</option>
                            <option value="Polvo">Polvo</option>
                            <option value="Solución">Solución</option>
                            <option value="Parche">Parche</option>
                            <option value="Otro">Otro</option>
                          </select>
                          {/* Input libre cuando eligen "Otro" */}
                          {med.presentation &&
                            ![
                              'Tabletas',
                              'Cápsulas',
                              'Gotas',
                              'Jarabe',
                              'Spray',
                              'Crema',
                              'Ungüento',
                              'Ampolla/Inyección',
                              'Supositorio',
                              'Óvulo',
                              'Inhalador',
                              'Polvo',
                              'Solución',
                              'Parche',
                              '',
                            ].includes(med.presentation) && (
                              <input
                                type="text"
                                placeholder="Especificar presentación"
                                value={med.presentation}
                                onChange={(e) =>
                                  setRecipe((p) => ({
                                    ...p,
                                    medications: p.medications.map((m, i) =>
                                      i === idx ? { ...m, presentation: e.target.value } : m,
                                    ),
                                  }))
                                }
                                className={`${fi} flex-1`}
                              />
                            )}
                        </div>
                        {/* Indicaciones — campo opcional, va al final */}
                        <input
                          type="text"
                          placeholder="Indicaciones (opcional)"
                          value={med.indications}
                          onChange={(e) =>
                            setRecipe((p) => ({
                              ...p,
                              medications: p.medications.map((m, i) =>
                                i === idx ? { ...m, indications: e.target.value } : m,
                              ),
                            }))
                          }
                          className={fi}
                        />
                      </div>
                      <button
                        onClick={() => removeMedication(idx)}
                        className="text-red-500 hover:text-red-700 mt-1"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick medications from templates */}
              {quickMeds.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    Medicamentos frecuentes (clic para agregar):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickMeds.map((q) => (
                      <button
                        key={q.id}
                        onClick={() =>
                          setRecipe((p) => ({
                            ...p,
                            medications: [
                              ...p.medications,
                              {
                                name: q.name,
                                dose: q.details || '',
                                route: '',
                                frequency: '',
                                duration: '',
                                presentation: '',
                                indications: '',
                              },
                            ],
                          }))
                        }
                        className="text-xs px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium"
                      >
                        + {q.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={addMedication}
                className="w-full border-2 border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50"
              >
                + Agregar medicamento
              </button>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Notas adicionales
                </label>
                <RichTextEditor
                  value={recipe.notes}
                  onChange={(html) => setRecipe((p) => ({ ...p, notes: html }))}
                  placeholder="Ej: Tomar con comida, evitar sol..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRecipe(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveRecipe}
                  disabled={isSavingRecipe}
                  className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {isSavingRecipe ? (
                    'Guardando...'
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Guardar receta
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* L1 (2026-04-29) FIX: MODAL "GENERAR INFORME" — vivía solo en la vista
            list (línea ~3286) pero el botón está en la vista consultation, así
            que el setState disparaba pero React nunca renderizaba el modal. */}
        {showGenerateReport &&
          selected &&
          (() => {
            const effective = getEffectiveBlocks(selected);
            const printable = effective.filter((b) => b.printable);
            console.log('[generar-informe] MODAL RENDERING (consultation view)', {
              effectiveCount: effective.length,
              printableCount: printable.length,
            });
            return (
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
                onClick={() => !generatingReport && setShowGenerateReport(false)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-teal-600" />
                      </div>
                      <h2 className="text-lg font-bold text-slate-900">Generar informe</h2>
                    </div>
                    <button
                      onClick={() => setShowGenerateReport(false)}
                      disabled={generatingReport}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">
                    Selecciona los bloques que quieres incluir en el PDF.
                  </p>
                  {generatedReportUrl && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Informe generado
                      </p>
                      <a
                        href={generatedReportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 underline hover:text-emerald-800"
                      >
                        Abrir PDF en nueva pestaña <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() =>
                          navigator.clipboard?.writeText(generatedReportUrl).catch(() => {})
                        }
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 ml-3"
                      >
                        Copiar enlace
                      </button>
                    </div>
                  )}
                  <div className="space-y-2 border border-slate-100 rounded-xl p-3">
                    {printable.length === 0 && (
                      <p className="text-xs text-slate-400 italic">
                        No hay bloques compartibles en esta consulta.
                      </p>
                    )}
                    {printable.map((b) => (
                      <label key={b.key} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reportSelectedKeys.has(b.key)}
                          onChange={(e) => {
                            setReportSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(b.key);
                              else next.delete(b.key);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-slate-300 accent-teal-500"
                        />
                        <span className="text-sm text-slate-700">{b.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowGenerateReport(false)}
                      disabled={generatingReport}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (reportSelectedKeys.size === 0) {
                          showToast({ type: 'error', message: 'Selecciona al menos un bloque' });
                          return;
                        }
                        setGeneratingReport(true);
                        setGeneratedReportUrl(null);
                        try {
                          const dateStr = new Date(selected.consultation_date).toLocaleDateString(
                            'es-VE',
                            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
                          );
                          let body = '';
                          const debugBlocks: { key: string; label: string; hasContent: boolean }[] =
                            [];
                          // FIX 2026-04-29: si el doctor seleccionó un bloque que está
                          // vacío, igual lo incluimos con placeholder "Sin información
                          // registrada". Antes los bloques vacíos se silenciaban con
                          // `continue` y el doctor solo veía los bloques con contenido,
                          // pensando que había un bug.
                          for (const b of printable) {
                            if (!reportSelectedKeys.has(b.key)) continue;
                            const piece =
                              b.key === 'informe' || b.key === 'notes'
                                ? generateInformeHtml()
                                : generateBlockHtml(b.key, b.label);
                            debugBlocks.push({ key: b.key, label: b.label, hasContent: !!piece });
                            if (piece) {
                              body += piece;
                            } else {
                              body += `<div class="section"><div class="section-title">${b.label}</div><div class="section-content"><em style="color:#94a3b8">Sin información registrada en este bloque.</em></div></div>`;
                            }
                          }
                          if (!body) {
                            const lista = debugBlocks.map((d) => `• ${d.label}: vacío`).join('\n');
                            body = `<div class="section"><div class="section-title">Sin contenido</div><div class="section-content">No hay información registrada en los bloques seleccionados de esta consulta.<br><br>${lista.replace(/\n/g, '<br>')}</div></div>`;
                            console.warn(
                              '[generate-report] generando PDF de placeholder; bloques sin contenido:',
                              debugBlocks,
                            );
                          }
                          const html = buildPdfHtml(
                            'informe',
                            'Informe Médico',
                            body,
                            selected.patient_name,
                            selected.consultation_code,
                            dateStr,
                          );
                          const res = await fetch('/api/doctor/share-pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              htmlContent: html,
                              fileName: `informe-${selected.consultation_code || selected.id}`,
                              consultationCode: selected.consultation_code,
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok || !data.url) {
                            reportError(
                              'doctor/consultations',
                              'generateReport:response',
                              new Error(`HTTP ${res.status}`),
                              { status: res.status },
                            );
                            showToast({
                              type: 'error',
                              message:
                                data.error || `Error generando el PDF (status ${res.status})`,
                            });
                            return;
                          }
                          setGeneratedReportUrl(data.url);
                        } catch (err: unknown) {
                          reportError('doctor/consultations', 'generateReport', err);
                          showToast({
                            type: 'error',
                            message: `Error generando el informe: ${err instanceof Error ? err.message : 'desconocido'}`,
                          });
                        } finally {
                          setGeneratingReport(false);
                        }
                      }}
                      disabled={generatingReport || reportSelectedKeys.size === 0}
                      className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {generatingReport ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Printer className="w-4 h-4" />
                      )}
                      {generatingReport ? 'Generando...' : 'Generar PDF'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* BUG 1/2 FIX: Los modales de ficha y aprobación de pago deben vivir
            en el árbol del return del EDITOR (view='consultation'), no en el
            return de la lista. El return temprano de la línea ~2164 hace que
            React nunca renderice el JSX del segundo return cuando hay una
            consulta abierta, por lo que estos modales nunca se montaban. */}
        {fichaPatientId && (
          <PatientFichaModal
            patientId={fichaPatientId}
            patientName={selected?.patient_name}
            onClose={() => setFichaPatientId(null)}
          />
        )}

        {selected && (
          <ApprovePaymentModal
            open={showApprovePaymentModal}
            consultationId={selected.id}
            baseAmount={selected.base_amount ?? selected.amount ?? 0}
            existingExtras={selected.extra_items ?? []}
            paymentMethod={pagoMethod || undefined}
            onClose={() => setShowApprovePaymentModal(false)}
            onApproved={handlePaymentApproved}
          />
        )}

        {/* Modal de método de pago obligatorio */}
        {selected && (
          <PaymentMethodModal
            open={showPaymentMethodModal}
            consultationId={selected.id}
            availablePaymentMethods={doctorPaymentMethods}
            onClose={() => {
              setShowPaymentMethodModal(false);
              setPendingApprovalAfterMethod(false);
            }}
            onPersist={async (id, method, reference, receiptPath) => {
              const res = await updateConsultationPaymentDetails(id, {
                payment_method: method,
                payment_reference: reference,
                payment_receipt_url: receiptPath,
              });
              return res.success
                ? { success: true as const }
                : { success: false as const, error: (res as { error?: string }).error };
            }}
            onConfirmed={async (method, reference, receiptPath) => {
              // Actualizar el estado local del método/referencia/comprobante
              setPagoMethod(method);
              if (reference) setPagoReference(reference);
              if (receiptPath) setPagoReceiptPath(receiptPath);
              const wasApproving = pendingApprovalAfterMethod;
              setPendingApprovalAfterMethod(false);
              if (!wasApproving || !selected) return;
              // El método/referencia/comprobante YA se guardaron en onPersist. Ahora
              // MARCAR PAGADO directamente (sin abrir otro modal): PATCH approve-payment.
              // Antes se llamaba updatePagoStatus('approved') que abría ApprovePaymentModal
              // → el pago quedaba PENDIENTE con solo el método guardado (bug #2).
              try {
                const extras = (selected.extra_items || []).map((e) => ({
                  description: e.description,
                  amount_usd: e.amount_usd,
                }));
                const res = await fetch(
                  `/api/doctor/consultations/${selected.id}/approve-payment`,
                  {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ extras, method }),
                  },
                );
                const json = (await res.json()) as { success?: boolean; error?: string };
                if (!res.ok || !json.success) {
                  showToast({
                    type: 'error',
                    message: json.error ?? 'No se pudo aprobar el cobro',
                  });
                  return;
                }
                setSelected((prev) =>
                  prev ? { ...prev, payment_status: 'approved', payment_method: method } : prev,
                );
                setReport((prev) => ({ ...prev, payment_status: 'approved' }));
                setConsultations((prev) =>
                  prev.map((x) =>
                    x.id === selected.id
                      ? { ...x, payment_status: 'approved', payment_method: method }
                      : x,
                  ),
                );
                showToast({ type: 'success', message: 'Cobro aprobado y guardado' });
              } catch (err: unknown) {
                reportError('doctor/consultations', 'onConfirmedApprove', err);
                showToast({ type: 'error', message: 'Error al aprobar el cobro' });
              }
            }}
          />
        )}

        {/* Modal de confirmación al salir de una consulta no atendida */}
        {showExitConsultationModal && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowExitConsultationModal(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Consulta sin atender</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Esta consulta aún no está marcada como atendida. ¿Deseas marcarla antes de
                    salir?
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={async () => {
                    setShowExitConsultationModal(false);
                    await updateConsultaStatus(selected.id, 'completed', selected.appointment_id);
                    flushBlocksSave();
                    openedConsultationIdRef.current = null;
                    setView('list');
                    setSelected(null);
                    if (openId) router.push(pathname, { scroll: false });
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  <Check className="w-4 h-4" /> Marcar como atendida y salir
                </button>
                <button
                  onClick={() => {
                    setShowExitConsultationModal(false);
                    flushBlocksSave();
                    openedConsultationIdRef.current = null;
                    setView('list');
                    setSelected(null);
                    if (openId) router.push(pathname, { scroll: false });
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Salir sin marcar
                </button>
                <button
                  onClick={() => setShowExitConsultationModal(false)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-slate-400 text-sm font-medium rounded-lg hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1
              className="font-semibold tracking-tight"
              style={{
                fontFamily: 'var(--dh-font-display)',
                fontSize: 'clamp(22px, 3.2vw, 32px)',
                color: 'var(--dh-ink)',
              }}
            >
              Consultas
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-600)' }}>
              Gestiona tus consultas, entra a realizar el informe médico y controla el pago
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                setRefreshing(true);
                await reloadConsultationsTable();
                setRefreshing(false);
              }}
              disabled={refreshing}
              title="Refrescar el listado"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refrescar</span>
            </button>
            <button
              onClick={() => setShowNewConsultation(true)}
              className="flex items-center justify-center sm:justify-start gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold text-white hover:-translate-y-px transition-all shrink-0"
              style={{ background: 'var(--dh-ink)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dh-turquoise-700)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--dh-ink)';
              }}
            >
              <Plus className="w-4 h-4" /> <span>Nueva consulta</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            {
              label: 'Total',
              value: total,
              color: 'text-slate-700',
              bg: 'bg-white',
              filter: 'all' as TimeFilter,
            },
            {
              label: 'Hoy',
              value: todayCount,
              color: 'text-teal-700',
              bg: 'bg-teal-50 border-teal-200',
              filter: 'today' as TimeFilter,
            },
            {
              label: 'Próximas',
              value: upcoming,
              color: 'text-blue-700',
              bg: 'bg-blue-50 border-blue-200',
              filter: 'upcoming' as TimeFilter,
            },
            {
              label: 'Realizadas',
              value: total - upcoming,
              color: 'text-slate-600',
              bg: 'bg-slate-50',
              filter: 'past' as TimeFilter,
            },
          ].map((s) => (
            <button
              key={s.filter}
              onClick={() => setTimeFilterAndReset(timeFilter === s.filter ? 'all' : s.filter)}
              className={`border rounded-xl p-3 sm:p-4 text-center transition-all hover:shadow-sm ${s.bg} ${timeFilter === s.filter ? 'ring-2 ring-teal-400 ring-offset-1' : 'border-slate-200'}`}
            >
              <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Search & filter */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por paciente o código..."
              className={fi + ' pl-9'}
            />
          </div>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilterAndReset(e.target.value as TimeFilter)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal-400 text-slate-600 bg-white shrink-0"
          >
            <option value="all">Todas</option>
            <option value="today">Hoy</option>
            <option value="upcoming">Próximas</option>
            <option value="past">Realizadas</option>
          </select>
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 shrink-0">
            <ArrowUpDown className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={sortKey}
              onChange={(e) => setSortKeyAndReset(e.target.value as typeof sortKey)}
              className="text-sm text-slate-600 outline-none bg-transparent py-2.5 pr-2"
            >
              <option value="consultation_date">Ordenar por: Fecha de consulta</option>
              <option value="created_at">Ordenar por: Fecha de creación</option>
              <option value="status">Ordenar por: Estatus (atendida)</option>
              <option value="appointment_status">Ordenar por: Confirmación</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">{total} consultas</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Cargando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-slate-500 font-semibold text-sm">Sin consultas</p>
              <p className="text-slate-400 text-xs mt-1">
                Las consultas aparecen cuando se agendan desde la página de booking o se crean en el
                módulo de pacientes.
              </p>
            </div>
          ) : (
            filtered.map((c, i) => {
              const cDate = new Date(c.consultation_date);
              const isToday = c.consultation_date.startsWith(today);
              const isUpcoming = cDate > now;
              const ps = PAYMENT_STATUS[c.payment_status];
              const hasReport = c.diagnosis || c.notes;

              return (
                <button
                  key={c.id}
                  onClick={() => openConsultation(c)}
                  className={`w-full flex flex-col sm:flex-row items-start gap-3 sm:gap-4 px-4 sm:px-5 py-4 text-left hover:bg-slate-50 transition-colors ${i < filtered.length - 1 ? 'border-b border-slate-100' : ''}`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isToday ? 'g-bg' : isUpcoming ? 'bg-blue-50' : 'bg-slate-100'}`}
                  >
                    {isToday ? (
                      <Stethoscope className="w-5 h-5 text-white" />
                    ) : isUpcoming ? (
                      <Clock className="w-5 h-5 text-blue-500" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 break-words">
                        {c.patient_name}
                      </p>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {c.consultation_code}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 shrink-0">
                          Hoy
                        </span>
                      )}
                      {!isToday && isUpcoming && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">
                          Próxima
                        </span>
                      )}
                      {c.appointment_status === 'scheduled' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                          Por confirmar
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {cDate.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} ·{' '}
                          {cDate.toLocaleTimeString('es-VE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {c.chief_complaint && (
                        <>
                          <span className="hidden sm:inline text-slate-200">·</span>
                          <span className="italic truncate">{c.chief_complaint}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    {hasReport && (
                      <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full hidden sm:inline-block">
                        Con informe
                      </span>
                    )}

                    {/* === RONDA 17 — BADGE ASISTENCIA (estilo OUTLINED, azul/gris) === */}
                    {(() => {
                      const isAttended = c.status === 'completed';
                      const isNoShow = c.status === 'no_show';
                      const isInProgress = c.status === 'in_progress';
                      const label = isAttended
                        ? 'Atendió'
                        : isNoShow
                          ? 'No atendió'
                          : isInProgress
                            ? 'En curso'
                            : 'Por asistir';
                      const cls = isAttended
                        ? 'border-blue-300 text-blue-700 bg-transparent'
                        : isNoShow
                          ? 'border-red-300 text-red-600 bg-transparent'
                          : isInProgress
                            ? 'border-blue-200 text-blue-600 bg-transparent'
                            : 'border-slate-300 text-slate-600 bg-transparent';
                      return (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${cls}`}
                          title={`Asistencia: ${label}`}
                        >
                          {isAttended ? (
                            <UserCheck className="w-3 h-3" />
                          ) : (
                            <User className="w-3 h-3" />
                          )}
                          <span className="hidden sm:inline">{label}</span>
                        </span>
                      );
                    })()}

                    {/* === RONDA 17 — BADGE PAGO (estilo SÓLIDO, verde/naranja, icono billete) === */}
                    {(() => {
                      const isPaid = c.payment_status === 'approved';
                      const cls = isPaid ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white';
                      const label = isPaid ? 'Pagado' : 'Pendiente';
                      return (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${cls}`}
                          title={`Pago: ${label}`}
                        >
                          <Banknote className="w-3 h-3" />
                          <span className="hidden sm:inline">{label}</span>
                        </span>
                      );
                    })()}

                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </button>
              );
            })
          )}

          {/* Paginación server-side */}
          {!loading && total > 0 && (
            <Paginator
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizeOptions={[10, 15, 20, 50]}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(ps) => {
                setPageSize(ps);
                setPage(1);
              }}
            />
          )}
        </div>

        {/* === Modal Nueva Consulta UNIFICADO ===
            Usa el mismo NewAppointmentFlow que /agenda y /patients y /book.
            Mismos pasos, misma UX, mismo header gradiente Delta. */}
        <NewAppointmentFlow
          open={showNewConsultation}
          onClose={() => setShowNewConsultation(false)}
          onSuccess={() => {
            setShowNewConsultation(false);
            // Tras crear, refrescar la tabla y quedarse en el LISTADO.
            // NO abrir el editor de la consulta (decisión del usuario).
            void reloadConsultationsTable();
          }}
          initialContext={{ origin: 'dashboard_btn' }}
        />

        {/* Ficha del paciente en ventana emergente — no saca de la consulta. */}
        {fichaPatientId && (
          <PatientFichaModal
            patientId={fichaPatientId}
            patientName={selected?.patient_name}
            onClose={() => setFichaPatientId(null)}
          />
        )}

        {/* === Modal viejo eliminado en ronda 11 (commented out, mantener un bloque vacio para no romper closures) === */}
        {false && showNewConsultation && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Nueva consulta</h2>
                </div>
                <button
                  onClick={() => setShowNewConsultation(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Step 1: Patient search (identical to agenda) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Paciente <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar paciente..."
                      value={
                        newConsultation.patient_id
                          ? patients.find((p) => p.id === newConsultation.patient_id)?.full_name ||
                            patientSearchText
                          : patientSearchText
                      }
                      onChange={(e) => {
                        setPatientSearchText(e.target.value);
                        if (newConsultation.patient_id)
                          setNewConsultation((p) => ({ ...p, patient_id: '' }));
                      }}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                    {newConsultation.patient_id && (
                      <button
                        onClick={() => {
                          setNewConsultation((p) => ({ ...p, patient_id: '' }));
                          setPatientSearchText('');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {!newConsultation.patient_id && patientSearchText.length > 0 && (
                    <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto">
                      {patients.filter((p) =>
                        p.full_name.toLowerCase().includes(patientSearchText.toLowerCase()),
                      ).length === 0 ? (
                        <p className="text-xs text-slate-400 p-3 text-center">
                          No se encontro paciente
                        </p>
                      ) : (
                        patients
                          .filter((p) =>
                            p.full_name.toLowerCase().includes(patientSearchText.toLowerCase()),
                          )
                          .slice(0, 8)
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setNewConsultation((prev) => ({ ...prev, patient_id: p.id }));
                                setPatientSearchText('');
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
                  {newConsultation.patient_id && (
                    <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                      <CheckCircle className="w-4 h-4 text-teal-500" />
                      <span className="text-sm font-semibold text-teal-700">
                        {patients.find((p) => p.id === newConsultation.patient_id)?.full_name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 2: Date and time slot selection */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Fecha y hora
                  </label>

                  {/* Date selector */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                        disabled={weekOffset === 0}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4 rotate-90" />
                      </button>
                      <span className="text-xs text-slate-400">Selecciona un día</span>
                      <button
                        type="button"
                        onClick={() => setWeekOffset(weekOffset + 1)}
                        disabled={weekOffset * 5 + 5 >= availableDates.length}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4 -rotate-90" />
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {weekDates.map((d) => {
                        const isSelected = selectedDate === d.date;
                        const isToday = d.date === today;
                        return (
                          <button
                            key={d.date}
                            type="button"
                            onClick={() => {
                              setSelectedDate(d.date);
                              setSelectedTime('');
                              setNewConsultation((p) => ({ ...p, consultation_date: '' }));
                            }}
                            className={`py-2 px-1 rounded-xl text-center transition-all border-2 ${
                              isSelected
                                ? 'border-teal-400 bg-teal-50 text-teal-700'
                                : 'border-slate-100 bg-white hover:border-teal-200 text-slate-600'
                            }`}
                          >
                            <p className="text-[10px] font-medium capitalize">
                              {d.label.split(' ')[0]}
                            </p>
                            <p className={`text-sm font-bold ${isToday ? 'text-teal-600' : ''}`}>
                              {d.label.split(' ').slice(1).join(' ')}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time slot grid */}
                  {selectedDate && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Horarios disponibles</p>
                      {timeSlotsForDate.length === 0 ? (
                        <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                          No hay horarios disponibles para este día. Configura tu disponibilidad en
                          Agenda.
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                          {timeSlotsForDate.map((time) => {
                            const booked = isTimeBooked(selectedDate, time);
                            const isSelected = selectedTime === time;
                            return (
                              <button
                                key={time}
                                type="button"
                                disabled={booked}
                                onClick={() => {
                                  setSelectedTime(time);
                                  const dateTimeISO = new Date(
                                    `${selectedDate}T${time}:00`,
                                  ).toISOString();
                                  setNewConsultation((p) => ({
                                    ...p,
                                    consultation_date: dateTimeISO,
                                  }));
                                }}
                                className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
                                  booked
                                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                                    : isSelected
                                      ? 'bg-teal-500 text-white shadow-md'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'
                                }`}
                              >
                                {time}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedDate && selectedTime && (
                    <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                      <CheckCircle className="w-4 h-4 text-teal-500" />
                      <span className="text-sm font-semibold text-teal-700">
                        {new Date(`${selectedDate}T${selectedTime}:00`).toLocaleDateString(
                          'es-VE',
                          { weekday: 'long', day: 'numeric', month: 'long' },
                        )}{' '}
                        a las {selectedTime}
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 3: Reason */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Motivo de consulta
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Revision general, dolor de cabeza..."
                    value={newConsultation.reason}
                    onChange={(e) => setNewConsultation((p) => ({ ...p, reason: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  />
                </div>

                {/* Step 4: Plan selector */}
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
                          type="button"
                          onClick={() =>
                            setNewConsultation((p) => ({
                              ...p,
                              plan_id: plan.id,
                              amount: String(plan.price_usd),
                            }))
                          }
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${newConsultation.plan_id === plan.id ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-800">
                              {plan.name}
                            </span>
                            <div className="text-right">
                              <span className="text-sm font-bold text-teal-600">
                                ${plan.price_usd.toFixed(2)}
                              </span>
                              {bcvRate && (
                                <span className="block text-[11px] text-slate-400">
                                  {toBs(plan.price_usd)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-slate-400">
                            {plan.duration_minutes} min
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 5: Payment method + reference */}
                {newConsultation.plan_id && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Metodo de pago <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={newConsultation.payment_method}
                        onChange={(e) =>
                          setNewConsultation((p) => ({
                            ...p,
                            payment_method: e.target.value as any,
                          }))
                        }
                        className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      >
                        <option value="">-- Selecciona metodo de pago --</option>
                        {[
                          { value: 'efectivo', label: 'Efectivo USD' },
                          { value: 'efectivo_bs', label: 'Efectivo Bs' },
                          { value: 'pago_movil', label: 'Pago Movil' },
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
                        value={newConsultation.payment_reference}
                        onChange={(e) =>
                          setNewConsultation((p) => ({ ...p, payment_reference: e.target.value }))
                        }
                        placeholder="Ej: #12345, ultimo 4 digitos..."
                        className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      />
                    </div>

                    {/* Comprobante upload */}
                    {newConsultation.payment_method &&
                      requiresReceipt(newConsultation.payment_method) && (
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
                              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                              className="hidden"
                            />
                            <div className="text-center">
                              <Upload className="w-4 h-4 mx-auto mb-1 text-teal-500" />
                              {/* AUDIT FIX 2026-04-28 (TS-2/TS-3): nullish coalescing en lugar de ternary. */}
                              <p className="text-xs font-medium text-slate-600">
                                {receiptFile?.name ?? 'JPG, PNG o PDF'}
                              </p>
                            </div>
                          </label>
                          {receiptFile && (
                            <p className="text-xs text-slate-500">
                              {((receiptFile?.size ?? 0) / 1024 / 1024).toFixed(2)} MB
                            </p>
                          )}
                        </div>
                      )}
                  </div>
                )}

                {/* Step 6: Comments */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Comentarios / Notas
                  </label>
                  <textarea
                    placeholder="Notas adicionales sobre la consulta..."
                    value={newConsultation.comments}
                    onChange={(e) =>
                      setNewConsultation((p) => ({ ...p, comments: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                  />
                </div>

                {/* Email notification toggle */}
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <input
                    type="checkbox"
                    checked={newConsultation.sendEmail}
                    onChange={(e) =>
                      setNewConsultation((p) => ({ ...p, sendEmail: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-slate-300 accent-teal-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-700">
                      Enviar correo al paciente
                    </span>
                    <p className="text-xs text-slate-500">
                      Se enviara un email con los detalles de la consulta
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewConsultation(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={createNewConsultation}
                  disabled={isCreatingConsultation}
                  className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {isCreatingConsultation ? (
                    'Creando...'
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Crear consulta
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* L1 (2026-04-29): MODAL "GENERAR INFORME"
            Lista los bloques printable de la consulta con checkboxes (todos marcados),
            y al click de "Generar PDF" sube el HTML a share-pdf y abre la URL.
            Usa generateBlockHtml/generateInformeHtml que respetan la plantilla del doctor. */}
        {showGenerateReport &&
          selected &&
          (() => {
            const effective = getEffectiveBlocks(selected);
            const printable = effective.filter((b) => b.printable);
            console.log('[generar-informe] MODAL RENDERING', {
              effectiveCount: effective.length,
              printableCount: printable.length,
            });
            return (
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
                onClick={() => !generatingReport && setShowGenerateReport(false)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-teal-600" />
                      </div>
                      <h2 className="text-lg font-bold text-slate-900">Generar informe</h2>
                    </div>
                    <button
                      onClick={() => setShowGenerateReport(false)}
                      disabled={generatingReport}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">
                    Selecciona los bloques que quieres incluir en el PDF.
                  </p>
                  {/* FIX 2026-04-29: link clickeable post-generación (Safari friendly). */}
                  {generatedReportUrl && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Informe generado
                      </p>
                      <a
                        href={generatedReportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 underline hover:text-emerald-800"
                      >
                        Abrir PDF en nueva pestaña <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() =>
                          navigator.clipboard?.writeText(generatedReportUrl).catch(() => {})
                        }
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 ml-3"
                      >
                        Copiar enlace
                      </button>
                    </div>
                  )}
                  <div className="space-y-2 border border-slate-100 rounded-xl p-3">
                    {printable.length === 0 && (
                      <p className="text-xs text-slate-400 italic">
                        No hay bloques compartibles en esta consulta.
                      </p>
                    )}
                    {printable.map((b) => (
                      <label key={b.key} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reportSelectedKeys.has(b.key)}
                          onChange={(e) => {
                            setReportSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(b.key);
                              else next.delete(b.key);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-slate-300 accent-teal-500"
                        />
                        <span className="text-sm text-slate-700">{b.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowGenerateReport(false)}
                      disabled={generatingReport}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (reportSelectedKeys.size === 0) {
                          showToast({ type: 'error', message: 'Selecciona al menos un bloque' });
                          return;
                        }
                        setGeneratingReport(true);
                        setGeneratedReportUrl(null);
                        try {
                          const dateStr = new Date(selected.consultation_date).toLocaleDateString(
                            'es-VE',
                            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
                          );
                          let body = '';
                          const debugBlocks: { key: string; label: string; hasContent: boolean }[] =
                            [];
                          // FIX 2026-04-29: si el doctor seleccionó un bloque que está
                          // vacío, igual lo incluimos con placeholder "Sin información
                          // registrada". Antes los bloques vacíos se silenciaban con
                          // `continue` y el doctor solo veía los bloques con contenido,
                          // pensando que había un bug.
                          for (const b of printable) {
                            if (!reportSelectedKeys.has(b.key)) continue;
                            const piece =
                              b.key === 'informe' || b.key === 'notes'
                                ? generateInformeHtml()
                                : generateBlockHtml(b.key, b.label);
                            debugBlocks.push({ key: b.key, label: b.label, hasContent: !!piece });
                            if (piece) {
                              body += piece;
                            } else {
                              body += `<div class="section"><div class="section-title">${b.label}</div><div class="section-content"><em style="color:#94a3b8">Sin información registrada en este bloque.</em></div></div>`;
                            }
                          }
                          // FIX 2026-04-29: si NINGÚN bloque tiene contenido, aún así
                          // generamos un PDF con un placeholder explicando — antes el
                          // doctor recibía solo un alert y no entendía qué pasaba.
                          if (!body) {
                            const lista = debugBlocks.map((d) => `• ${d.label}: vacío`).join('\n');
                            body = `<div class="section"><div class="section-title">Sin contenido</div><div class="section-content">No hay información registrada en los bloques seleccionados de esta consulta.<br><br>${lista.replace(/\n/g, '<br>')}</div></div>`;
                            console.warn(
                              '[generate-report] generando PDF de placeholder; bloques sin contenido:',
                              debugBlocks,
                            );
                          }
                          const html = buildPdfHtml(
                            'informe',
                            'Informe Médico',
                            body,
                            selected.patient_name,
                            selected.consultation_code,
                            dateStr,
                          );
                          const res = await fetch('/api/doctor/share-pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              htmlContent: html,
                              fileName: `informe-${selected.consultation_code || selected.id}`,
                              consultationCode: selected.consultation_code,
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok || !data.url) {
                            reportError(
                              'doctor/consultations',
                              'generateReport2:response',
                              new Error(`HTTP ${res.status}`),
                              { status: res.status },
                            );
                            showToast({
                              type: 'error',
                              message:
                                data.error || `Error generando el PDF (status ${res.status})`,
                            });
                            return;
                          }
                          // FIX 2026-04-29: en lugar de window.open (bloqueado por Safari
                          // post-await), mostramos un link clickeable dentro del modal.
                          setGeneratedReportUrl(data.url);
                        } catch (err: unknown) {
                          reportError('doctor/consultations', 'generateReport2', err);
                          showToast({
                            type: 'error',
                            message: `Error generando el informe: ${err instanceof Error ? err.message : 'desconocido'}`,
                          });
                        } finally {
                          setGeneratingReport(false);
                        }
                      }}
                      disabled={generatingReport || reportSelectedKeys.size === 0}
                      className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {generatingReport ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Printer className="w-4 h-4" />
                      )}
                      {generatingReport ? 'Generando...' : 'Generar PDF'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* === Modal de aprobación de pago (con monto base + extras) === */}
        {selected && (
          <ApprovePaymentModal
            open={showApprovePaymentModal}
            consultationId={selected.id}
            baseAmount={selected.base_amount ?? selected.amount ?? 0}
            existingExtras={selected.extra_items ?? []}
            paymentMethod={pagoMethod || undefined}
            onClose={() => setShowApprovePaymentModal(false)}
            onApproved={handlePaymentApproved}
          />
        )}

        {/* === Modal de método de pago obligatorio (lista view) === */}
        {selected && (
          <PaymentMethodModal
            open={showPaymentMethodModal}
            consultationId={selected.id}
            availablePaymentMethods={doctorPaymentMethods}
            onClose={() => {
              setShowPaymentMethodModal(false);
              setPendingApprovalAfterMethod(false);
            }}
            onPersist={async (id, method, reference, receiptPath) => {
              const res = await updateConsultationPaymentDetails(id, {
                payment_method: method,
                payment_reference: reference,
                payment_receipt_url: receiptPath,
              });
              return res.success
                ? { success: true as const }
                : { success: false as const, error: (res as { error?: string }).error };
            }}
            onConfirmed={(method, reference, receiptPath) => {
              setPagoMethod(method);
              if (reference) setPagoReference(reference);
              if (receiptPath) setPagoReceiptPath(receiptPath);
              if (pendingApprovalAfterMethod && selected) {
                setPendingApprovalAfterMethod(false);
                updatePagoStatus(selected.id, 'approved', selected.appointment_id);
              } else {
                setPendingApprovalAfterMethod(false);
              }
            }}
          />
        )}

        {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
        {confirmDeleteConsulta && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Eliminar consulta</h2>
              </div>
              <p className="text-sm text-slate-600">
                ¿Estás seguro de eliminar la consulta de{' '}
                <span className="font-bold">{confirmDeleteConsulta.patient_name}</span> (
                {confirmDeleteConsulta.consultation_code})?
              </p>
              <p className="text-xs text-slate-400">
                Se eliminará la consulta, cita vinculada en agenda, historial clínico, recetas,
                registros financieros y el evento de Google Calendar asociado.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setConfirmDeleteConsulta(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => deleteConsultationCascade(confirmDeleteConsulta)}
                  disabled={deletingConsulta}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingConsulta ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {deletingConsulta ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const initializedRef = useRef(false);

  // Set initial content when value changes externally (e.g., opening a consultation)
  useEffect(() => {
    if (editorRef.current && !isActive) {
      // Only update if the editor content differs from the prop value
      const currentHTML = editorRef.current.innerHTML;
      const isEmpty =
        !currentHTML ||
        currentHTML === '<br>' ||
        currentHTML.startsWith('<span class="text-slate-400">');
      if (value && (isEmpty || !initializedRef.current)) {
        editorRef.current.innerHTML = value;
        initializedRef.current = true;
      } else if (!value && !isActive) {
        editorRef.current.innerHTML = '';
        initializedRef.current = false;
      }
    }
  }, [value, isActive]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-slate-50 flex-wrap">
        <button
          type="button"
          onClick={() => execCommand('bold')}
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center font-bold text-sm transition-colors"
          title="Negrita (Ctrl+B)"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => execCommand('italic')}
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center italic text-sm transition-colors"
          title="Cursiva (Ctrl+I)"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => execCommand('underline')}
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center underline text-sm transition-colors"
          title="Subrayado (Ctrl+U)"
        >
          U
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button
          type="button"
          onClick={() => execCommand('insertUnorderedList')}
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-sm transition-colors"
          title="Lista de puntos"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => execCommand('insertOrderedList')}
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-sm transition-colors"
          title="Lista numerada"
        >
          1.
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <label
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          title="Color de texto"
        >
          <span className="text-sm font-semibold text-slate-600">A</span>
          <input
            type="color"
            className="w-0 h-0 opacity-0"
            onChange={(e) => execCommand('foreColor', e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => execCommand('removeFormat')}
          className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-xs text-slate-400 transition-colors"
          title="Limpiar formato"
        >
          ✕
        </button>
      </div>
      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        className="min-h-[300px] px-4 py-3 text-sm text-slate-800 outline-none"
        style={{ touchAction: 'auto' }}
        onInput={() => {
          if (editorRef.current) onChange(editorRef.current.innerHTML);
        }}
        onFocus={() => setIsActive(true)}
        onBlur={() => setIsActive(false)}
        suppressContentEditableWarning={true}
        data-placeholder={placeholder}
      />
      <style>{`[data-placeholder]:empty:not(:focus):before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }`}</style>
    </div>
  );
}

const fi =
  'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors';
