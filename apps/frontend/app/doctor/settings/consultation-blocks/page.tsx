'use client';

import { useEffect, useState } from 'react';
import {
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  GripVertical,
  ArrowLeft,
  Lock,
} from 'lucide-react';

/**
 * Bloques del catálogo estándar con nombre fijo (no renombrables por el doctor).
 * El input de label queda readonly/disabled para estas keys.
 * Estos bloques siempre aparecen primero y vienen habilitados por defecto.
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

/** Orden canónico de los bloques fijos para mostrarlos siempre primero. */
const LOCKED_BLOCK_ORDER: Record<string, number> = {
  chief_complaint: 0,
  history: 1,
  diagnosis: 2,
  prescription: 3,
  indications: 4,
  paraclinical: 5,
  rest: 6,
};

/**
 * Label de presentación para bloques fijos cuyo nombre frontend difiere del
 * default_label del backend (p.ej. el backend puede enviar "Prescription" en
 * inglés o con casing distinto).
 */
const LOCKED_BLOCK_LABELS: Record<string, string> = {
  prescription: 'Récipe',
  indications: 'Evaluación actual',
};
import Link from 'next/link';

type CatalogEntry = {
  key: string;
  // El backend NestJS serializa el catálogo en camelCase.
  defaultLabel: string;
  defaultContentType: string;
  description: string | null;
  // F-FONDO (2026-04-29): mismo flag que usa lib/consultation-blocks.ts para
  // resolver el estado de un doctor sin config personal.
  defaultEnabled?: boolean;
};

type DoctorConfigEntry = {
  blockKey: string;
  enabled: boolean;
  sortOrder: number;
  customLabel?: string | null;
  customDescription?: string | null;
  printable?: boolean | null;
  sendToPatient?: boolean | null;
};

type BlockRow = {
  block_key: string;
  default_label: string;
  custom_label: string;
  /** Descripción predeterminada del catálogo. Se usa como placeholder. */
  default_description: string | null;
  /** Override del doctor. null = sin override (usa la del catálogo). */
  custom_description: string | null;
  enabled: boolean;
  sort_order: number;
  printable: boolean | null;
  send_to_patient: boolean | null;
  content_type: string;
};

