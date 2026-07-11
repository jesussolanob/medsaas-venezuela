'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getProfessionalTitle } from '@/lib/professional-title';
import {
  User,
  Users2,
  Shield,
  Plus,
  X,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Save as SaveIcon,
  Camera,
  Loader2,
  Building,
  Trash2,
  Search,
  Tag,
  DollarSign,
  Bell,
  Volume2,
  VolumeX,
  Image as ImageIcon,
  FileBadge,
  Smartphone,
  CreditCard,
  Lock,
} from 'lucide-react';
import {
  loadSettingsProfile,
  saveSettingsProfile,
  savePaymentSettings,
  saveAvatarUrl,
  saveLogoUrl,
  saveSignatureUrl,
  saveLicenseNumber,
  loadGoogleStatus,
  disconnectGoogle,
  type GoogleStatusView,
} from './actions';
import { VENEZUELA_INSURANCES } from './insurances';
import AvatarUploader from './avatar-uploader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import SubscriptionPanel from '@/components/doctor/SubscriptionPanel';
import BookingQrCode from '@/components/doctor/BookingQrCode';
import { reportError } from '@/lib/report-error';
import { showToast } from '@/components/ui/Toaster';
import PhoneInput from '@/components/shared/PhoneInput';

type PricingPlan = {
  id: string;
  name: string;
  price_usd: number;
  duration_minutes: number;
  sessions_count: number;
  is_active: boolean;
};
type Module = { id: string; label: string; description: string; enabled: boolean };
type Assistant = {
  id: string;
  name: string;
  email: string;
  modules: Record<string, boolean>;
  created_at: string;
};
type Insurance = { id?: string; name: string; credit_days: number; notes: string };
type Service = {
  id: string;
  name: string;
  price_usd: number;
  description: string;
  is_active: boolean;
};
type PaymentMethodData = {
  id: string;
  label: string;
  emoji: string;
  fields: { key: string; label: string; placeholder?: string; type?: string }[];
};

const ESPECIALIDADES = [
  'Medicina General',
  'Cardiología',
  'Dermatología',
  'Endocrinología',
  'Gastroenterología',
  'Ginecología',
  'Hematología',
  'Infectología',
  'Medicina Interna',
  'Nefrología',
  'Neumología',
  'Neurología',
  'Odontología',
  'Oftalmología',
  'Oncología',
  'Ortopedia y Traumatología',
  'Otorrinolaringología',
  'Pediatría',
  'Psicología',
  'Psiquiatría',
  'Reumatología',
  'Fisioterapia',
  'Urología',
  'Cirugía General',
  'Cirugía Plástica',
  'Medicina de Emergencia',
  'Radiología',
  'Nutrición',
  'Otra',
];

const PROFESSIONAL_TITLES = [
  { value: 'Dr.', label: 'Doctor (Dr.)', gender: 'M' },
  { value: 'Dra.', label: 'Doctora (Dra.)', gender: 'F' },
  { value: 'Lic.', label: 'Licenciado/a (Lic.)', gender: 'N' },
  { value: 'Psic.', label: 'Psicólogo/a (Psic.)', gender: 'N' },
  { value: 'Odont.', label: 'Odontólogo/a (Odont.)', gender: 'N' },
  { value: 'Nutr.', label: 'Nutricionista (Nutr.)', gender: 'N' },
  { value: 'Fisio.', label: 'Fisioterapeuta (Fisio.)', gender: 'N' },
];

const ALL_MODULES: Module[] = [
  { id: 'patients', label: 'Pacientes', description: 'Ver y gestionar pacientes', enabled: true },
  { id: 'agenda', label: 'Agenda', description: 'Ver y editar citas', enabled: true },
  {
    id: 'ehr',
    label: 'Historial Clínico',
    description: 'Ver expedientes y consultas',
    enabled: true,
  },
  { id: 'crm', label: 'CRM Leads', description: 'Ver leads de WhatsApp', enabled: true },
  { id: 'reminders', label: 'Recordatorios', description: 'Enviar notificaciones', enabled: true },
  {
    id: 'finances_income',
    label: 'Finanzas — Ingresos',
    description: 'Ver ingresos del consultorio',
    enabled: false,
  },
  {
    id: 'finances_expenses',
    label: 'Finanzas — Gastos',
    description: 'Registrar gastos del consultorio',
    enabled: true,
  },
  {
    id: 'invitations',
    label: 'Invitaciones',
    description: 'Enviar links de booking',
    enabled: true,
  },
  {
    id: 'billing',
    label: 'Facturación',
    description: 'Emitir recibos y presupuestos',
    enabled: true,
  },
];

/**
 * Formatea un número de cuenta bancaria venezolano: 20 dígitos agrupados como
 * xxxx-xxxx-xxxx-xxxx-xxxx. Descarta no-dígitos y recorta a 20.
 */
function formatBankAccount(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 20);
  return digits.replace(/(.{4})(?=.)/g, '$1-');
}

