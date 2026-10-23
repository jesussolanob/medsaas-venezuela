'use client';

/**
 * app/doctor/standalone-documents/page.tsx
 *
 * "Recipes y paraclínicos" — list of standalone documents for the doctor.
 * Shows: tipo, código, paciente, fecha, estado (Borrador/Emitido/Anulado).
 * Actions: Ver/Descargar PDF (issued/voided), Editar/Eliminar (draft), Compartir (issued), Anular (issued).
 * Filters: tipo, estado, búsqueda por nombre de paciente.
 * Button "Generar recipe/paraclínico" opens GenerateStandaloneDocumentModal.
 *
 * Gated by `features.standalone_documents`. Shows empty state or
 * a locked notice if feature is off.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Download,
  Trash2,
  XCircle,
  Search,
  Loader2,
  AlertCircle,
  FilePlus,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { useDoctorFeatures } from '@/hooks/useDoctorFeatures';
import GenerateStandaloneDocumentModal, {
  StandaloneSharePanel,
} from '@/components/doctor/GenerateStandaloneDocumentModal';
import {
  listStandaloneDocuments,
  getStandaloneDocument,
  deleteDraftStandaloneDocument,
  voidStandaloneDocument,
  type StandaloneDocumentSummary,
  type StandaloneDocumentType,
  type StandaloneDocumentStatus,
  type StandaloneDocument,
} from './actions';
import {
  loadStandalonePdfDoctorData,
  buildStandalonePdfInput,
  downloadStandalonePdf,
} from './standalone-pdf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

const TYPE_LABELS: Record<StandaloneDocumentType, string> = {
  recipe: 'Récipe',
  paraclinical: 'Paraclínicos',
  reposo: 'Reposo',
};

const STATUS_LABELS: Record<StandaloneDocumentStatus, string> = {
  draft: 'Borrador',
  issued: 'Emitido',
  voided: 'Anulado',
};

const STATUS_CLASSES: Record<StandaloneDocumentStatus, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  issued: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  voided: 'bg-slate-100 text-slate-500 border-slate-200',
};

// ---------------------------------------------------------------------------
// Void confirm dialog
// ---------------------------------------------------------------------------

interface VoidDialogProps {
  doc: StandaloneDocumentSummary;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

function VoidDialog({ doc, onConfirm, onCancel }: VoidDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm(reason);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <h2 className="text-base font-bold text-slate-800">Anular documento</h2>
        </div>
        <p className="text-sm text-slate-600">
          ¿Deseas anular el documento <span className="font-mono font-semibold">{doc.code}</span>?
          Esta acción no se puede deshacer.
        </p>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Motivo <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Error en los datos..."
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-red-300 outline-none resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="flex-1 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? 'Anulando…' : 'Anular'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function StandaloneDocumentsPage() {
  const { features, loading: featuresLoading } = useDoctorFeatures();

  const [docs, setDocs] = useState<StandaloneDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<StandaloneDocumentType | ''>('');
  const [filterStatus, setFilterStatus] = useState<StandaloneDocumentStatus | ''>('');
  const [voidTarget, setVoidTarget] = useState<StandaloneDocumentSummary | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<StandaloneDocument | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [shareDoc, setShareDoc] = useState<StandaloneDocumentSummary | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listStandaloneDocuments();
      setDocs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!featuresLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDocs();
    }
  }, [loadDocs, featuresLoading, refreshKey]);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleDelete(doc: StandaloneDocumentSummary) {
    if (!confirm(`¿Eliminar el borrador "${doc.type}" del paciente ${doc.patientName}?`)) return;
    const res = await deleteDraftStandaloneDocument(doc.id);
    if (res.ok) {
      showToast({ type: 'success', message: 'Borrador eliminado' });
      refresh();
    } else {
      showToast({ type: 'error', message: res.error ?? 'Error al eliminar' });
    }
  }

  async function handleVoid(doc: StandaloneDocumentSummary, reason: string) {
    const res = await voidStandaloneDocument(doc.id, reason);
    if (res.ok) {
      showToast({ type: 'success', message: 'Documento anulado' });
      setVoidTarget(null);
      refresh();
    } else {
      showToast({ type: 'error', message: res.error ?? 'Error al anular' });
    }
  }

  async function handleDownload(doc: StandaloneDocumentSummary) {
    setDownloadingId(doc.id);
    try {
      const full = await getStandaloneDocument(doc.id);
      if (!full) {
        showToast({ type: 'error', message: 'No se encontró el documento.' });
        return;
      }
      const doctorData = await loadStandalonePdfDoctorData();
      if (!doctorData) {
        showToast({ type: 'error', message: 'No se pudo cargar la configuración del doctor.' });
        return;
      }
      const input = buildStandalonePdfInput(full, doctorData);
      await downloadStandalonePdf(input);
    } catch (err: unknown) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error al generar el PDF.',
      });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleEditDraft(doc: StandaloneDocumentSummary) {
    const full = await getStandaloneDocument(doc.id);
    if (!full) {
      showToast({ type: 'error', message: 'No se pudo cargar el borrador.' });
      return;
    }
    setEditDraft(full);
  }

  // Filter
  const filtered = docs.filter((d) => {
    const matchType = !filterType || d.type === filterType;
    const matchStatus = !filterStatus || d.status === filterStatus;
    const matchSearch = !search || d.patientName.toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  // Feature guard
  if (!featuresLoading && !features.standalone_documents) {
    return (
      <div className="p-6 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-amber-400" />
        <p className="text-slate-600 text-sm max-w-sm">
          El módulo de Recipes y paraclínicos no está disponible en tu plan actual.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Recipes y paraclínicos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Documentos médicos emitidos sin consulta</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500"
            aria-label="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Generar recipe/paraclínico
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar por paciente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as StandaloneDocumentType | '')}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:border-teal-400 outline-none bg-white"
        >
          <option value="">Todos los tipos</option>
          <option value="recipe">Récipe</option>
          <option value="paraclinical">Paraclínicos</option>
          <option value="reposo">Reposo</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StandaloneDocumentStatus | '')}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:border-teal-400 outline-none bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="issued">Emitido</option>
          <option value="voided">Anulado</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando documentos…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center">
            <FilePlus className="w-7 h-7 text-teal-400" />
          </div>
          <p className="text-slate-600 font-semibold">
            {docs.length === 0 ? 'Aún no hay documentos' : 'Sin resultados para tu búsqueda'}
          </p>
          {docs.length === 0 && (
            <p className="text-sm text-slate-400 max-w-xs">
              Genera tu primer récipe o paraclínico desde el botón de arriba.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              {/* Info */}
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-teal-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {TYPE_LABELS[doc.type]}
                    </span>
                    {doc.code && (
                      <span className="text-xs font-mono text-slate-500 truncate">{doc.code}</span>
                    )}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${STATUS_CLASSES[doc.status]}`}
                    >
                      {STATUS_LABELS[doc.status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {doc.patientName} · {formatDate(doc.issuedAt ?? doc.createdAt)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {(doc.status === 'issued' || doc.status === 'voided') && (
                  <button
                    onClick={() => void handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    {downloadingId === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    PDF
                  </button>
                )}
                {doc.status === 'issued' && (
                  <>
                    <button
                      onClick={() => setShareDoc(doc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Compartir
                    </button>
                    <button
                      onClick={() => setVoidTarget(doc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Anular
                    </button>
                  </>
                )}
                {doc.status === 'draft' && (
                  <>
                    <button
                      onClick={() => void handleEditDraft(doc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void handleDelete(doc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-400 border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: generate new */}
      {showModal && (
        <GenerateStandaloneDocumentModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            refresh();
          }}
        />
      )}

      {/* Modal: edit draft */}
      {editDraft && (
        <GenerateStandaloneDocumentModal
          open={!!editDraft}
          initialDraft={editDraft}
          onClose={() => setEditDraft(null)}
          onSuccess={() => {
            setEditDraft(null);
            refresh();
          }}
        />
      )}

      {/* Void dialog */}
      {voidTarget && (
        <VoidDialog
          doc={voidTarget}
          onConfirm={(reason) => handleVoid(voidTarget, reason)}
          onCancel={() => setVoidTarget(null)}
        />
      )}

      {/* Share dialog: re-share an issued document from the list */}
      {shareDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800">Compartir documento</h2>
                {shareDoc.code && (
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{shareDoc.code}</p>
                )}
              </div>
              <button
                onClick={() => setShareDoc(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <StandaloneSharePanel
              docId={shareDoc.id}
              docType={shareDoc.type}
              patientPhone={null}
              patientName={shareDoc.patientName}
              doctorName={null}
            />
          </div>
        </div>
      )}
    </div>
  );
}
