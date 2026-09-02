'use client';

/**
 * app/doctor/consultations/GenerateDocumentModal.tsx
 *
 * Modal "Generar Documento" — 6 tipos de documento con auto-detección.
 *
 * La unidad de selección es el TIPO de documento (no el bloque individual):
 *   1. Informe médico (con sub-selector de bloques)
 *   2. Récipe (diagnóstico + medicamentos, sin indicaciones)
 *   3. Indicaciones (instrucciones al paciente + referencia de medicamentos)
 *   4. Paraclínicos
 *   5. Historia clínica (EHR on-demand)
 *   6. Reposo médico
 *
 * Se genera UN solo PDF consolidado con separadores de sección.
 * El patrón on-demand (import dinámico de react-pdf + pdf().toBlob()) se preserva.
 */

import { useState, useCallback } from 'react';
import { FileText, X, AlertCircle, Loader2, Download, ChevronDown } from 'lucide-react';
import type {
  TemplateConfigPdf,
  ContentBlock,
  DoctorInfoPdf,
} from '@/components/pdf/MedicalDocumentPdf';
import {
  type DocumentTypeKey,
  type SavedPrescription,
  type EhrRecord,
  type RestData,
  computeAvailableDocTypes,
  buildDocumentPages,
  buildRestBlocks,
  INFORME_EXCLUDED_KEYS,
  INFORME_CHECKED_BY_DEFAULT,
  INFORME_SPECIAL_RENDER_KEYS,
} from './consultation-documents';

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * El tipo vive en consultation-documents.ts junto a su constructor. Se re-exporta
 * para no romper a quien ya lo importaba desde acá.
 */