export default function ConsultationBlocksConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/doctor/consultation-blocks', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) {
      setMsg({ kind: 'err', text: j.error || 'Error al cargar' });
      setLoading(false);
      return;
    }
    setSpecialty(j.doctor_specialty);

    const catalog: CatalogEntry[] = j.catalog || [];
    const doctorCfg: DoctorConfigEntry[] = j.doctor_config || [];
    const specialtyDefaults: DoctorConfigEntry[] = j.specialty_defaults || [];
    // El backend serializa en camelCase (blockKey, customLabel, sortOrder…).
    const cfgMap = new Map(doctorCfg.map((c) => [c.blockKey, c]));
    const specialtyMap = new Map(specialtyDefaults.map((s) => [s.blockKey, s]));

    // Construir filas: una por cada entrada del catálogo.
    // Prioridad: config del doctor > defaults por especialidad > catálogo default.
    const merged: BlockRow[] = catalog.map((c, i) => {
      const cfg = cfgMap.get(c.key);
      const spec = specialtyMap.get(c.key);
      const isLocked = LOCKED_BLOCK_KEYS.has(c.key);
      // F-FONDO (2026-04-29): mismo modelo que la consulta — si no hay cfg ni
      // spec, usar `default_enabled` del catálogo (4 core marcados, resto NO).
      // Fixed (locked) blocks are always enabled by default when no doctor config exists.
      const enabled = cfg
        ? cfg.enabled
        : spec
          ? spec.enabled
          : isLocked
            ? true
            : (c.defaultEnabled ?? false);
      // Default de orden cuando el doctor aún no guardó config:
      // los fijos toman su orden canónico (0..N) y los demás van después (100+i,
      // preservando el orden del catálogo). Una vez que el doctor reordena y guarda,
      // `cfg.sortOrder` manda para TODOS — incluidos los fijos.
      const sort_order =
        cfg?.sortOrder ??
        spec?.sortOrder ??
        (isLocked ? (LOCKED_BLOCK_ORDER[c.key] ?? 50) : 100 + i);
      // Apply frontend label overrides for locked blocks (e.g. prescription → Récipe).
      const frontendLabelOverride = LOCKED_BLOCK_LABELS[c.key];
      return {
        block_key: c.key,
        default_label: frontendLabelOverride ?? c.defaultLabel,
        custom_label: cfg?.customLabel ?? '',
        default_description: c.description,
        // customDescription del doctor; null = sin override (se mostrará el default como placeholder).
        custom_description: cfg?.customDescription ?? null,
        enabled,
        sort_order,
        printable: cfg?.printable ?? null,
        send_to_patient: cfg?.sendToPatient ?? null,
        content_type: c.defaultContentType,
      };
    });

    // Orden puramente por sort_order (el orden que definió el doctor, incluidos
    // los bloques fijos). El default de arriba ya coloca fijos primero cuando no
    // hay config; a partir de que el doctor reordena y guarda, su orden manda.
    merged.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.block_key.localeCompare(b.block_key);
    });
    // Reasignar sort_order 0..N
    merged.forEach((r, i) => {
      r.sort_order = i;
    });

    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(key: string) {
    setRows((rs) => rs.map((r) => (r.block_key === key ? { ...r, enabled: !r.enabled } : r)));
  }
  function setLabel(key: string, label: string) {
    // El campo de nombre muestra el valor EFECTIVO. Si el texto queda vacío o
    // coincide con el nombre por defecto del catálogo, se guarda como sin override
    // ('' → null en el save) para que el backend resuelva al default.
    setRows((rs) =>
      rs.map((r) => {
        if (r.block_key !== key) return r;
        const isDefault = label.trim() === '' || label.trim() === r.default_label;
        return { ...r, custom_label: isDefault ? '' : label };
      }),
    );
  }
  function setDescription(key: string, description: string) {
    // Guardar null cuando el campo está vacío para que el backend sepa
    // que no hay override y use la descripción del catálogo.
    const value = description.trim() === '' ? null : description;
    setRows((rs) => rs.map((r) => (r.block_key === key ? { ...r, custom_description: value } : r)));
  }
  function move(key: string, dir: -1 | 1) {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.block_key === key);
      if (idx < 0) return rs;
      const tgt = idx + dir;
      if (tgt < 0 || tgt >= rs.length) return rs;
      const copy = [...rs];
      [copy[idx], copy[tgt]] = [copy[tgt], copy[idx]];
      copy.forEach((r, i) => {
        r.sort_order = i;
      });
      return copy;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // Solo enviamos los bloques que el doctor quiere incluir en su config.
      // Si todos están disabled, el API rechaza.
      const payload = rows.map((r) => ({
        block_key: r.block_key,
        enabled: r.enabled,
        sort_order: r.sort_order,
        custom_label: r.custom_label || null,
        custom_description: r.custom_description,
        printable: r.printable,
        send_to_patient: r.send_to_patient,
      }));
      const r = await fetch('/api/doctor/consultation-blocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: payload }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al guardar');
      setMsg({ kind: 'ok', text: 'Configuración guardada' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = rows.filter((r) => r.enabled).length;

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb / back */}
      <Link
        href="/doctor/templates"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a Plantillas
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bloques de consulta</h1>
        <p className="text-slate-500 text-sm mt-1">
          Configura qué secciones aparecen en tus consultas y cómo se llaman.
          {specialty && (
            <>
              {' '}
              Tu especialidad: <strong>{specialty}</strong>.
            </>
          )}
        </p>
      </div>

      {msg && (
        <div
          className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
            msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {enabledCount} / {rows.length} bloques activos
          </p>
          <p className="text-xs text-slate-400">Arrastra para reordenar (o usa ↑↓)</p>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <div
              key={r.block_key}
              className={`px-5 py-4 flex items-center gap-4 ${!r.enabled ? 'opacity-50 bg-slate-50' : ''}`}
            >
              <GripVertical className="w-4 h-4 text-slate-300 cursor-grab shrink-0" />

              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => move(r.block_key, -1)}
                  disabled={i === 0}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => move(r.block_key, 1)}
                  disabled={i === rows.length - 1}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {/* Nombre del bloque. Los bloques del catálogo estándar (LOCKED_BLOCK_KEYS)
                      tienen nombre fijo y no pueden renombrarse. El resto es editable. */}
                  {LOCKED_BLOCK_KEYS.has(r.block_key) ? (
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900 truncate">
                        {LOCKED_BLOCK_LABELS[r.block_key] ?? r.default_label}
                      </span>
                      <span
                        title="Nombre fijo — este bloque no se puede renombrar"
                        className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded"
                      >
                        <Lock className="w-2.5 h-2.5" />
                        Nombre fijo
                      </span>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={r.custom_label || r.default_label}
                      onChange={(e) => setLabel(r.block_key, e.target.value)}
                      disabled={!r.enabled}
                      title="Nombre del bloque (editable). Borralo para volver al nombre por defecto."
                      className="flex-1 min-w-0 font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-teal-400 outline-none disabled:opacity-60 py-0.5"
                    />
                  )}
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {r.block_key}
                  </span>
                </div>
                {!LOCKED_BLOCK_KEYS.has(r.block_key) &&
                  r.custom_label &&
                  r.custom_label !== r.default_label && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Por defecto: {r.default_label}
                    </p>
                  )}
                <textarea
                  rows={2}
                  placeholder={
                    r.default_description
                      ? `Descripción (default: "${r.default_description}")`
                      : 'Descripción del bloque (opcional)'
                  }
                  value={r.custom_description ?? ''}
                  onChange={(e) => setDescription(r.block_key, e.target.value)}
                  disabled={!r.enabled}
                  className="w-full mt-1 px-2 py-1 text-sm border border-slate-200 rounded focus:border-teal-400 outline-none resize-none disabled:bg-slate-100 text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={() => toggle(r.block_key)}
                  className="w-4 h-4 accent-teal-500"
                />
                <span className="text-sm text-slate-600">Activo</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <p className="text-xs text-slate-500">
          Los cambios solo afectan <strong>consultas futuras</strong>. Las consultas pasadas
          conservan la configuración con la que se crearon.
        </p>
        <button
          onClick={save}
          disabled={saving || enabledCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar configuración
        </button>
      </div>
    </div>
  );
}
