'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { getDoctorProfile } from '@/app/doctor/actions';
import {
  loadTemplateConfigs,
  saveTemplateConfig,
  applyTemplateConfigToAll,
  type UpsertTemplateInput,
} from './actions';
import {
  FileEdit,
  Save,
  Loader2,
  CheckCircle,
  FileText,
  Pill,
  ClipboardList,
  Bed,
  Eye,
  EyeOff,
  Type,
  Image as ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { reportError } from '@/lib/report-error';
import { showToast } from '@/components/ui/Toaster';

// El preview PDF se carga solo en cliente (react-pdf no soporta SSR).
const TemplatePdfPreview = dynamic(
  () =>
    import('@/components/pdf/TemplatePdfPreview').then((m) => ({ default: m.TemplatePdfPreview })),
  { ssr: false, loading: () => null },
);

// ── TIPOS DINÁMICOS ─────────────────────────────────────────────────────
// Ahora TemplateType es cualquier block_key que el doctor tenga activo.
// Las tabs de plantilla PDF se generan desde los mismos bloques que el doctor
// configuró en /doctor/settings/consultation-blocks. Así no hay desalineación
// entre las secciones del formulario de consulta y los PDFs generables.
type TemplateType = string;

type TemplateTab = { key: string; label: string; icon: LucideIcon; description: string };
/** TemplateTab with a transient sort_order used during tab construction (stripped before storing). */
type TemplateSortableTab = TemplateTab & { order: number };

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

const DEFAULT_CONFIG: TemplateConfig = {
  logo_url: null,
  signature_url: null,
  font_family: 'Inter',
  header_text: '',
  footer_text: '',
  show_logo: true,
  show_signature: true,
  primary_color: '#0891b2',
};

// Mapa de iconos por block_key canónico; fallback a FileText si no está mapeado
const ICON_MAP: Record<string, LucideIcon> = {
  prescription: Pill,
  recipe: Pill,
  nutrition_plan: FileText,
  exercises: FileText,
  tasks: ClipboardList,
  rest: Bed,
  reposo: Bed,
  requested_exams: ClipboardList,
  prescripciones: ClipboardList,
  diagnosis: FileText,
  treatment: FileText,
  indications: FileText,
  recommendations: FileText,
  chief_complaint: FileText,
  history: FileText,
  physical_exam: FileText,
  internal_notes: FileText,
  next_followup: FileText,
  informe: FileText,
};

// Fallback para doctores sin bloques configurados (retrocompat con datos viejos).
// Los 5 tipos estándar de documentos médicos usados en Venezuela.
const FALLBACK_TABS: TemplateTab[] = [
  {
    key: 'informe',
    label: 'Informe',
    icon: FileText,
    description: 'Informe médico completo con diagnóstico y tratamiento',
  },
  {
    key: 'recipe',
    label: 'Récipe',
    icon: Pill,
    description: 'Receta médica con medicamentos y dosis',
  },
  {
    key: 'indications',
    label: 'Indicaciones',
    icon: ClipboardList,
    description: 'Instrucciones y recomendaciones para el paciente',
  },
  {
    key: 'paraclinical',
    label: 'Paraclínicos',
    icon: ClipboardList,
    description: 'Órdenes de exámenes de laboratorio e imágenes diagnósticas',
  },
  {
    key: 'reposo',
    label: 'Reposo',
    icon: Bed,
    description: 'Constancia de reposo médico para el paciente',
  },
];

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (moderna)' },
  { value: 'Georgia', label: 'Georgia (clásica)' },
  { value: 'Times New Roman', label: 'Times New Roman (formal)' },
  { value: 'Arial', label: 'Arial (limpia)' },
  { value: 'Calibri', label: 'Calibri (profesional)' },
  { value: 'Palatino', label: 'Palatino (elegante)' },
];

const inp =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white';