export type { RestData };

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
  /** Cantidad de consultas del paciente (contexto). */
  patientConsultationCount: number;
  /** Cantidad de registros EHR del paciente (habilita Historia clínica si > 0). */
  patientEhrCount: number;
  /**
   * Texto resumido del reposo (usado para habilitar/deshabilitar el tipo en el selector).
   * null cuando no hay reposo configurado (días = 0).
   */
  restContent: string | null;
  /**
   * Datos estructurados del reposo. Cuando están disponibles, el PDF de reposo usa
   * 3 bloques separados (diagnóstico, período, comentarios) — idéntico al botón
   * "Descargar PDF Reposo". Si no se pasa, se cae al fallback de `restContent`.
   */
  restData?: RestData | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateVE(dateStr: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DocTypeCardProps {
  label: string;
  description: string;
  enabled: boolean;
  checked: boolean;
  onChange: () => void;
  children?: React.ReactNode;
}

function DocTypeCard({
  label,
  description,
  enabled,
  checked,
  onChange,
  children,
}: DocTypeCardProps) {
  return (
    <div
      className={`rounded-xl border transition-colors ${
        !enabled
          ? 'opacity-45 bg-slate-50 border-slate-100 cursor-not-allowed'
          : checked
            ? 'bg-teal-50 border-teal-200'
            : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <label
        className={`flex items-start gap-3 p-3.5 ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={!enabled}
          className="mt-0.5 w-4 h-4 accent-teal-500 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              !enabled ? 'text-slate-400' : checked ? 'text-teal-800' : 'text-slate-700'
            }`}
          >
            {label}
          </p>
          <p className={`text-xs mt-0.5 ${!enabled ? 'text-slate-300' : 'text-slate-400'}`}>
            {description}
          </p>
        </div>
      </label>
      {children}
    </div>
  );
}

interface BlockSubSelectorProps {
  informeContent: ContentBlock[];
  checkedKeys: Set<string>;
  onToggle: (key: string) => void;
}

/**
 * Sub-selector de bloques del informe.
 * Muestra todos los bloques con contenido (INFORME_EXCLUDED_KEYS está vacío).
 * Los bloques con renderizado especial (prescription, rest) muestran un badge
 * "como sección" para aclarar que no se generan como documento independiente.
 */
function BlockSubSelector({ informeContent, checkedKeys, onToggle }: BlockSubSelectorProps) {
  const eligibleBlocks = informeContent.filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key));

  if (eligibleBlocks.length === 0) return null;

  return (
    <div className="px-3.5 pb-3.5 pt-0 border-t border-teal-100">
      <div className="flex items-center gap-1.5 mt-2 mb-2">
        <ChevronDown className="w-3 h-3 text-teal-500" />
        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">
          Bloques a incluir
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {eligibleBlocks.map((block) => (
          <label
            key={block.key}
            className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              checkedKeys.has(block.key)
                ? 'bg-teal-100 border-teal-200 text-teal-800 font-medium'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={checkedKeys.has(block.key)}
              onChange={() => onToggle(block.key)}
              className="w-3 h-3 accent-teal-500 shrink-0 mt-0.5"
            />
            <span className="flex-1 min-w-0">
              <span className="truncate block">{block.label}</span>
              {INFORME_SPECIAL_RENDER_KEYS.has(block.key) && (
                <span className="text-[10px] text-slate-400 font-normal">como sección</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  patientConsultationCount,
  patientEhrCount,
  restContent,
  restData,
}: GenerateDocumentModalProps) {
  const [open, setOpen] = useState(false);

  /** Tipos de documento seleccionados por el doctor */
  const [selectedTypes, setSelectedTypes] = useState<Set<DocumentTypeKey>>(new Set());

  /**
   * Sub-selector de bloques para el tipo "informe".
   * Se inicializa al abrir el modal con las defaults (chief_complaint, history, diagnosis).
   */
  const [informeCheckedKeys, setInformeCheckedKeys] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTypes = computeAvailableDocTypes({
    informeContent,
    savedPrescriptions,
    patientConsultationCount,
    patientEhrCount,
    restContent,
  });

  const hasSelection = selectedTypes.size > 0;

  function handleOpen() {
    // Inicializar sub-selector del informe con defaults
    const defaultInformeKeys = new Set<string>();
    for (const block of informeContent) {
      if (!INFORME_EXCLUDED_KEYS.has(block.key) && INFORME_CHECKED_BY_DEFAULT.has(block.key)) {
        defaultInformeKeys.add(block.key);
      }
    }
    setInformeCheckedKeys(defaultInformeKeys);
    setSelectedTypes(new Set());
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (generating) return;
    setOpen(false);
    setError(null);
  }

  function toggleType(key: DocumentTypeKey) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleInformeBlock(key: string) {
    setInformeCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const handleGenerate = useCallback(async () => {
    if (!hasSelection || generating) return;
    setGenerating(true);
    setError(null);

    try {
      // Fetch EHR on-demand solo si el tipo historia está seleccionado
      let fetchedEhrRecords: EhrRecord[] = [];
      if (selectedTypes.has('history')) {
        const res = await fetch(`/api/ehr/patient/${patientId}`, { cache: 'no-store' });
        if (res.ok) {
          const json = (await res.json()) as
            | { success: true; data: EhrRecord[] }
            | { data: EhrRecord[] }
            | EhrRecord[];
          fetchedEhrRecords = Array.isArray(json)
            ? json
            : Array.isArray((json as { data?: unknown }).data)
              ? (json as { data: EhrRecord[] }).data
              : [];
        }
        // Non-fatal: si el fetch falla, continuamos sin la sección EHR
      }

      // Bloques de reposo: los arma buildRestBlocks, el ÚNICO constructor. Esta
      // lógica vivía acá copiada y la ruta del documento compartido no la tenía,
      // así que el reposo compartido perdía el formato. Ver consultation-documents.ts.
      const built = buildRestBlocks(restData);
      const builtRestBlocks: ContentBlock[] | undefined = built.length > 0 ? built : undefined;

      // Armar una página por tipo de documento seleccionado
      const docPages = buildDocumentPages({
        selectedTypes: [...selectedTypes],
        informeSelectedBlockKeys: informeCheckedKeys,
        informeContent,
        savedPrescriptions,
        ehrRecords: fetchedEhrRecords,
        restContent,
        restBlocks: builtRestBlocks,
        diagnosisValue: informeContent.find((b) => b.key === 'diagnosis')?.value as
          | string
          | undefined,
      });

      if (docPages.length === 0) {
        setError('No hay contenido disponible en las secciones seleccionadas.');
        return;
      }

      // Import dinámico de react-pdf — jamás entra al bundle SSR
      const { pdf } = await import('@react-pdf/renderer');
      const { MedicalDocumentPdf } = await import('@/components/pdf/MedicalDocumentPdf');

      // Un tipo = 1 página, N tipos = N páginas (una por tipo seleccionado)
      const element = (
        <MedicalDocumentPdf
          docType={docPages[0].docType}
          templateConfig={templateConfig}
          doctor={doctor}
          patient={{ fullName: patientName, cedula: patientCedula }}
          docDate={consultationDate}
          consultationCode={consultationCode}
          content={docPages[0].content}
          documents={docPages.length > 1 ? docPages : undefined}
        />
      );

      const blob = await pdf(element).toBlob();

      // Disparar descarga vía object URL — nombre legible según el tipo de documento
      const typeLabels: Record<string, string> = {
        informe: 'Informe',
        recipe: 'Récipe',
        indications: 'Indicaciones',
        paraclinical: 'Paraclínicos',
        history: 'Historia-Clínica',
        rest: 'Reposo',
      };
      const typeKeys = [...selectedTypes];
      const labelPart =
        typeKeys.length === 1
          ? (typeLabels[typeKeys[0]] ?? 'Documento')
          : `Documentos-${typeKeys.length}-tipos`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const safeCode = (consultationCode || 'consulta').replace(/[^\w-]/g, '');
      anchor.download = `${labelPart}-${safeCode}.pdf`;
      // El anchor DEBE estar en el DOM para que el navegador respete el atributo
      // `download`; si no, tras el `await pdf().toBlob()` (fuera del gesto directo)
      // Chrome ignoraba el nombre y descargaba el blob con un UUID sin extensión.
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 1000);

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
    selectedTypes,
    informeCheckedKeys,
    informeContent,
    savedPrescriptions,
    restContent,
    restData,
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

      {/* Modal backdrop — no se cierra al hacer clic en el backdrop (solo con Cancelar o X) */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
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
            <div className="px-5 py-5 space-y-3 overflow-y-auto flex-1">
              <p className="text-sm text-slate-500">
                Seleccioná los tipos de documento a incluir. Se generará un único PDF consolidado
                con el contenido de cada sección seleccionada.
              </p>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Tipos de documento
                </p>

                {availableTypes.map((docType) => (
                  <DocTypeCard
                    key={docType.key}
                    label={docType.label}
                    description={docType.description}
                    enabled={docType.enabled}
                    checked={selectedTypes.has(docType.key)}
                    onChange={() => {
                      if (docType.enabled) toggleType(docType.key);
                    }}
                  >
                    {/* Sub-selector de bloques solo para "informe" cuando está marcado */}
                    {docType.key === 'informe' && selectedTypes.has('informe') && (
                      <BlockSubSelector
                        informeContent={informeContent}
                        checkedKeys={informeCheckedKeys}
                        onToggle={toggleInformeBlock}
                      />
                    )}
                  </DocTypeCard>
                ))}
              </div>

              {/* Validation hint */}
              {!hasSelection && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Seleccioná al menos un tipo de documento disponible
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
