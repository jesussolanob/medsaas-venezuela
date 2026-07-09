'use client';

/**
 * app/doctor/consultations/GenerateDocumentModal.tsx
 *
 * Modal "Generar Documento" — permite al doctor elegir qué secciones incluir
 * (Informe, Recetas, Historia clínica) y genera UN solo PDF consolidado on-demand
 * usando @react-pdf/renderer (import dinámico, jamás eager).
 *
 * El PDF se genera SOLO cuando el doctor presiona "Generar", no al montar el
 * componente — esto resuelve el "loading fantasma" del PDFDownloadLink antiguo.
 *
 * Secciones:
 *  - Informe   → buildPdfContent(consultation) (bloques printables de la consulta)
 *  - Recetas   → prescriptions pasadas como prop (cargadas en openConsultation)
 *  - Historia clínica → se fetcha on-demand vía /api/ehr/patient/:id
 */

import { useState, useCallback } from 'react';
import { FileText, Pill, ClipboardList, X, AlertCircle, Loader2, Download } from 'lucide-react';
import type {
  TemplateConfigPdf,
  ContentBlock,
  DoctorInfoPdf,
} from '@/components/pdf/MedicalDocumentPdf';

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

interface SelectedSections {
  informe: boolean;
  recetas: boolean;
  historia: boolean;
}

// ─── Section Checkbox ─────────────────────────────────────────────────────────

interface SectionCheckboxProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function SectionCheckbox({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: SectionCheckboxProps) {
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
        className="mt-0.5 w-4 h-4 accent-teal-500 cursor-pointer"
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
 * Cada prescripción se convierte en un bloque con el nombre del medicamento como
 * label y los detalles (dosis/frecuencia/duración/indicaciones) como value.
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
    .filter((b) => b.value !== null);
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
 * Usa el estilo sectionTitle del MedicalDocumentPdf existente — el label
 * en MAYÚSCULAS actúa como encabezado de sección.
 */
function sectionHeader(label: string): ContentBlock {
  return {
    key: `section-header-${label.toLowerCase().replace(/\s+/g, '-')}`,
    label: `━━━  ${label}  ━━━`,
    value: ' ',
  };
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
  const [sections, setSections] = useState<SelectedSections>({
    informe: true,
    recetas: false,
    historia: false,
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = sections.informe || sections.recetas || sections.historia;
  const hasRecetas = savedPrescriptions.length > 0;

  function handleOpen() {
    setOpen(true);
    setError(null);
    setSections({ informe: true, recetas: false, historia: false });
  }

  function handleClose() {
    if (generating) return;
    setOpen(false);
    setError(null);
  }

  function toggleSection(key: keyof SelectedSections) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const handleGenerate = useCallback(async () => {
    if (!hasSelection || generating) return;
    setGenerating(true);
    setError(null);

    try {
      // 1. Recoger datos de cada sección seleccionada
      const allBlocks: ContentBlock[] = [];
      const needsMultipleSections =
        [sections.informe, sections.recetas, sections.historia].filter(Boolean).length > 1;

      // Informe
      if (sections.informe && informeContent.length > 0) {
        if (needsMultipleSections) allBlocks.push(sectionHeader('Informe Médico'));
        allBlocks.push(...informeContent);
      }

      // Recetas
      if (sections.recetas) {
        const recetasBlocks = buildRecetasContent(savedPrescriptions);
        if (recetasBlocks.length > 0) {
          if (needsMultipleSections) allBlocks.push(sectionHeader('Recetas'));
          allBlocks.push(...recetasBlocks);
        }
      }

      // Historia clínica — fetch on-demand
      if (sections.historia) {
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
            if (needsMultipleSections) allBlocks.push(sectionHeader('Historia Clínica'));
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
    sections,
    informeContent,
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
      {/* Trigger button — mismo estilo que el antiguo "Generar informe" */}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
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

            {/* Body */}
            <div className="px-5 py-5 space-y-5">
              <p className="text-sm text-slate-500">
                Selecciona las secciones a incluir. Se generará un único PDF consolidado con todo el
                contenido seleccionado.
              </p>

              {/* Section checkboxes */}
              <div className="space-y-2.5">
                <SectionCheckbox
                  icon={<FileText className="w-4 h-4 text-teal-600" />}
                  label="Informe de la consulta"
                  description="Diagnóstico, motivo y bloques clínicos de esta consulta"
                  checked={sections.informe}
                  onChange={() => toggleSection('informe')}
                />
                <SectionCheckbox
                  icon={<Pill className="w-4 h-4 text-violet-600" />}
                  label="Recetas"
                  description={
                    hasRecetas
                      ? `${savedPrescriptions.length} receta${savedPrescriptions.length !== 1 ? 's' : ''} guardada${savedPrescriptions.length !== 1 ? 's' : ''}`
                      : 'Sin recetas guardadas para este paciente'
                  }
                  checked={sections.recetas}
                  onChange={() => {
                    if (hasRecetas) toggleSection('recetas');
                  }}
                  disabled={!hasRecetas}
                />
                <SectionCheckbox
                  icon={<ClipboardList className="w-4 h-4 text-sky-600" />}
                  label="Historia clínica / EHR"
                  description="Historial clínico electrónico registrado del paciente"
                  checked={sections.historia}
                  onChange={() => toggleSection('historia')}
                />
              </div>

              {/* Validation hint */}
              {!hasSelection && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Selecciona al menos una sección
                </p>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2.5">
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
        </div>
      )}
    </>
  );
}
