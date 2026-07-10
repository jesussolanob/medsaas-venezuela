'use client';

/**
 * app/doctor/consultations/GenerateDocumentModal.tsx
 *
 * Modal "Generar Documento" — permite al doctor elegir, bloque por bloque,
 * qué secciones incluir en el PDF consolidado on-demand.
 *
 * Checkboxes de bloques:
 *  - Un checkbox por cada bloque en `informeContent` (los que buildPdfContent
 *    devuelve: printable + con contenido).
 *  - Default marcado: TODOS excepto 'indications', 'paraclinical', 'prescription'
 *    que arrancan desmarcados (el doctor los agrega si quiere).
 *
 * Toggles adicionales al final (ambos desmarcados por defecto):
 *  - Recetas (recetario) — las savedPrescriptions del módulo de recetas.
 *  - Historia clínica (EHR) — fetch on-demand /api/ehr/patient/:id.
 *
 * El PDF se genera SOLO cuando el doctor presiona "Generar", no al montar el
 * componente — esto resuelve el "loading fantasma" del PDFDownloadLink antiguo.
 */

import { useState, useCallback } from 'react';
import { FileText, X, AlertCircle, Loader2, Download } from 'lucide-react';
import type {
  TemplateConfigPdf,
  ContentBlock,
  DoctorInfoPdf,
} from '@/components/pdf/MedicalDocumentPdf';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Keys de bloque que arrancan desmarcados por defecto.
 * El doctor los puede marcar si quiere incluirlos.
 */
const UNCHECKED_BY_DEFAULT = new Set(['indications', 'paraclinical', 'prescription']);

// ─── Types ───────────────────────────────────────────────────────────────────

interface SavedPrescription {
  id: string;
  medications: Array<{
    name: string;
    dose: string;
    frequency: string;
    duration: string;
    indications: string;
  }>;
  notes: string | null;
  created_at: string;
}

interface EhrRecord {
  id: string;
  diagnosis: string | null;
  treatment_plan: string | null;
  created_at: string;
}

