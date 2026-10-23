'use client';

/**
 * components/doctor/GenerateStandaloneDocumentModal.tsx
 *
 * Modal de 3 pasos para crear un récipe / paraclínico / reposo sin consulta:
 *   1. Paciente   — PatientSearchOrCreate
 *   2. Tipo       — Récipe / Paraclínico / Reposo
 *   3. Contenido  — editor (vía "Generar nuevo") o plantilla (UseTemplateButton)
 *
 * Botones:
 *   Guardar      → POST draft (o PATCH si ya existe), toast "Borrador guardado"
 *   Cancelar     → cierra; si se creó un draft sin emitir, confirma descarte → DELETE
 *   Crear        → guardar + issue → vista de éxito con código + "Descargar PDF"
 *   Crear y enviar → guardar + issue + abre ShareDocumentsModal
 *
 * El componente puede recibir un `initialDraft` para editar un borrador existente.
 *
 * Reposo: las fechas from/to no se guardan en plantillas (solo diagnosis/days/comments);
 *   aquí el `from` toma valor de `todayCaracas()` por defecto y `to` = from + days - 1.
 *   El especialista puede editarlos antes de emitir.
 */

import { useState, useCallback } from 'react';
import {
  FileText,
  Loader2,
  X,
  Check,
  Download,
  Share2,
  FilePlus,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { PatientSearchOrCreate } from '@/components/doctor/PatientSearchOrCreate';
import { RecipeEditor } from '@/components/doctor/document-editors/RecipeEditor';
import { ParaclinicalEditor } from '@/components/doctor/document-editors/ParaclinicalEditor';
import { UseTemplateButton } from '@/components/doctor/document-editors/UseTemplateButton';
import { todayCaracas } from '@/lib/date-range';
import {
  createDraftStandaloneDocument,
  updateDraftStandaloneDocument,
  issueStandaloneDocument,
  deleteDraftStandaloneDocument,
  shareStandaloneDocument,
  type StandaloneDocumentType,
  type StandaloneDocumentContent,
  type StandaloneDocument,
  type ReposoDocumentContent,
} from '@/app/doctor/standalone-documents/actions';
import {
  loadStandalonePdfDoctorData,
  buildStandalonePdfInput,
  downloadStandalonePdf,
} from '@/app/doctor/standalone-documents/standalone-pdf';
import type {
  RecipeTemplateContent,
  ParaclinicalTemplateContent,
  ContentTemplate,
  ReposoTemplateContent,
} from '@/app/doctor/templates/content-actions';
import type { PatientLookup } from '@/components/appointment-flow/appointment-flow.utils';

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

type Step = 'patient' | 'type' | 'content';

function emptyRecipe(): RecipeTemplateContent {
  return { medications: [], notes: '' };
}

function emptyParaclinical(): ParaclinicalTemplateContent {
  return { items: [] };
}

function emptyReposo(): ReposoDocumentContent {
  const from = todayCaracas();
  return { diagnosis: '', days: 1, from, to: addDays(from, 0), comments: '' };
}

/** Adds n days to a YYYY-MM-DD string and returns YYYY-MM-DD. */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// ReposoEditor wrapper — extends the template editor with from/to date editing
// ---------------------------------------------------------------------------

const fi =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white placeholder:text-slate-300';

interface ReposoDocumentEditorProps {
  value: ReposoDocumentContent;
  onChange: (v: ReposoDocumentContent) => void;
}

function ReposoDocumentEditor({ value, onChange }: ReposoDocumentEditorProps) {
  return (
    <div className="space-y-4">
      {/* Template-compatible fields */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Diagnóstico</label>
        <textarea
          placeholder="Diagnóstico para el reposo"
          value={value.diagnosis}
          onChange={(e) => onChange({ ...value, diagnosis: e.target.value })}
          rows={3}
          className={`${fi} resize-none`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Días de reposo</label>
          <input
            type="number"
            min="1"
            max="365"
            value={value.days === 0 ? '' : value.days}
            onChange={(e) => {
              const days = Math.max(1, parseInt(e.target.value) || 1);
              onChange({ ...value, days, to: addDays(value.from, days - 1) });
            }}
            className={fi}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Desde</label>
          <input
            type="date"
            value={value.from}
            onChange={(e) => {
              const from = e.target.value || todayCaracas();
              onChange({ ...value, from, to: addDays(from, value.days - 1) });
            }}
            className={fi}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Hasta</label>
        <input
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className={fi}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Comentarios <span className="text-slate-400 font-normal text-xs">(opcional)</span>
        </label>
        <textarea
          placeholder="Observaciones adicionales del especialista..."
          value={value.comments}
          onChange={(e) => onChange({ ...value, comments: e.target.value })}
          rows={3}
          className={`${fi} resize-none`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GenerateStandaloneDocumentModalProps {
  /**
   * Controlled open state. When provided the component renders no trigger button
   * and opens/closes based on this prop. When undefined the component renders its
   * own trigger button and manages open state internally.
   */
  open?: boolean;
  /** When provided, opens modal pre-filled with this draft for editing. */
  initialDraft?: StandaloneDocument;
  /** When provided, pre-selects this patient (skips patient step if also type is given). */
  preselectedPatient?: PatientLookup | null;
  onClose?: () => void;
  onSuccess?: () => void;
}

export default function GenerateStandaloneDocumentModal({
  open: controlledOpen,
  initialDraft,
  preselectedPatient,
  onClose,
  onSuccess,
}: GenerateStandaloneDocumentModalProps) {
  const isControlled = controlledOpen !== undefined;

  // Capture opener element for dialog focus management
  const [internalOpen, setInternalOpen] = useState(false);
  const [openerEl] = useState<Element | null>(() =>
    typeof document !== 'undefined' ? document.activeElement : null,
  );

  const open = isControlled ? controlledOpen : internalOpen;

  // Step state
  const [step, setStep] = useState<Step>(() => {
    if (initialDraft) return 'content';
    if (preselectedPatient) return 'type';
    return 'patient';
  });

  // Patient
  const [patient, setPatient] = useState<PatientLookup | null>(preselectedPatient ?? null);

  // Doc type
  const [docType, setDocType] = useState<StandaloneDocumentType | null>(
    initialDraft ? initialDraft.type : null,
  );

  // Content state
  const [recipeContent, setRecipeContent] = useState<RecipeTemplateContent>(() => {
    if (initialDraft?.type === 'recipe') {
      return initialDraft.content as RecipeTemplateContent;
    }
    return emptyRecipe();
  });
  const [paraclinicalContent, setParaclinicalContent] = useState<ParaclinicalTemplateContent>(
    () => {
      if (initialDraft?.type === 'paraclinical') {
        return initialDraft.content as ParaclinicalTemplateContent;
      }
      return emptyParaclinical();
    },
  );
  const [reposoContent, setReposoContent] = useState<ReposoDocumentContent>(() => {
    if (initialDraft?.type === 'reposo') {
      return initialDraft.content as ReposoDocumentContent;
    }
    return emptyReposo();
  });

  // Draft tracking (to allow DELETE on cancel)
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [issuedDoc, setIssuedDoc] = useState<StandaloneDocument | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getCurrentContent(): StandaloneDocumentContent {
    if (docType === 'recipe') return recipeContent;
    if (docType === 'paraclinical') return paraclinicalContent;
    return reposoContent;
  }

  function hasContent(): boolean {
    if (docType === 'recipe') return recipeContent.medications.length > 0;
    if (docType === 'paraclinical') return paraclinicalContent.items.length > 0;
    return reposoContent.diagnosis.trim().length > 0 && reposoContent.days > 0;
  }

  function handleTemplateApply(template: ContentTemplate, action: 'append' | 'replace') {
    if (template.type === 'recipe') {
      const tc = template.content as RecipeTemplateContent;
      if (action === 'replace') {
        setRecipeContent(tc);
      } else {
        setRecipeContent((prev) => ({
          medications: [...prev.medications, ...tc.medications],
          notes: prev.notes || tc.notes,
        }));
      }
    } else if (template.type === 'paraclinical') {
      const tc = template.content as ParaclinicalTemplateContent;
      if (action === 'replace') {
        setParaclinicalContent(tc);
      } else {
        setParaclinicalContent((prev) => ({ items: [...prev.items, ...tc.items] }));
      }
    } else if (template.type === 'reposo') {
      const tc = template.content as ReposoTemplateContent;
      const from = reposoContent.from || todayCaracas();
      setReposoContent({
        diagnosis: tc.diagnosis,
        days: tc.days,
        from,
        to: addDays(from, tc.days - 1),
        comments: tc.comments,
      });
    }
  }

  // ── Save draft ─────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!patient || !docType) return null;
    const content = getCurrentContent();

    setSaving(true);
    setError(null);
    try {
      if (draftId) {
        const res = await updateDraftStandaloneDocument(draftId, content);
        if (!res.ok) {
          setError(res.error ?? 'Error al guardar el borrador.');
          return null;
        }
        showToast({ type: 'success', message: 'Borrador guardado' });
        return draftId;
      } else {
        const res = await createDraftStandaloneDocument({
          patient_id: patient.id,
          type: docType,
          content,
        });
        if (!res.ok || !res.document) {
          setError(res.error ?? 'Error al crear el borrador.');
          return null;
        }
        setDraftId(res.document.id);
        showToast({ type: 'success', message: 'Borrador guardado' });
        return res.document.id;
      }
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, docType, draftId, recipeContent, paraclinicalContent, reposoContent]);

  // ── Issue ──────────────────────────────────────────────────────────────
  const handleIssue = useCallback(
    async (andShare: boolean) => {
      if (!patient || !docType || !hasContent()) return;
      setIssuing(true);
      setError(null);
      try {
        const savedId = await saveDraft();
        if (!savedId) return;

        const res = await issueStandaloneDocument(savedId);
        if (!res.ok || !res.document) {
          setError(res.error ?? 'Error al emitir el documento.');
          return;
        }
        setIssuedDoc(res.document);
        onSuccess?.();

        if (andShare) {
          setShowShare(true);
        }
      } finally {
        setIssuing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patient, docType, saveDraft, onSuccess],
  );

  // ── Close / discard ────────────────────────────────────────────────────
  function doClose() {
    if (!isControlled) setInternalOpen(false);
    onClose?.();
    if (openerEl instanceof HTMLElement) openerEl.focus();
  }

  async function handleClose() {
    if (issuedDoc) {
      doClose();
      return;
    }
    if (draftId) {
      setConfirmDiscard(true);
      return;
    }
    doClose();
  }

  async function discardDraft() {
    if (draftId) {
      await deleteDraftStandaloneDocument(draftId);
    }
    setConfirmDiscard(false);
    doClose();
  }

  // ── PDF download ───────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    if (!issuedDoc) return;
    setGeneratingPdf(true);
    try {
      const doctorData = await loadStandalonePdfDoctorData();
      if (!doctorData) {
        showToast({ type: 'error', message: 'No se pudo cargar la configuración del doctor.' });
        return;
      }
      const input = buildStandalonePdfInput(issuedDoc, doctorData);
      await downloadStandalonePdf(input);
    } catch (err: unknown) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al generar el PDF.',
      });
    } finally {
      setGeneratingPdf(false);
    }
  }

  // ── Type labels ────────────────────────────────────────────────────────
  const typeLabels: Record<StandaloneDocumentType, string> = {
    recipe: 'Récipe',
    paraclinical: 'Paraclínicos',
    reposo: 'Reposo médico',
  };

  const stepLabel: Record<Step, string> = {
    patient: 'Paciente',
    type: 'Tipo de documento',
    content: 'Contenido',
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setInternalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur text-white font-semibold text-[13px] transition-colors"
          style={{
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.28)',
          }}
        >
          <FilePlus className="w-4 h-4" />
          <span>Generar recipe/paraclínico</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="standalone-doc-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <h2
                    id="standalone-doc-modal-title"
                    className="text-base font-bold text-slate-800"
                  >
                    {issuedDoc
                      ? 'Documento emitido'
                      : initialDraft
                        ? 'Editar borrador'
                        : 'Generar recipe/paraclínico'}
                  </h2>
                  {!issuedDoc && <p className="text-xs text-slate-400">{stepLabel[step]}</p>}
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={saving || issuing}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 overflow-y-auto flex-1 space-y-4">
              {/* ── Success view ── */}
              {issuedDoc && !showShare && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Documento emitido</p>
                      <p className="text-xs text-emerald-600 font-mono">{issuedDoc.code}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Tipo
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {typeLabels[issuedDoc.type]}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">
                      Paciente
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {issuedDoc.patient.fullName}
                    </p>
                  </div>

                  {error && (
                    <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={() => void handleDownloadPdf()}
                    disabled={generatingPdf}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60"
                  >
                    {generatingPdf ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Generando PDF…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Descargar PDF
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setShowShare(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Share2 className="w-4 h-4" /> Compartir
                  </button>

                  <button
                    onClick={() => void handleClose()}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}

              {/* ── Share view (inside modal, after issue) ── */}
              {issuedDoc && showShare && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">
                    Comparte el documento{' '}
                    <span className="font-mono font-semibold">{issuedDoc.code}</span> con el
                    paciente.
                  </p>
                  <StandaloneSharePanel
                    docId={issuedDoc.id}
                    docType={issuedDoc.type}
                    patientPhone={null}
                    patientName={issuedDoc.patient.fullName}
                    doctorName={null}
                  />
                  <button
                    onClick={() => setShowShare(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    ← Volver
                  </button>
                </div>
              )}

              {/* ── Confirm discard ── */}
              {confirmDiscard && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Se creó un borrador. ¿Deseas descartarlo?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void discardDraft()}
                      className="flex-1 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    >
                      Sí, descartar
                    </button>
                    <button
                      onClick={() => setConfirmDiscard(false)}
                      className="flex-1 py-2 text-sm font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Mantener borrador
                    </button>
                  </div>
                </div>
              )}

              {/* ── Steps (only when not issued / confirming) ── */}
              {!issuedDoc && !confirmDiscard && (
                <>
                  {/* Step 1: Patient */}
                  {step === 'patient' && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500">
                        Selecciona o crea el paciente para este documento.
                      </p>
                      <PatientSearchOrCreate value={patient} onSelect={setPatient} />
                      {patient && (
                        <button
                          onClick={() => setStep('type')}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors"
                        >
                          Siguiente <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Step 2: Type */}
                  {step === 'type' && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500">
                        Paciente:{' '}
                        <span className="font-semibold text-slate-700">{patient?.full_name}</span>
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {(['recipe', 'paraclinical', 'reposo'] as StandaloneDocumentType[]).map(
                          (t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setDocType(t);
                                setStep('content');
                              }}
                              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
                                docType === t
                                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                                  : 'bg-white border-slate-200 hover:border-teal-200 hover:bg-teal-50/40 text-slate-700'
                              }`}
                            >
                              <span className="text-sm font-semibold">{typeLabels[t]}</span>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>
                          ),
                        )}
                      </div>
                      <button
                        onClick={() => setStep('patient')}
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Cambiar paciente
                      </button>
                    </div>
                  )}

                  {/* Step 3: Content */}
                  {step === 'content' && docType && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">
                          {typeLabels[docType]}
                          <span className="text-slate-400 font-normal ml-1">
                            — {patient?.full_name}
                          </span>
                        </p>
                        <div className="flex items-center gap-2">
                          <UseTemplateButton
                            type={docType}
                            hasExistingContent={hasContent()}
                            onApply={handleTemplateApply}
                            allowAppend={docType !== 'reposo'}
                          />
                          <button
                            onClick={() => setStep('type')}
                            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Cambiar tipo
                          </button>
                        </div>
                      </div>

                      {docType === 'recipe' && (
                        <RecipeEditor value={recipeContent} onChange={setRecipeContent} />
                      )}
                      {docType === 'paraclinical' && (
                        <ParaclinicalEditor
                          value={paraclinicalContent}
                          onChange={setParaclinicalContent}
                        />
                      )}
                      {docType === 'reposo' && (
                        <ReposoDocumentEditor value={reposoContent} onChange={setReposoContent} />
                      )}

                      {error && (
                        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer buttons — only when on content step */}
            {!issuedDoc && !confirmDiscard && step === 'content' && docType && (
              <div className="px-5 pb-5 pt-3 border-t border-slate-100 shrink-0 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveDraft()}
                    disabled={saving || issuing || !hasContent()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Guardar
                  </button>
                  <button
                    onClick={() => void handleIssue(false)}
                    disabled={saving || issuing || !hasContent()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors disabled:opacity-60"
                  >
                    {issuing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Crear
                  </button>
                </div>
                <button
                  onClick={() => void handleIssue(true)}
                  disabled={saving || issuing || !hasContent()}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" /> Crear y enviar
                </button>
                <button
                  onClick={() => void handleClose()}
                  disabled={saving || issuing}
                  className="text-xs text-slate-400 hover:text-slate-600 text-center transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// StandaloneSharePanel — inline share UI for standalone docs
// Uses the same flow as the consultation share but for standalone doc endpoint
// ---------------------------------------------------------------------------

interface StandaloneSharePanelProps {
  docId: string;
  docType: StandaloneDocumentType;
  patientPhone: string | null;
  patientName: string;
  doctorName: string | null;
}

export function StandaloneSharePanel({
  docId,
  patientPhone,
  patientName,
  doctorName,
}: StandaloneSharePanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; code: string; expiresAt: string } | null>(
    null,
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  async function share() {
    setLoading(true);
    setError(null);
    try {
      const res = await shareStandaloneDocument(docId);
      if (!res.ok || !res.data) {
        setError(res.error ?? 'Error al generar el enlace.');
        return;
      }
      setResult(res.data);
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, kind: 'url' | 'code') {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      /* ignore */
    }
  }

  function shareWhatsApp() {
    if (!result) return;
    const message =
      `Hola ${patientName}, aquí está tu documento médico.\n\n` +
      `Enlace: ${result.url}\nCódigo de acceso: ${result.code}` +
      (doctorName ? `\n\n${doctorName}` : '');
    const url = patientPhone
      ? `https://wa.me/${patientPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeStyle: 'short' }).format(
      new Date(iso),
    );
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="flex-1 text-xs font-mono text-slate-700 truncate">{result.url}</span>
          <button
            onClick={() => void copyToClipboard(result.url, 'url')}
            className="text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-200 transition-colors text-slate-600"
          >
            {copiedUrl ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="flex-1 font-mono text-lg font-bold tracking-widest text-slate-800">
            {result.code}
          </span>
          <button
            onClick={() => void copyToClipboard(result.code, 'code')}
            className="text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-200 transition-colors text-slate-600"
          >
            {copiedCode ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="text-xs text-slate-400">Vence el {formatDate(result.expiresAt)}.</p>
        <button
          onClick={shareWhatsApp}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: '#25D366' }}
        >
          Enviar por WhatsApp
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        onClick={() => void share()}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
        {loading ? 'Generando enlace…' : 'Generar enlace y enviar'}
      </button>
    </div>
  );
}

// Re-export for page usage (used as a named trigger in list page rows)
export { GenerateStandaloneDocumentModal };