const PAYMENT_METHODS: PaymentMethodData[] = [
  {
    id: 'pago_movil',
    label: 'Pago Móvil',
    emoji: '📱',
    fields: [
      { key: 'bank', label: 'Banco', placeholder: 'Ej: Banesco' },
      { key: 'phone', label: 'Teléfono', placeholder: '0412-1234567' },
      { key: 'id_number', label: 'Cédula/RIF', placeholder: 'V-12345678' },
      { key: 'holder', label: 'Titular', placeholder: 'Dr. Carlos Ramírez' },
    ],
  },
  {
    id: 'transferencia',
    label: 'Transferencia',
    emoji: '🏦',
    fields: [
      { key: 'bank', label: 'Banco', placeholder: 'Ej: Banco de Venezuela' },
      { key: 'account', label: 'N° de cuenta', placeholder: '0102-xxxx-xx-xxxxxxxxxx' },
      { key: 'account_type', label: 'Tipo', placeholder: 'Corriente / Ahorro' },
      { key: 'id_number', label: 'Cédula/RIF', placeholder: 'V-12345678' },
      { key: 'holder', label: 'Titular', placeholder: 'Nombre del titular' },
    ],
  },
  {
    id: 'zelle',
    label: 'Zelle',
    emoji: '💳',
    fields: [
      { key: 'email', label: 'Email Zelle', placeholder: 'doctor@email.com', type: 'email' },
      { key: 'holder', label: 'Nombre del titular', placeholder: 'Carlos Ramirez' },
      { key: 'bank', label: 'Banco (opcional)', placeholder: 'Chase, Bank of America…' },
    ],
  },
  {
    id: 'binance',
    label: 'Binance Pay',
    emoji: '₿',
    fields: [
      { key: 'binance_id', label: 'Binance ID', placeholder: '123456789' },
      { key: 'email', label: 'Email', placeholder: 'doctor@email.com' },
    ],
  },
  { id: 'cash_usd', label: 'Efectivo USD', emoji: '💵', fields: [] },
  { id: 'cash_bs', label: 'Efectivo Bs', emoji: '💵', fields: [] },
  {
    id: 'pos',
    label: 'Punto de venta',
    emoji: '🛒',
    fields: [{ key: 'bank', label: 'Banco del POS', placeholder: 'Ej: Mercantil' }],
  },
];

const fi =
  'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors';

// AUDIT FIX 2026-04-28 (TS-4): incluir 'assistants' al union; el bloque de UI ya
// existe (línea 1049) pero el tab nunca se mostraba — TabId no lo permitía.
type TabId =
  | 'profile'
  | 'booking'
  | 'payment'
  | 'subscription'
  | 'notifications'
  | 'integrations'
  | 'assistants';