export default function TemplatesPage() {
  // Tabs dinámicas según los bloques printables del doctor
  const [templateTabs, setTemplateTabs] = useState<TemplateTab[]>(FALLBACK_TABS);
  const [activeTab, setActiveTab] = useState<TemplateType>('informe');
  const [configs, setConfigs] = useState<Record<string, TemplateConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [doctorSpecialty, setDoctorSpecialty] = useState('');
  const [doctorLicense, setDoctorLicense] = useState<string | null>(null);
  // RONDA 17: source of truth = profile (logo y firma SOLO se cargan desde Settings/Perfil)
  const [profileLogoUrl, setProfileLogoUrl] = useState<string | null>(null);
  const [profileSignatureUrl, setProfileSignatureUrl] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const signatureRef = useRef<HTMLInputElement>(null);

  const config = configs[activeTab] || DEFAULT_CONFIG;

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    // ── 1) Cargar perfil del doctor (nombre, especialidad, logo, firma, matrícula — RONDA 17 source of truth)
    const profile = await getDoctorProfile();
    if (profile) {
      setDoctorName(profile.fullName || '');
      setDoctorSpecialty(profile.specialty || '');
      setDoctorLicense(profile.licenseNumber ?? null);
      setProfileLogoUrl(profile.logoUrl ?? null);
      setProfileSignatureUrl(profile.signatureUrl ?? null);
    }

    // ── 2) Cargar bloques del doctor vía API para resolver la cascada
    //     doctor_consultation_blocks → specialty_default_blocks → catalog
    let dynamicTabs: TemplateTab[] = FALLBACK_TABS;
    try {
      const r = await fetch('/api/doctor/consultation-blocks', { cache: 'no-store' });
      const j = await r.json();

      // The API returns loosely typed JSON; narrow inline with type guards below.
      type RawBlock = {
        key: string;
        default_label?: string;
        default_printable?: boolean;
        description?: string;
      };
      type RawDoctorCfg = {
        block_key: string;
        enabled?: boolean;
        printable?: boolean;
        custom_label?: string;
        sort_order?: number;
      };
      type RawSpecialtyDef = { block_key: string; enabled?: boolean; sort_order?: number };

      const catalog: RawBlock[] = Array.isArray(j.catalog) ? (j.catalog as RawBlock[]) : [];
      const doctorCfg: RawDoctorCfg[] = Array.isArray(j.doctor_config)
        ? (j.doctor_config as RawDoctorCfg[])
        : [];
      const specialtyDef: RawSpecialtyDef[] = Array.isArray(j.specialty_defaults)
        ? (j.specialty_defaults as RawSpecialtyDef[])
        : [];
      const doctorMap = new Map(doctorCfg.map((c) => [c.block_key, c]));
      const specialtyMap = new Map(specialtyDef.map((s) => [s.block_key, s]));

      // Un bloque aparece como tab de plantilla PDF si:
      //   - Está enabled (en doctor_config o specialty_default)
      //   - Es printable (default true según catalog o override doctor)
      //   - NO es un bloque de texto interno (internal_notes)
      const result: TemplateSortableTab[] = [];
      for (const cat of catalog) {
        const doctorEntry = doctorMap.get(cat.key);
        const specialtyEntry = specialtyMap.get(cat.key);
        const enabled = doctorEntry
          ? doctorEntry.enabled
          : specialtyEntry
            ? specialtyEntry.enabled
            : false;
        if (!enabled) continue;

        const printable = doctorEntry?.printable ?? cat.default_printable;
        if (printable === false) continue;
        if (cat.key === 'internal_notes') continue;

        const label = doctorEntry?.custom_label || cat.default_label || cat.key;
        const order = doctorEntry?.sort_order ?? specialtyEntry?.sort_order ?? 99;
        result.push({
          key: cat.key,
          label,
          icon: ICON_MAP[cat.key] ?? FileText,
          description: cat.description ?? `Plantilla PDF: ${label}`,
          order,
        });
      }
      // Si el doctor no tiene ningún bloque configurado, usamos FALLBACK
      if (result.length > 0) {
        result.sort((a, b) => a.order - b.order);
        dynamicTabs = result.map(({ key, label, icon, description }) => ({
          key,
          label,
          icon,
          description,
        }));
      }
    } catch (err) {
      console.warn('[Templates] no se pudieron cargar bloques, usando fallback:', err);
    }
    setTemplateTabs(dynamicTabs);

    // Si la tab activa no está en los tabs dinámicos, mover al primero
    if (!dynamicTabs.find((t) => t.key === activeTab)) {
      setActiveTab(dynamicTabs[0]?.key || 'informe');
    }

    // ── 3) Cargar plantillas guardadas desde el backend (NestJS doctor-templates)
    const savedMap = await loadTemplateConfigs();

    const initialConfigs: Record<string, TemplateConfig> = {};
    for (const t of dynamicTabs) {
      const saved = savedMap[t.key];
      initialConfigs[t.key] = saved
        ? {
            logo_url: saved.logo_url,
            signature_url: saved.signature_url,
            font_family: saved.font_family || 'Inter',
            header_text: saved.header_text || '',
            footer_text: saved.footer_text || '',
            show_logo: saved.show_logo !== false,
            show_signature: saved.show_signature !== false,
            primary_color: saved.primary_color || '#0891b2',
          }
        : { ...DEFAULT_CONFIG };
    }
    setConfigs(initialConfigs);

    setLoading(false);
  }

  function updateConfig(field: keyof TemplateConfig, value: TemplateConfig[typeof field]) {
    setConfigs((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
  }

  // NOTE: Per-template logo/signature upload removed in RONDA 17.
  // Assets are now sourced from the doctor profile (profileLogoUrl / profileSignatureUrl).
  // This function is retained as a stub to avoid breaking the logoRef/signatureRef refs
  // in case they are re-wired in a future iteration.
  async function uploadFile(file: File, type: 'logo' | 'signature') {
    if (type === 'logo') setUploadingLogo(true);
    else setUploadingSignature(true);

    try {
      const kind = type === 'logo' ? 'logo' : 'signature';
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error?.message ?? `Error al subir ${kind}`);
      }
      if (type === 'logo') {
        updateConfig('logo_url', json.data.url);
      } else {
        updateConfig('signature_url', json.data.url);
      }
    } catch (err: unknown) {
      reportError('doctor/templates', `uploadFile:${type}`, err);
      showToast({ type: 'error', message: `Error al subir ${type === 'logo' ? 'logo' : 'firma'}` });
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingSignature(false);
    }
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      const input: UpsertTemplateInput = {
        logo_url: config.logo_url,
        signature_url: config.signature_url,
        font_family: config.font_family,
        header_text: config.header_text,
        footer_text: config.footer_text,
        show_logo: config.show_logo,
        show_signature: config.show_signature,
        primary_color: config.primary_color,
      };

      const result = await saveTemplateConfig(activeTab, input);
      if (!result.ok) {
        showToast({ type: 'error', message: result.error ?? 'Error al guardar plantilla' });
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      showToast({ type: 'success', message: `Plantilla "${tabInfo.label}" guardada.` });
    } finally {
      setSaving(false);
    }
  }

  async function applyToAll() {
    setSaving(true);
    try {
      const currentConfig = configs[activeTab];
      const input: UpsertTemplateInput = {
        logo_url: currentConfig.logo_url,
        signature_url: currentConfig.signature_url,
        font_family: currentConfig.font_family,
        header_text: currentConfig.header_text,
        footer_text: currentConfig.footer_text,
        show_logo: currentConfig.show_logo,
        show_signature: currentConfig.show_signature,
        primary_color: currentConfig.primary_color,
      };

      const result = await applyTemplateConfigToAll(
        input,
        templateTabs.map((t) => t.key),
      );

      if (!result.ok) {
        showToast({
          type: 'error',
          message: result.error ?? 'Error al aplicar a todas las plantillas',
        });
        return;
      }

      // Mirror the applied config locally so the UI reflects the change immediately
      const newConfigs = { ...configs };
      for (const tab of templateTabs) {
        newConfigs[tab.key] = { ...currentConfig };
      }
      setConfigs(newConfigs);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      showToast({ type: 'success', message: 'Configuración aplicada a todas las plantillas.' });
    } finally {
      setSaving(false);
    }
  }

  // Fallback defensivo: si activeTab no está en los tabs actuales, usamos el primero
  const tabInfo =
    templateTabs.find((t) => t.key === activeTab) || templateTabs[0] || FALLBACK_TABS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Plantillas de documentos (branding PDF)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Aquí defines <b>cómo se ve</b> cada PDF (logo, firma, tipografía, colores). Si quieres
            cambiar <b>qué pestañas aparecen</b> en la consulta, usa el banner de abajo.
          </p>
        </div>

        {/* RONDA 37 — Banner prominente de aviso para evitar confusion entre
            templates (branding) vs consultation-blocks (secciones reales del informe). */}
        <a
          href="/doctor/settings/consultation-blocks"
          className="block p-5 rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shadow-sm shrink-0">
              <FileEdit className="w-6 h-6 text-amber-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">
                ¿Quieres agregar/quitar pestañas en el informe? (Plan alimenticio, Ejercicios,
                Reposo, etc.)
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Esta página solo cambia el <b>branding visual</b> de los PDFs. Para
                activar/desactivar las
                <b> secciones del formulario</b> de consulta (los bloques que ves al atender un
                paciente), debes ir a <b>Configuración → Bloques de consulta</b>.
              </p>
            </div>
            <span className="text-amber-700 text-sm font-bold whitespace-nowrap">
              Ir a Bloques →
            </span>
          </div>
        </a>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {templateTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-teal-500 text-white shadow-md'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Template description */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <tabInfo.icon className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">{tabInfo.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{tabInfo.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Configuration */}
          <div className="space-y-5">
            {/* === LOGO + FIRMA — Source of truth: PERFIL del doctor (RONDA 17) ===
                Antes cada plantilla pedia su propio logo/firma. Ahora se cargan UNA SOLA vez
                en /doctor/settings y aqui solo mostramos preview + toggles para mostrar/ocultar
                en este tipo de documento especifico. */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <ImageIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-xs text-blue-800">
                <p className="font-semibold mb-1">Logo y firma centralizados</p>
                <p>
                  Estos assets se gestionan desde tu Configuración de Perfil para que se apliquen
                  automáticamente a todos los documentos.
                </p>
                <a
                  href="/doctor/settings?tab=profile"
                  className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-blue-700 hover:text-blue-900 underline underline-offset-2"
                >
                  Ir a Perfil →
                </a>
              </div>
            </div>

            {/* Logo — preview read-only desde perfil */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-bold text-slate-800">Logo</p>
                </div>
                <button
                  onClick={() => updateConfig('show_logo', !config.show_logo)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                    config.show_logo ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {config.show_logo ? 'Visible en este doc' : 'Oculto en este doc'}
                </button>
              </div>

              {profileLogoUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profileLogoUrl}
                    alt="Logo"
                    className="h-16 object-contain rounded-lg border border-slate-200 bg-slate-50 p-1"
                  />
                  <p className="text-xs text-slate-500">Cargado desde tu perfil</p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl py-5 px-4 text-center text-xs text-slate-400">
                  No has cargado un logo todavía.
                  <br />
                  <a
                    href="/doctor/settings?tab=profile"
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Súbelo desde tu perfil
                  </a>
                </div>
              )}
            </div>

            {/* Firma — preview read-only desde perfil */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-bold text-slate-800">Firma digital</p>
                </div>
                <button
                  onClick={() => updateConfig('show_signature', !config.show_signature)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                    config.show_signature
                      ? 'bg-teal-100 text-teal-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {config.show_signature ? 'Visible en este doc' : 'Oculta en este doc'}
                </button>
              </div>

              {profileSignatureUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profileSignatureUrl}
                    alt="Firma"
                    className="h-20 object-contain rounded-lg border border-slate-200 bg-white p-2"
                  />
                  <p className="text-xs text-slate-500">Cargada desde tu perfil</p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl py-5 px-4 text-center text-xs text-slate-400">
                  No has cargado una firma todavía.
                  <br />
                  <a
                    href="/doctor/settings?tab=profile"
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Súbela desde tu perfil
                  </a>
                </div>
              )}
            </div>

            {/* Typography & Color */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-800">Tipografía y color</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fuente</label>
                <select
                  value={config.font_family}
                  onChange={(e) => updateConfig('font_family', e.target.value)}
                  className={inp}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Color principal
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.primary_color}
                    onChange={(e) => updateConfig('primary_color', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={config.primary_color}
                    onChange={(e) => updateConfig('primary_color', e.target.value)}
                    className={inp + ' flex-1'}
                    placeholder="#0891b2"
                  />
                </div>
              </div>
            </div>

            {/* Header & Footer text */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-800">Encabezado y pie</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Texto del encabezado
                </label>
                <input
                  value={config.header_text}
                  onChange={(e) => updateConfig('header_text', e.target.value)}
                  placeholder="Ej: Consultorio Dr. Pérez — Cardiología"
                  className={inp}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Texto del pie de página
                </label>
                <input
                  value={config.footer_text}
                  onChange={(e) => updateConfig('footer_text', e.target.value)}
                  placeholder="Ej: Av. Libertador, Torre Médica, Piso 3 — Tel: 0212-1234567"
                  className={inp}
                />
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex gap-3">
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {saved ? (
                  <>
                    <CheckCircle className="w-4 h-4" /> Guardado
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Guardar {tabInfo.label}
                  </>
                )}
              </button>
              <button
                onClick={applyToAll}
                disabled={saving}
                className="flex items-center justify-center gap-2 border border-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Aplicar a todos
              </button>
            </div>
          </div>

          {/* Right: PDF Preview real con @react-pdf/renderer */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">Vista previa PDF</p>
              <button
                onClick={() => {
                  if (!showPreview) {
                    setPreviewLoading(true);
                    setShowPreview(true);
                  } else {
                    setShowPreview(false);
                    setPreviewLoading(false);
                  }
                }}
                aria-expanded={showPreview}
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
              >
                {showPreview ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Ocultar
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Ver vista previa
                  </>
                )}
              </button>
            </div>

            {/* Indicador de carga mientras el componente react-pdf monta */}
            {showPreview && previewLoading && (
              <div className="flex flex-col items-center justify-center min-h-[100px] gap-2 bg-slate-50 rounded-xl border border-slate-200 py-6">
                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                <p className="text-sm text-slate-500">Cargando vista previa…</p>
              </div>
            )}

            {showPreview && (
              // key={activeTab} forces a full remount when the tab changes,
              // preventing react-pdf from showing a stale/blank render.
              <TemplatePdfPreview
                key={activeTab}
                onReady={() => setPreviewLoading(false)}
                docType={activeTab}
                docTypeLabel={tabInfo.label}
                templateConfig={{
                  header_text: config.header_text,
                  footer_text: config.footer_text,
                  primary_color: config.primary_color,
                  font_family: config.font_family,
                  logo_url: profileLogoUrl,
                  signature_url: profileSignatureUrl,
                  show_logo: config.show_logo,
                  show_signature: config.show_signature,
                }}
                doctor={{
                  fullName: doctorName || 'Dr. Nombre Apellido',
                  specialty: doctorSpecialty || null,
                  licenseNumber: doctorLicense,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