interface GenerateDocumentModalProps {
  consultationCode: string;
  consultationDate: string;
  patientId: string;
  patientName: string;
  patientCedula: string | null;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  informeContent: ContentBlock[];
  savedPrescriptions: SavedPrescription[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateVE(dateStr: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}

/**
 * Construye ContentBlock[] de recetas a partir de las prescripciones guardadas.
 */
function buildRecetasContent(prescriptions: SavedPrescription[]): ContentBlock[] {
  return prescriptions
    .flatMap((rx, rxIdx) =>
      rx.medications.map((med, medIdx) => {
        const parts: string[] = [];
        if (med.dose) parts.push(`Dosis: ${med.dose}`);
        if (med.frequency) parts.push(`Frecuencia: ${med.frequency}`);
        if (med.duration) parts.push(`Duración: ${med.duration}`);
        if (med.indications) parts.push(`Indicaciones: ${med.indications}`);
        return {
          key: `rx-${rxIdx}-med-${medIdx}`,
          label: med.name || `Medicamento ${medIdx + 1}`,
          value: parts.length > 0 ? parts.join(' · ') : null,
        };
      }),
    )
    .filter((b): b is ContentBlock & { value: string } => b.value !== null);
}

/**
 * Construye ContentBlock[] de historia clínica a partir de los registros EHR.
 */
function buildEhrContent(records: EhrRecord[]): ContentBlock[] {
  return records.flatMap((r, idx) => {
    const blocks: ContentBlock[] = [];
    if (r.diagnosis?.trim()) {
      blocks.push({
        key: `ehr-diag-${idx}`,
        label: `Diagnóstico${records.length > 1 ? ` #${idx + 1}` : ''}`,
        value: r.diagnosis.trim(),
      });
    }
    if (r.treatment_plan?.trim()) {
      blocks.push({
        key: `ehr-plan-${idx}`,
        label: `Plan terapéutico${records.length > 1 ? ` #${idx + 1}` : ''}`,
        value: r.treatment_plan.trim(),
      });
    }
    return blocks;
  });
}

/**
 * Inserta un bloque-título de sección (separador visual en el PDF).
 */
function sectionHeader(label: string): ContentBlock {
  return {
    key: `section-header-${label.toLowerCase().replace(/\s+/g, '-')}`,
    label: `━━━  ${label}  ━━━`,
    value: ' ',
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface BlockCheckboxProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

function BlockCheckbox({ label, checked, onChange }: BlockCheckboxProps) {
  return (
    <label
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
        checked
          ? 'bg-teal-50 border-teal-200 text-teal-800 font-medium'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 accent-teal-500 cursor-pointer shrink-0"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

interface ExtraToggleProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function ExtraToggle({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ExtraToggleProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed bg-white border-slate-100'
          : checked
            ? 'bg-teal-50 border-teal-200'
            : 'bg-white border-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 w-4 h-4 accent-teal-500 cursor-pointer shrink-0"
      />
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${checked ? 'text-teal-800' : 'text-slate-700'}`}>
            {label}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
    </label>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GenerateDocumentModal({
  consultationCode,
  consultationDate,
  patientId,
  patientName,
  patientCedula,
  templateConfig,
  doctor,
  informeContent,
  savedPrescriptions,
}: GenerateDocumentModalProps) {
  const [open, setOpen] = useState(false);

  /**
   * Mapa de keys de bloque → marcado/desmarcado.
   * Se inicializa cuando el modal se abre (para reflejar informeContent actual).
   */
  const [checkedBlocks, setCheckedBlocks] = useState<Map<string, boolean>>(new Map());

  /** Toggles adicionales — ambos desmarcados por defecto */
  const [includeRecetas, setIncludeRecetas] = useState(false);
  const [includeHistoria, setIncludeHistoria] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRecetas = savedPrescriptions.length > 0;

  /**
   * Devuelve true si hay al menos un bloque o toggle seleccionado.
   */
  const hasSelection =
    [...checkedBlocks.values()].some(Boolean) || includeRecetas || includeHistoria;

  function handleOpen() {
    // Inicializar checkedBlocks según los bloques disponibles y las reglas de default
    const initial = new Map<string, boolean>();
    for (const block of informeContent) {
      initial.set(block.key, !UNCHECKED_BY_DEFAULT.has(block.key));
    }
    setCheckedBlocks(initial);
    setIncludeRecetas(false);
    setIncludeHistoria(false);
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (generating) return;
    setOpen(false);
    setError(null);
  }

  function toggleBlock(key: string) {
    setCheckedBlocks((prev) => {
      const next = new Map(prev);
      next.set(key, !next.get(key));
      return next;
    });
  }

  const handleGenerate = useCallback(async () => {
    if (!hasSelection || generating) return;
    setGenerating(true);
    setError(null);

    try {
      // 1. Armar los bloques de la consulta (solo los marcados)
      const selectedInformeBlocks = informeContent.filter((b) => checkedBlocks.get(b.key) === true);

      const allBlocks: ContentBlock[] = [];

      // Contar cuántas secciones de alto nivel hay para decidir si poner separadores
      const sectionCount =
        (selectedInformeBlocks.length > 0 ? 1 : 0) +
        (includeRecetas ? 1 : 0) +
        (includeHistoria ? 1 : 0);
      const needsSeparators = sectionCount > 1;

      // Bloques de la consulta
      if (selectedInformeBlocks.length > 0) {
        if (needsSeparators) allBlocks.push(sectionHeader('Informe Médico'));
        allBlocks.push(...selectedInformeBlocks);
      }

      // Recetas
      if (includeRecetas) {
        const recetasBlocks = buildRecetasContent(savedPrescriptions);
        if (recetasBlocks.length > 0) {
          if (needsSeparators) allBlocks.push(sectionHeader('Recetas'));
          allBlocks.push(...recetasBlocks);
        }
      }

      // Historia clínica — fetch on-demand
      if (includeHistoria) {
        const res = await fetch(`/api/ehr/patient/${patientId}`, { cache: 'no-store' });
        if (res.ok) {
          const json = (await res.json()) as
            | { success: true; data: EhrRecord[] }
            | { data: EhrRecord[] }
            | EhrRecord[];
          const records: EhrRecord[] = Array.isArray(json)
            ? json
            : Array.isArray((json as { data?: unknown }).data)
              ? (json as { data: EhrRecord[] }).data
              : [];
          const ehrBlocks = buildEhrContent(records);
          if (ehrBlocks.length > 0) {
            if (needsSeparators) allBlocks.push(sectionHeader('Historia Clínica'));
            allBlocks.push(...ehrBlocks);
          }
        }
        // Non-fatal: si el fetch falla, continuamos sin la sección EHR
      }

      if (allBlocks.length === 0) {
        setError('No hay contenido disponible en las secciones seleccionadas.');
        return;
      }

      // 2. Import dinámico de react-pdf — jamás entra al bundle SSR
      const { pdf } = await import('@react-pdf/renderer');
      const { MedicalDocumentPdf } = await import('@/components/pdf/MedicalDocumentPdf');

      const element = (
        <MedicalDocumentPdf
          docType="informe"
          templateConfig={templateConfig}
          doctor={doctor}
          patient={{ fullName: patientName, cedula: patientCedula }}
          docDate={consultationDate}
          consultationCode={consultationCode}
          content={allBlocks}
        />
      );

      const blob = await pdf(element).toBlob();

      // 3. Disparar descarga vía object URL
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `documento-${consultationCode}.pdf`;
      anchor.click();
      // Liberar memoria después de un tick
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // Cerrar modal al terminar exitosamente
      setOpen(false);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al generar el documento';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }, [
    hasSelection,
    generating,
    informeContent,
    checkedBlocks,
    includeRecetas,
    includeHistoria,
    savedPrescriptions,
    patientId,
    templateConfig,
    doctor,
    patientName,
    patientCedula,
    consultationDate,
    consultationCode,
  ]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
        Generar Documento
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Generar Documento</h2>
                  <p className="text-xs text-slate-400">
                    Consulta {consultationCode} &middot; {formatDateVE(consultationDate)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={generating}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-50"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="px-5 py-5 space-y-5 overflow-y-auto flex-1">
              <p className="text-sm text-slate-500">
                Selecciona los bloques a incluir. Se generará un único PDF consolidado con todo el
                contenido seleccionado.
              </p>

              {/* Bloques individuales de la consulta */}
              {informeContent.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Bloques de la consulta
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {informeContent.map((block) => (
                      <BlockCheckbox
                        key={block.key}
                        label={block.label}
                        checked={checkedBlocks.get(block.key) ?? false}
                        onChange={() => toggleBlock(block.key)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  Esta consulta no tiene bloques con contenido para incluir en el informe.
                </p>
              )}

              {/* Secciones adicionales */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Secciones adicionales
                </p>
                <ExtraToggle
                  icon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-violet-600"
                    >
                      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5m4 0h10m-5-4v4m0 0H5m4 0h10" />
                    </svg>
                  }
                  label="Recetas (recetario)"
                  description={
                    hasRecetas
                      ? `${savedPrescriptions.length} receta${savedPrescriptions.length !== 1 ? 's' : ''} guardada${savedPrescriptions.length !== 1 ? 's' : ''}`
                      : 'Sin recetas guardadas para este paciente'
                  }
                  checked={includeRecetas}
                  onChange={() => {
                    if (hasRecetas) setIncludeRecetas((v) => !v);
                  }}
                  disabled={!hasRecetas}
                />
                <ExtraToggle
                  icon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-sky-600"
                    >
                      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                      <line x1="9" y1="12" x2="15" y2="12" />
                      <line x1="9" y1="16" x2="13" y2="16" />
                    </svg>
                  }
                  label="Historia clínica (EHR)"
                  description="Historial clínico electrónico registrado del paciente"
                  checked={includeHistoria}
                  onChange={() => setIncludeHistoria((v) => !v)}
                />
              </div>

              {/* Validation hint */}
              {!hasSelection && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Selecciona al menos un bloque o sección
                </p>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Footer — acciones fijas */}
            <div className="px-5 pb-5 pt-2 flex gap-2.5 shrink-0 border-t border-slate-100">
              <button
                onClick={handleClose}
                disabled={generating}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerate}
                disabled={!hasSelection || generating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generando&hellip;
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Generar PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