function SettingsPageInner() {
  const searchParams = useSearchParams();
  // 'notifications' tab is hidden (not functional in Etapa 1). Guard against
  // direct URL navigation (?tab=notifications) so the state never lands there.
  const rawTab = (searchParams.get('tab') as TabId) || 'profile';
  const initialTab: TabId = rawTab === 'notifications' ? 'profile' : rawTab;

  // OAuth callback feedback — shown when redirected back from Google
  const googleCallbackResult = searchParams.get('google'); // 'connected'
  const googleCallbackError = searchParams.get('google_error'); // error message

  // Profile
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    specialty: '',
    professional_title: 'Dr.',
    allows_online: true,
    birth_date: '' as string,
  });
  const [cedula, setCedula] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [licenseNumber, setLicenseNumber] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Signature upload
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // Plans
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: '',
    price_usd: '',
    duration_minutes: '30',
    sessions_count: '1',
  });
  const [planError, setPlanError] = useState('');
  const [plansSaving, setPlansSaving] = useState(false);

  // Payment
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<Record<string, Record<string, string>>>({});
  const [paymentSaved, setPaymentSaved] = useState(false);

  // Insurance
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [showNewInsurance, setShowNewInsurance] = useState(false);
  const [insuranceSearch, setInsuranceSearch] = useState('');
  const [newInsurance, setNewInsurance] = useState({ name: '', credit_days: 30, notes: '' });
  const [showInsDropdown, setShowInsDropdown] = useState(false);

  // Assistants
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [showNewAssistant, setShowNewAssistant] = useState(false);
  const [newAss, setNewAss] = useState({ name: '', email: '' });
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [assError, setAssError] = useState('');

  // Notifications
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotif, setBrowserNotif] = useState(false);

  // Share message template
  const [shareMessageTemplate, setShareMessageTemplate] = useState(
    'Hola {paciente}, te envío los documentos de tu consulta del {fecha}: {documentos}. Cualquier duda quedo a tu orden. {doctor}',
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Integrations
  const [whatsappToken, setWhatsappToken] = useState('');
  const [whatsappPhoneId, setWhatsappPhoneId] = useState('');
  const [integrationsLoading, setIntegrationsLoading] = useState(false);

  // Google Calendar integration
  const [googleStatus, setGoogleStatus] = useState<GoogleStatusView>({
    connected: false,
    googleEmail: null,
  });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');

  // Services
  const [services, setServices] = useState<Service[]>([]);
  const [showNewService, setShowNewService] = useState(false);
  const [newService, setNewService] = useState({ name: '', price_usd: '', description: '' });
  const [serviceError, setServiceError] = useState('');
  const [servicesSaving, setServicesSaving] = useState(false);

  // Booking link
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const publicLink = doctorId ? `${baseUrl}/book/${doctorId}` : '';

  // El booking (link público + QR) se habilita por plan. En Delta Free está
  // bloqueado: no se muestra el tab ni el link/QR. Default true para evitar
  // flash-of-locked mientras cargan las features.
  const [bookingEnabled, setBookingEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/doctor/features', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const features = json?.data?.features ?? json?.features ?? {};
        if (!cancelled) setBookingEnabled(features.booking === true);
      } catch {
        /* si falla, dejamos el default para no bloquear de más */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load all data
  useEffect(() => {
    async function load() {
      // Profile — fetched from NestJS backend. doctorId is resolved from dev-auth
      // in the server action; we still keep it in state for the booking link.
      const [profileData, googleStatusData] = await Promise.all([
        loadSettingsProfile(),
        loadGoogleStatus(),
      ]);

      if (profileData) {
        setDoctorId(profileData.id);
        setProfile({
          full_name: profileData.full_name,
          email: profileData.email,
          phone: profileData.phone,
          specialty: profileData.specialty,
          professional_title: profileData.professional_title,
          allows_online: profileData.allows_online,
          birth_date: profileData.birth_date ?? '',
        });
        setAvatarUrl(profileData.avatar_url);
        // Backend now returns logo_url, signature_url, license_number.
        setLogoUrl(profileData.logo_url ?? null);
        setSignatureUrl(profileData.signature_url ?? null);
        setLicenseNumber(profileData.license_number ?? '');
        setPaymentMethods(profileData.payment_methods);
        setPaymentDetails(profileData.payment_details);
        setCedula(profileData.cedula ?? null);
      }

      setGoogleStatus(googleStatusData);
      setLoading(false);
    }
    load();

    // notifications permission
    if ('Notification' in window) {
      setBrowserNotif(Notification.permission === 'granted');
    }
    const ls = localStorage.getItem('appt_sound_enabled');
    if (ls !== null) setSoundEnabled(ls === 'true');
  }, []);

  /* ---------------- PROFILE ---------------- */

  async function saveProfile() {
    // Persist fields supported by PUT /api/doctor/profile.
    const result = await saveSettingsProfile({
      full_name: profile.full_name,
      specialty: profile.specialty,
      professional_title: profile.professional_title,
      allows_online: profile.allows_online,
      phone: profile.phone,
      birth_date: profile.birth_date || null,
    });

    if (!result.ok) {
      reportError('doctor/settings', 'saveProfile', new Error(String(result.error)));
      showToast({
        type: 'error',
        message: 'No se pudo guardar el perfil. ' + (result.error ?? ''),
      });
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    showToast({ type: 'success', message: 'Perfil guardado exitosamente.' });
  }

  /* ---------------- LOGO ---------------- */

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'logo');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error?.message ?? 'Error al subir logo');
      }
      const uploadedUrl: string = json.data.url;
      // Persist logo_url to the backend profile.
      const saved = await saveLogoUrl(uploadedUrl);
      if (!saved.ok) {
        throw new Error(saved.error ?? 'Error al guardar logo en el perfil');
      }
      // Do NOT append ?t= — it breaks GCS signed URLs (double-? invalidates the signature).
      // Each upload already produces a unique GCS path (timestamp in path), so no cache issue.
      setLogoUrl(uploadedUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setLogoError('No se pudo subir el logo. ' + msg);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function uploadSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSignature(true);
    setSignatureError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'signature');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error?.message ?? 'Error al subir firma');
      }
      const uploadedUrl: string = json.data.url;
      // Persist signature_url to the backend profile.
      const saved = await saveSignatureUrl(uploadedUrl);
      if (!saved.ok) {
        throw new Error(saved.error ?? 'Error al guardar firma en el perfil');
      }
      // Do NOT append ?t= — it breaks GCS signed URLs. Path already unique per upload.
      setSignatureUrl(uploadedUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setSignatureError('No se pudo subir la firma. ' + msg);
    } finally {
      setUploadingSignature(false);
    }
  }

  // AUDIT FIX 2026-04-28 (C-10): branded ConfirmDialog en lugar de confirm() nativo.
  const [confirmRemoveSignature, setConfirmRemoveSignature] = useState(false);
  function removeSignature() {
    if (!doctorId) return;
    setConfirmRemoveSignature(true);
  }
  async function performRemoveSignature() {
    const result = await saveSignatureUrl(null);
    if (!result.ok) {
      // Surface the error inline instead of swallowing it.
      setSignatureError(result.error ?? 'Error al eliminar la firma');
    } else {
      setSignatureUrl(null);
    }
    setConfirmRemoveSignature(false);
  }

  async function saveLicense() {
    const result = await saveLicenseNumber(licenseNumber || null);
    if (!result.ok) {
      reportError('doctor/settings', 'saveLicense', new Error(String(result.error)));
      showToast({ type: 'error', message: 'No se pudo guardar la matrícula.' });
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    showToast({ type: 'success', message: 'Matrícula guardada.' });
  }

  /* ---------------- PLANS (tab removed — now at /doctor/services) ---------------- */
  // These functions are dead code: the plans tab was removed from the UI.
  // Stubs kept to avoid TypeScript "declared but never used" warnings on the state
  // variables that the removed JSX would have used. No Supabase calls here.

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    // PENDING: moved to /doctor/services — use POST /api/doctor/services
  }

  async function togglePlan(id: string) {
    // PENDING: moved to /doctor/services — use PUT /api/doctor/services/:id
    void id;
  }

  async function deletePlan(id: string) {
    // PENDING: moved to /doctor/services — use DELETE /api/doctor/services/:id
    void id;
  }

  /* ---------------- PAYMENT METHODS ---------------- */

  function togglePaymentMethod(id: string) {
    setPaymentMethods((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function updatePaymentField(methodId: string, field: string, value: string) {
    setPaymentDetails((prev) => ({
      ...prev,
      [methodId]: { ...(prev[methodId] ?? {}), [field]: value },
    }));
  }

  async function savePaymentMethods() {
    // Validación: si Transferencia está activa y tiene N° de cuenta, debe ser 20 dígitos.
    if (paymentMethods.includes('transferencia')) {
      const acc = (paymentDetails['transferencia']?.account ?? '').replace(/\D/g, '');
      if (acc.length > 0 && acc.length !== 20) {
        showToast({
          type: 'error',
          message: `El N° de cuenta de transferencia debe tener 20 dígitos (van ${acc.length}).`,
        });
        return;
      }
    }
    // Replaces: supabase.from('profiles').update({ payment_methods, payment_details })
    const result = await savePaymentSettings({
      payment_methods: paymentMethods,
      payment_details: paymentDetails,
    });

    if (!result.ok) {
      showToast({
        type: 'error',
        message: 'No se pudo guardar los métodos de pago. ' + (result.error ?? ''),
      });
      return;
    }

    setPaymentSaved(true);
    setTimeout(() => setPaymentSaved(false), 2500);
  }

  /* ---------------- INSURANCE ---------------- */

  const insFiltered =
    insuranceSearch.trim().length > 0
      ? VENEZUELA_INSURANCES.filter((n) => n.toLowerCase().includes(insuranceSearch.toLowerCase()))
      : VENEZUELA_INSURANCES;

  async function addInsurance(e: React.FormEvent) {
    e.preventDefault();
    // doctor_insurances eliminada en reingeniería 2026-04-22.
    // Mantengo state local solo en memoria (no persiste).
    if (!newInsurance.name.trim()) return;
    setInsurances((prev) => [...prev, { ...newInsurance }]);
    setNewInsurance({ name: '', credit_days: 30, notes: '' });
    setShowNewInsurance(false);
    setInsuranceSearch('');
    setShowInsDropdown(false);
  }

  async function removeInsurance(idx: number) {
    setInsurances((prev) => prev.filter((_, i) => i !== idx));
    // Sin persistencia: doctor_insurances eliminada.
  }

  function selectInsuranceFromList(name: string) {
    setNewInsurance((p) => ({ ...p, name }));
    setInsuranceSearch(name);
    setShowInsDropdown(false);
  }

  /* ---------------- ASSISTANTS ---------------- */

  function createAssistant(e: React.FormEvent) {
    e.preventDefault();
    if (!newAss.name.trim() || !newAss.email.trim()) {
      setAssError('Nombre y email son obligatorios');
      return;
    }
    const defaultModules: Record<string, boolean> = {};
    ALL_MODULES.forEach((m) => {
      defaultModules[m.id] = m.enabled;
    });
    const assistant: Assistant = {
      id: Date.now().toString(),
      name: newAss.name,
      email: newAss.email,
      modules: defaultModules,
      created_at: new Date().toISOString(),
    };
    setAssistants((prev) => [...prev, assistant]);
    setNewAss({ name: '', email: '' });
    setShowNewAssistant(false);
    setAssError('');
  }

  function toggleAssistantModule(assId: string, moduleId: string) {
    setAssistants((prev) =>
      prev.map((a) =>
        a.id === assId ? { ...a, modules: { ...a.modules, [moduleId]: !a.modules[moduleId] } } : a,
      ),
    );
    if (selectedAssistant?.id === assId)
      setSelectedAssistant((prev) =>
        prev
          ? { ...prev, modules: { ...prev.modules, [moduleId]: !prev.modules[moduleId] } }
          : null,
      );
  }

  /* ---------------- NOTIFICATIONS ---------------- */

  function toggleSound() {
    // sound_notifications is a local-only preference — no backend endpoint in Etapa 1.
    // Persisted in localStorage so it survives page reloads. If a backend column is
    // added in a future phase, wire this to PUT /api/doctor/profile { sound_notifications }.
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('appt_sound_enabled', String(next));
  }

  async function requestBrowserNotif() {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setBrowserNotif(perm === 'granted');
  }

  /* ---------------- SERVICES (tab removed for MVP — moved to /doctor/services) ---------------- */
  // Dead code: services tab is hidden in the current UI (MVP deferred).
  // No Supabase calls. When reactivated, wire to POST/PUT/DELETE /api/doctor/services.

  async function saveService(e: React.FormEvent) {
    e.preventDefault();
    // PENDING: use POST /api/doctor/services
  }

  async function toggleService(id: string) {
    // PENDING: use PUT /api/doctor/services/:id { is_active: !current }
    void id;
  }

  async function deleteService(id: string) {
    // PENDING: use DELETE /api/doctor/services/:id
    void id;
  }

  /* ---------------- GOOGLE CALENDAR ---------------- */

  async function handleDisconnectGoogle() {
    setGoogleLoading(true);
    setGoogleError('');
    const result = await disconnectGoogle();
    if (!result.ok) {
      setGoogleError(result.error ?? 'Error al desconectar Google');
    } else {
      setGoogleStatus({ connected: false, googleEmail: null });
    }
    setGoogleLoading(false);
  }

  /* ---------------- INTEGRATIONS ---------------- */

  async function saveIntegrations() {
    // FASE 6 STUB — no backend endpoint for whatsapp_token / whatsapp_phone_id yet.
    // When the WhatsApp integration endpoint is available, replace this with:
    //   await backendPut('/api/doctor/integrations/whatsapp', { whatsapp_token, whatsapp_phone_id })
    // The Supabase write has been removed. Credentials are kept in component state only
    // (they are NOT persisted until the FASE 6 endpoint is implemented).
    setIntegrationsLoading(true);
    // Simulate async so the UI spinner shows consistently.
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    setIntegrationsLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'profile', label: 'Mi perfil', icon: User },
    { id: 'subscription', label: 'Suscripción', icon: CreditCard },
    // "Link público" (booking) solo si el plan habilita la feature `booking`.
    ...(bookingEnabled ? [{ id: 'booking' as TabId, label: 'Link público', icon: Link2 }] : []),
    { id: 'payment', label: 'Métodos de pago', icon: DollarSign },
    // HIDDEN: Notificaciones — panel no funcional en Etapa 1 (sin backend de notificaciones).
    // Descomentar cuando se implemente el módulo de notificaciones push/email.
    // { id: 'notifications', label: 'Notificaciones', icon: Bell },
    { id: 'integrations', label: 'Integraciones', icon: ExternalLink },
  ];

  return (
    <>
      <style>{`* { font-family: 'Inter', sans-serif; } .g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <ConfirmDialog
        open={confirmRemoveSignature}
        title="Borrar firma"
        message="¿Borrar la firma actual? Tendrás que subir una nueva para los próximos documentos."
        confirmLabel="Borrar"
        variant="danger"
        onConfirm={performRemoveSignature}
        onCancel={() => setConfirmRemoveSignature(false)}
      />

      <div className="max-w-4xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500">Perfil, métodos de pago, notificaciones y más</p>
        </div>

        {/* Shortcuts a secciones avanzadas — Bloques de consulta movidos a /doctor/templates */}
        <div className="grid grid-cols-1 gap-3">
          <a
            href="/doctor/settings/exchange-rate"
            className="block p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">Tasa de cambio</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  USD BCV, EUR BCV o tasa personalizada para conversiones a Bs.
                </p>
              </div>
            </div>
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* ---------------- PROFILE ---------------- */}
        {tab === 'profile' && (
          <div className="space-y-4">
            {/* Foto de perfil con crop */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-1">Foto de perfil</p>
              <p className="text-xs text-slate-500 mb-4">
                Esta foto aparece en tu página pública y en el portal. Puedes recortarla y hacer
                zoom.
              </p>
              <AvatarUploader
                doctorId={doctorId}
                currentUrl={avatarUrl}
                onUploaded={async (url) => {
                  setAvatarUrl(url);
                  // Persist the uploaded URL to the backend profile.
                  await saveAvatarUrl(url);
                }}
              />
            </div>

            {/* Logo del consultorio */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-1">Logo del consultorio</p>
              <p className="text-xs text-slate-500 mb-4">
                Aparece en facturas, presupuestos, informes médicos y recetas.
              </p>
              <div className="flex items-center gap-5">
                <div className="w-24 h-24 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <FileBadge className="w-7 h-7 text-slate-300" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={uploadLogo}
                    className="hidden"
                  />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    {uploadingLogo ? 'Subiendo…' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  <p className="text-[10px] text-slate-400">JPG, PNG o WEBP · Máx. 2MB</p>
                </div>
              </div>
              {logoError && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {logoError}
                </p>
              )}
            </div>

            {/* === FIRMA DEL MÉDICO + MATRÍCULA — aparece en TODOS los PDFs === */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                  <FileBadge className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Firma y matrícula</p>
                  <p className="text-xs text-slate-400">
                    Aparecerán automáticamente en todos los PDFs (informes, recetas, prescripciones,
                    reposo)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Firma */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Firma escaneada
                  </label>
                  <div className="flex items-end gap-3">
                    <div className="w-32 h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                      {signatureUrl ? (
                        <img
                          src={signatureUrl}
                          alt="Firma"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 text-center px-2">
                          Sin firma
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 flex-1">
                      <input
                        ref={signatureInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={uploadSignature}
                        className="hidden"
                      />
                      <button
                        onClick={() => signatureInputRef.current?.click()}
                        disabled={uploadingSignature}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        {uploadingSignature
                          ? 'Subiendo…'
                          : signatureUrl
                            ? 'Cambiar'
                            : 'Subir firma'}
                      </button>
                      {signatureUrl && (
                        <button
                          onClick={removeSignature}
                          className="w-full text-[10px] text-red-500 hover:text-red-700"
                        >
                          Borrar firma
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    PNG con fondo transparente · ideal: 400×120px
                  </p>
                  {signatureError && <p className="mt-2 text-xs text-red-600">{signatureError}</p>}
                </div>

                {/* Matrícula / Licencia */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Matrícula / Licencia
                  </label>
                  <input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    onBlur={saveLicense}
                    placeholder="Ej: MPPS-12345 / CMC-67890"
                    className={fi}
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Aparecerá debajo de tu nombre en la firma de los PDFs
                  </p>
                </div>
              </div>
            </div>

            {/* Datos del perfil */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{profile.full_name || 'Tu perfil'}</p>
                  <p className="text-xs text-slate-400">{profile.email}</p>
                </div>
              </div>
              {loading ? (
                <div className="text-slate-400 text-sm py-4">Cargando…</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Título profesional
                      </label>
                      <select
                        value={profile.professional_title}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, professional_title: e.target.value }))
                        }
                        className={fi}
                      >
                        {PROFESSIONAL_TITLES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Nombre completo
                      </label>
                      <input
                        value={profile.full_name}
                        onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                        className={fi}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Email
                      </label>
                      <input
                        value={profile.email}
                        disabled
                        className={fi + ' opacity-50 cursor-not-allowed'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Teléfono
                      </label>
                      <PhoneInput
                        value={profile.phone}
                        onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
                      />
                    </div>
                  </div>

                  {/* Cédula (read-only) + Fecha de nacimiento (editable) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Cédula / Identificación
                      </label>
                      <div className="relative">
                        <input
                          value={cedula ?? '—'}
                          disabled
                          className={fi + ' bg-slate-100 text-slate-500 cursor-not-allowed pr-9'}
                        />
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        No editable — registrada al crear la cuenta
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Fecha de nacimiento
                      </label>
                      <input
                        type="date"
                        value={profile.birth_date}
                        onChange={(e) => setProfile((p) => ({ ...p, birth_date: e.target.value }))}
                        className={fi}
                      />
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Se guarda al presionar &ldquo;Guardar cambios&rdquo;
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Especialidad
                    </label>
                    <select
                      value={profile.specialty}
                      onChange={(e) => setProfile((p) => ({ ...p, specialty: e.target.value }))}
                      className={fi}
                    >
                      <option value="">Seleccionar especialidad…</option>
                      {ESPECIALIDADES.map((esp) => (
                        <option key={esp} value={esp}>
                          {esp}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Online consultations toggle */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Consultas online</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Permitir que pacientes agenden videoconsultas
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setProfile((p) => ({ ...p, allows_online: !p.allows_online }))
                        }
                        className="flex items-center gap-2"
                      >
                        {profile.allows_online ? (
                          <ToggleRight className="w-8 h-8 text-teal-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={saveProfile}
                    className="flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90"
                  >
                    {saved ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Guardado
                      </>
                    ) : (
                      <>
                        <SaveIcon className="w-4 h-4" />
                        Guardar cambios
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Plans tab removed — now in /doctor/services */}

        {/* ---------------- SUSCRIPCIÓN ---------------- */}
        {tab === 'subscription' && <SubscriptionPanel embedded />}

        {/* ---------------- BOOKING ---------------- */}
        {tab === 'booking' && bookingEnabled && (
          <div className="space-y-4">
            <div className="g-bg rounded-xl p-6 text-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Link2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg">Tu link público de booking</p>
                  <p className="text-sm text-white/70 mt-0.5">
                    Compártelo en redes, tarjetas de presentación o por WhatsApp. Nunca vence.
                  </p>
                  <div className="mt-4 bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-mono flex-1 truncate text-white/90">
                      {publicLink || 'Cargando…'}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publicLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => window.open(publicLink, '_blank')}
                className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all flex items-center gap-3"
              >
                <ExternalLink className="w-5 h-5 text-teal-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">Ver mi página</p>
                  <p className="text-xs text-slate-400">Cómo la ve el paciente</p>
                </div>
              </button>
              <button
                onClick={() => {
                  const msg = encodeURIComponent(
                    `Puedes agendar tu consulta conmigo en:\n\n${publicLink}`,
                  );
                  window.open(`https://wa.me/?text=${msg}`, '_blank');
                }}
                className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-emerald-300 hover:shadow-sm transition-all flex items-center gap-3"
              >
                <span className="text-emerald-500 font-bold text-sm shrink-0">WA</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Compartir por WhatsApp</p>
                  <p className="text-xs text-slate-400">Enviar a cualquier contacto</p>
                </div>
              </button>
            </div>

            {/* QR Code */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-white"
                    aria-hidden="true"
                  >
                    <rect width="5" height="5" x="3" y="3" rx="1" />
                    <rect width="5" height="5" x="16" y="3" rx="1" />
                    <rect width="5" height="5" x="3" y="16" rx="1" />
                    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                    <path d="M21 21v.01" />
                    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                    <path d="M3 12h.01" />
                    <path d="M12 3h.01" />
                    <path d="M12 16v.01" />
                    <path d="M16 12h1" />
                    <path d="M21 12v.01" />
                    <path d="M12 21v-1" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-slate-900">Código QR de tu link</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Imprímelo en tu tarjeta de presentación, consultorio o receta para que los
                    pacientes agenden con solo escanearlo.
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <BookingQrCode url={publicLink} />
                <div className="flex flex-col gap-3 text-sm text-slate-600 max-w-xs">
                  <p className="font-semibold text-slate-800">¿Cómo usarlo?</p>
                  <ul className="space-y-2 text-xs text-slate-500 list-none">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        1
                      </span>
                      Descarga el QR como PNG con el botón de abajo del código.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        2
                      </span>
                      Insértalo en tu tarjeta de presentación, material impreso o consultorio.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        3
                      </span>
                      El paciente lo escanea con su cámara y llega directo a tu página de booking.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Share Message Template */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Mensaje de WhatsApp / Correo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Personaliza el mensaje que se envía al compartir documentos con tus pacientes
                  desde Consultas.
                </p>
              </div>
              <div>
                <textarea
                  value={shareMessageTemplate}
                  onChange={(e) => setShareMessageTemplate(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                  placeholder="Escribe tu mensaje personalizado..."
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1 self-center">
                  Variables:
                </span>
                {[
                  { tag: '{paciente}', desc: 'Nombre' },
                  { tag: '{fecha}', desc: 'Fecha consulta' },
                  { tag: '{documentos}', desc: 'Docs seleccionados' },
                  { tag: '{doctor}', desc: 'Tu nombre' },
                  { tag: '{codigo}', desc: 'Código consulta' },
                ].map((v) => (
                  <button
                    key={v.tag}
                    onClick={() => setShareMessageTemplate((prev) => prev + ' ' + v.tag)}
                    className="px-2 py-1 bg-teal-50 text-teal-700 rounded-md text-[11px] font-semibold hover:bg-teal-100 transition-colors"
                    title={v.desc}
                  >
                    {v.tag}
                  </button>
                ))}
                <div className="relative ml-1">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[11px] font-semibold hover:bg-amber-100 transition-colors border border-amber-200"
                    title="Agregar emoji"
                  >
                    😊 Emojis
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 w-[280px]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-700">Emojis</p>
                        <button
                          onClick={() => setShowEmojiPicker(false)}
                          className="text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-8 gap-1">
                        {[
                          '👋',
                          '😊',
                          '🙏',
                          '💪',
                          '❤️',
                          '✅',
                          '📋',
                          '💊',
                          '🏥',
                          '🩺',
                          '📅',
                          '⏰',
                          '📧',
                          '📱',
                          '👨‍⚕️',
                          '👩‍⚕️',
                          '🔬',
                          '💉',
                          '🌡️',
                          '😷',
                          '🤝',
                          '👍',
                          '⭐',
                          '🎯',
                          '📌',
                          '✨',
                          '🔔',
                          '💬',
                          '📝',
                          '🗓️',
                          '💰',
                          '🏃',
                        ].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setShareMessageTemplate((prev) => prev + emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="text-lg hover:bg-slate-100 rounded p-1 transition-colors flex items-center justify-center"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Vista previa
                </p>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">
                  {shareMessageTemplate
                    .replace('{paciente}', 'María García')
                    .replace('{fecha}', new Date().toLocaleDateString('es-VE'))
                    .replace('{documentos}', 'informe médico, receta')
                    .replace('{doctor}', profile.professional_title + ' ' + profile.full_name)
                    .replace('{codigo}', 'CON-001')}
                </p>
              </div>
              <button
                onClick={saveProfile}
                className="flex items-center gap-2 g-bg px-4 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" /> Guardar mensaje
              </button>
            </div>
          </div>
        )}

        {/* ---------------- PAYMENT METHODS ---------------- */}
        {tab === 'payment' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">
                Métodos de pago aceptados
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Configura los datos para recibir pagos. Los pacientes verán esta información al
                agendar o pagar.
              </p>

              <div className="space-y-3">
                {PAYMENT_METHODS.map((method) => {
                  const active = paymentMethods.includes(method.id);
                  return (
                    <div
                      key={method.id}
                      className={`border rounded-xl overflow-hidden transition-all ${active ? 'border-teal-300 bg-teal-50/30' : 'border-slate-200 bg-white'}`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePaymentMethod(method.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={active}
                          className="w-5 h-5 rounded border-slate-300 text-teal-500 pointer-events-none"
                        />
                        <span className="text-xl">{method.emoji}</span>
                        <span className="text-sm font-medium text-slate-700 flex-1">
                          {method.label}
                        </span>
                        {active && method.fields.length > 0 && (
                          <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">
                            Configurable
                          </span>
                        )}
                      </button>
                      {active && method.fields.length > 0 && (
                        <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {method.fields.map((f) => {
                            const isBankAccount =
                              method.id === 'transferencia' && f.key === 'account';
                            const rawVal = paymentDetails[method.id]?.[f.key] ?? '';
                            const accountDigits = isBankAccount ? rawVal.replace(/\D/g, '') : '';
                            const accountError =
                              isBankAccount &&
                              accountDigits.length > 0 &&
                              accountDigits.length !== 20
                                ? `La cuenta debe tener 20 dígitos (van ${accountDigits.length})`
                                : null;
                            return (
                              <div key={f.key}>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  {f.label}
                                </label>
                                <input
                                  type={f.type ?? 'text'}
                                  inputMode={isBankAccount ? 'numeric' : undefined}
                                  value={rawVal}
                                  onChange={(e) =>
                                    updatePaymentField(
                                      method.id,
                                      f.key,
                                      isBankAccount
                                        ? formatBankAccount(e.target.value)
                                        : e.target.value,
                                    )
                                  }
                                  placeholder={
                                    isBankAccount ? '0000-0000-0000-0000-0000' : f.placeholder
                                  }
                                  className={
                                    accountError
                                      ? fi.replace('border-slate-200', 'border-red-300')
                                      : fi
                                  }
                                />
                                {accountError && (
                                  <p className="text-[11px] text-red-600 mt-1">{accountError}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={savePaymentMethods}
                className="mt-6 flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90"
              >
                {paymentSaved ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Guardado
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" />
                    Guardar métodos y datos
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- SERVICES ---------------- */}
        {/* Services and Insurance tabs removed for MVP */}

        {/* ---------------- HIDDEN: INSURANCE (MVP deferred) ---------------- */}
        {false && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                    Seguros aceptados
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Busca de la lista de Venezuela o agrega uno personalizado
                  </p>
                </div>
                <button
                  onClick={() => setShowNewInsurance(true)}
                  className="g-bg flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar seguro
                </button>
              </div>

              {showNewInsurance && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                  <form onSubmit={addInsurance} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Buscar seguro
                      </label>
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          value={insuranceSearch}
                          onChange={(e) => {
                            setInsuranceSearch(e.target.value);
                            setNewInsurance((p) => ({ ...p, name: e.target.value }));
                            setShowInsDropdown(true);
                          }}
                          onFocus={() => setShowInsDropdown(true)}
                          onBlur={() => setTimeout(() => setShowInsDropdown(false), 150)}
                          placeholder="Escribe para buscar (ej: Mercantil, Mapfre, Seguros Caracas…)"
                          className={fi + ' pl-10'}
                        />
                        {showInsDropdown && insFiltered.length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                            {insFiltered.slice(0, 50).map((name) => (
                              <button
                                type="button"
                                key={name}
                                onClick={() => selectInsuranceFromList(name)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors"
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Lista completa de compañías de seguros de Venezuela — o escribe uno
                        personalizado
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Copago (USD, opcional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className={fi}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Días de crédito
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={newInsurance.credit_days}
                          onChange={(e) =>
                            setNewInsurance((p) => ({
                              ...p,
                              credit_days: parseInt(e.target.value) || 0,
                            }))
                          }
                          className={fi}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Notas (opcional)
                        </label>
                        <input
                          value={newInsurance.notes}
                          onChange={(e) =>
                            setNewInsurance((p) => ({ ...p, notes: e.target.value }))
                          }
                          placeholder="Autorización previa"
                          className={fi}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewInsurance(false);
                          setInsuranceSearch('');
                          setShowInsDropdown(false);
                        }}
                        className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="flex-1 g-bg py-2 rounded-lg text-xs font-bold text-white"
                      >
                        Agregar
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {insurances.length === 0 ? (
                <div className="py-12 text-center">
                  <Building className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Sin seguros configurados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {insurances.map((ins, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">{ins.name}</p>
                        <p className="text-xs text-slate-500 mt-1">Plazo: {ins.credit_days} días</p>
                        {ins.notes && (
                          <p className="text-xs text-slate-600 mt-1 italic">{ins.notes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeInsurance(idx)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- NOTIFICATIONS ---------------- */}
        {tab === 'notifications' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                Notificaciones del panel
              </p>

              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5 text-teal-500 shrink-0" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Sonido al recibir una cita
                    </p>
                    <p className="text-xs text-slate-500">
                      Reproduce un beep cuando se agenda una cita nueva
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleSound}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${soundEnabled ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                >
                  {soundEnabled ? (
                    <>
                      <ToggleRight className="w-4 h-4" />
                      Activo
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4" />
                      Inactivo
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Bell
                    className={`w-5 h-5 shrink-0 ${browserNotif ? 'text-teal-500' : 'text-slate-400'}`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Notificaciones del navegador
                    </p>
                    <p className="text-xs text-slate-500">
                      Recibe alertas del sistema cuando haya una cita nueva
                    </p>
                  </div>
                </div>
                {browserNotif ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full shrink-0">
                    Permitido
                  </span>
                ) : (
                  <button
                    onClick={requestBrowserNotif}
                    className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-500 text-white hover:opacity-90"
                  >
                    Permitir
                  </button>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Smartphone className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                  El panel revisa nuevas citas cada 30 segundos. Mantén esta pestaña abierta para
                  recibirlas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- ASSISTANTS ---------------- */}
        {tab === 'assistants' && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-sm text-teal-700">
                Los <strong>asistentes</strong> pueden acceder a tu panel con los módulos que
                configures.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowNewAssistant(true)}
                className="g-bg flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90"
              >
                <Plus className="w-4 h-4" /> Agregar asistente
              </button>
            </div>

            {showNewAssistant && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Nuevo asistente</p>
                  <button
                    onClick={() => setShowNewAssistant(false)}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                {assError && <p className="text-sm text-red-600">{assError}</p>}
                <form onSubmit={createAssistant} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Nombre
                      </label>
                      <input
                        value={newAss.name}
                        onChange={(e) => setNewAss((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Ana González"
                        className={fi}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                      <input
                        type="email"
                        value={newAss.email}
                        onChange={(e) => setNewAss((p) => ({ ...p, email: e.target.value }))}
                        placeholder="asistente@email.com"
                        className={fi}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewAssistant(false)}
                      className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 g-bg py-2 rounded-xl text-xs font-bold text-white"
                    >
                      Crear asistente
                    </button>
                  </div>
                </form>
              </div>
            )}

            {assistants.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                <Users2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-semibold text-sm">Sin asistentes aún</p>
              </div>
            ) : (
              assistants.map((ass) => (
                <div
                  key={ass.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                >
                  <div
                    className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                    onClick={() =>
                      setSelectedAssistant(selectedAssistant?.id === ass.id ? null : ass)
                    }
                  >
                    <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center">
                      <span className="text-violet-600 font-bold text-sm">
                        {ass.name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{ass.name}</p>
                      <p className="text-xs text-slate-400 truncate">{ass.email}</p>
                    </div>
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full shrink-0">
                      Asistente
                    </span>
                  </div>
                  {selectedAssistant?.id === ass.id && (
                    <div className="p-5 space-y-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                        Módulos activos
                      </p>
                      {ALL_MODULES.map((mod) => (
                        <div
                          key={mod.id}
                          className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{mod.label}</p>
                            <p className="text-xs text-slate-400">{mod.description}</p>
                          </div>
                          <button
                            onClick={() => toggleAssistantModule(ass.id, mod.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${ass.modules[mod.id] ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                          >
                            {ass.modules[mod.id] ? (
                              <>
                                <ToggleRight className="w-4 h-4" />
                                Activo
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-4 h-4" />
                                Inactivo
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ---------------- INTEGRATIONS ---------------- */}
        {tab === 'integrations' && (
          <div className="space-y-4">
            {/* OAuth callback feedback */}
            {googleCallbackResult === 'connected' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-sm text-emerald-700 font-semibold">
                  Google Calendar conectado exitosamente.
                </p>
              </div>
            )}
            {googleCallbackError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-red-500 shrink-0 mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm text-red-700 font-semibold">Error al conectar Google</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {decodeURIComponent(googleCallbackError)}
                  </p>
                </div>
              </div>
            )}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-sm text-teal-700">
                Conecta herramientas externas para sincronizar tu agenda y enviar mensajes
                automáticos.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-600 text-sm font-bold">GC</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Google Calendar</p>
                    <p className="text-xs text-slate-500">
                      Genera meet links y sincroniza citas automáticamente
                    </p>
                  </div>
                </div>
                {googleStatus.connected ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 shrink-0">
                    Conectado
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full shrink-0">
                    No conectado
                  </span>
                )}
              </div>

              {googleError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {googleError}
                </p>
              )}

              {/* Detect if Google credentials are configured (via public env var) */}
              {(() => {
                // NEXT_PUBLIC_GOOGLE_CLIENT_ID is safe to expose — it's a public OAuth client ID.
                // If undefined, the button is disabled with a friendly message (no broken auth flow).
                const googleConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

                if (!googleConfigured && !googleStatus.connected) {
                  return (
                    <button
                      disabled
                      className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50 text-slate-400 rounded-xl text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                      title="Las credenciales de Google aún no están configuradas en el servidor."
                    >
                      Configuración de Google pendiente
                    </button>
                  );
                }

                return googleStatus.connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-emerald-700">Cuenta conectada</p>
                        {googleStatus.googleEmail && (
                          <p className="text-xs text-emerald-600 truncate">
                            {googleStatus.googleEmail}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          window.location.href = '/api/integrations/google/auth';
                        }}
                        className="flex-1 px-4 py-2.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors"
                      >
                        Reconectar
                      </button>
                      <button
                        onClick={handleDisconnectGoogle}
                        disabled={googleLoading}
                        className="flex-1 px-4 py-2.5 border border-red-200 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {googleLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Desconectar'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-xs text-blue-700">
                        Al conectar Google, las citas online generarán un link de Google Meet
                        automáticamente y se agregarán a tu Google Calendar.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        window.location.href = '/api/integrations/google/auth';
                      }}
                      disabled={googleLoading}
                      className="w-full px-4 py-2.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      title="Conectar Google Calendar y Meet"
                    >
                      {googleLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Conectando…
                        </>
                      ) : (
                        'Conectar Google Calendar'
                      )}
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* HIDDEN: WhatsApp Business API — no implementada en Etapa 1. Descomentar
                cuando el endpoint /api/doctor/integrations/whatsapp esté disponible. */}
            {false && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <span className="text-emerald-600 text-sm font-bold">WA</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">WhatsApp Business API</p>
                      <p className="text-xs text-slate-500">Envía confirmaciones y recordatorios</p>
                    </div>
                  </div>
                  {whatsappToken ? (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                      Conectado
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                      No conectado
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Token de API de Meta
                    </label>
                    <input
                      type="password"
                      value={whatsappToken}
                      onChange={(e) => setWhatsappToken(e.target.value)}
                      placeholder="Obtén tu token en developers.facebook.com"
                      className={fi}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      ID del Número de Teléfono
                    </label>
                    <input
                      value={whatsappPhoneId}
                      onChange={(e) => setWhatsappPhoneId(e.target.value)}
                      placeholder="Ej: 123456789012345"
                      className={fi}
                    />
                  </div>
                </div>
                <button
                  onClick={saveIntegrations}
                  disabled={integrationsLoading}
                  className="w-full px-4 py-2.5 g-bg text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {integrationsLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                    </>
                  ) : (
                    <>
                      <SaveIcon className="w-4 h-4" /> Guardar credenciales
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function DoctorSettingsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-slate-400 text-sm">Cargando…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
