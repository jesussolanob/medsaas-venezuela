'use client';

/**
 * ShareDocumentsModal — v3 (2026-11)
 *
 * Cambios respecto a v2:
 *  - Sección "Adjuntos" debajo de los tipos de documento:
 *    (a) Checklist de documentos frecuentes del doctor (cargados al abrir el modal).
 *    (b) "Subir desde tu computador" — archivos puntuales, no se guardan en biblioteca.
 *  - Límite: 10 adjuntos en total, 25 MB entre todos.
 *  - Se permite compartir solo con adjuntos (sin seleccionar tipos de documento).
 *  - `attachments` se incluye en el POST solo cuando hay algo.
 *  - La pantalla de éxito menciona cuántos adjuntos se incluyeron.
 *  - El selector de adjuntos se oculta cuando standaloneDocumentId está presente.
 */

import { useState, useRef } from 'react';
import {
  Share2,
  X,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageCircle,
  ChevronDown,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Upload,
  ExternalLink,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { normalizePhoneVE } from '@/lib/phone-utils';
import { reportError } from '@/lib/report-error';
import type { ContentBlock } from '@/components/pdf/MedicalDocumentPdf';
import {
  type DocumentTypeKey,
  type SavedPrescription,
  computeAvailableDocTypes,
  INFORME_EXCLUDED_KEYS,
  INFORME_CHECKED_BY_DEFAULT,
} from './consultation-documents';
import type { DoctorDocumentFileListItem } from '@delta/shared-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_ATTACH_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShareResult {
  url: string;
  code: string;
  expiresAt: string;
}

/** A one-off upload that the doctor attached for this share only. */
interface PendingUpload {
  /** Local key for the UI list. */
  localId: string;
  file: File;
  /** Set after a successful /api/storage/upload call. */
  filePath: string | null;
  uploading: boolean;
  error: string | null;
}

interface Props {
  consultationId: string;
  standaloneDocumentId?: string;
  patientPhone?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  informeContent: ContentBlock[];
  savedPrescriptions: SavedPrescription[];
  patientConsultationCount: number;
  patientEhrCount: number;
  restContent: string | null;
  onBeforeShare?: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <FileText className="w-3.5 h-3.5 text-red-500" />;
  return <ImageIcon className="w-3.5 h-3.5 text-sky-500" />;
}

function validateAttachFile(file: File): string | null {
  if (!ALLOWED_ATTACH_MIME.has(file.type)) {
    return `Tipo no permitido (${file.type || 'desconocido'}). Usa PDF, JPEG, PNG o WEBP.`;
  }
  if (file.size > MAX_SINGLE_FILE_BYTES) {
    return `El archivo pesa ${formatBytes(file.size)}. Máximo por archivo: 10 MB.`;
  }
  return null;
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

function BlockSubSelector({ informeContent, checkedKeys, onToggle }: BlockSubSelectorProps) {
  const eligibleBlocks = informeContent.filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key));
  if (eligibleBlocks.length === 0) return null;

  return (
    <div className="px-3.5 pb-3.5 pt-0 border-t border-teal-100">
      <div className="flex items-center gap-1.5 mt-2 mb-2">
        <ChevronDown className="w-3 h-3 text-teal-500" />
        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">
          Bloques de consulta a incluir
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {eligibleBlocks.map((block) => (
          <label
            key={block.key}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              checkedKeys.has(block.key)
                ? 'bg-teal-100 border-teal-200 text-teal-800 font-medium'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={checkedKeys.has(block.key)}
              onChange={() => onToggle(block.key)}
              className="w-3 h-3 accent-teal-500 shrink-0"
            />
            <span className="truncate">{block.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Attachments section ──────────────────────────────────────────────────────

interface AttachmentsSectionProps {
  libraryFiles: DoctorDocumentFileListItem[];
  libraryLoading: boolean;
  selectedLibraryIds: Set<string>;
  onToggleLibrary: (id: string) => void;
  pendingUploads: PendingUpload[];
  onAddFile: (file: File) => void;
  onRemoveUpload: (localId: string) => void;
  totalCount: number;
  totalBytes: number;
  limitError: string | null;
}

function AttachmentsSection({
  libraryFiles,
  libraryLoading,
  selectedLibraryIds,
  onToggleLibrary,
  pendingUploads,
  onAddFile,
  onRemoveUpload,
  totalCount,
  totalBytes,
  limitError,
}: AttachmentsSectionProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => onAddFile(f));
    e.target.value = '';
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Paperclip className="w-3.5 h-3.5 text-slate-500" />
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Adjuntos</p>
        </div>
        <span className="text-xs text-slate-400">
          {totalCount}/{MAX_ATTACHMENTS} · {formatBytes(totalBytes)} / 25 MB
        </span>
      </div>

      <div className="p-3.5 space-y-3">
        {/* Library list */}
        {libraryLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando biblioteca…
          </div>
        ) : libraryFiles.length === 0 ? (
          <p className="text-xs text-slate-400">
            Tu biblioteca está vacía.{' '}
            <a
              href="/doctor/templates"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 font-semibold hover:underline inline-flex items-center gap-0.5"
            >
              Gestionar en Plantillas <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600">Tu biblioteca</p>
              <a
                href="/doctor/templates"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-600 font-semibold hover:underline inline-flex items-center gap-0.5"
              >
                Gestionar <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
              {libraryFiles.map((f) => {
                const checked = selectedLibraryIds.has(f.id);
                const disabled = !checked && totalCount >= MAX_ATTACHMENTS;
                return (
                  <label
                    key={f.id}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                      disabled
                        ? 'opacity-50 cursor-not-allowed border-slate-100 bg-slate-50'
                        : checked
                          ? 'bg-teal-50 border-teal-200 cursor-pointer'
                          : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleLibrary(f.id)}
                      disabled={disabled}
                      className="w-3 h-3 accent-teal-500 shrink-0"
                    />
                    {fileTypeIcon(f.mimeType)}
                    <span className="flex-1 truncate font-medium text-slate-700">{f.name}</span>
                    <span className="text-slate-400 shrink-0">{formatBytes(f.sizeBytes)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* One-off upload */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-600">Subir desde tu computador</p>
          {pendingUploads.length > 0 && (
            <div className="space-y-1">
              {pendingUploads.map((u) => (
                <div
                  key={u.localId}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                    u.error
                      ? 'border-red-200 bg-red-50'
                      : u.filePath
                        ? 'border-teal-200 bg-teal-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  {u.uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500 shrink-0" />
                  ) : u.error ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  ) : (
                    fileTypeIcon(u.file.type)
                  )}
                  <span className="flex-1 truncate text-slate-700">
                    {u.file.name}
                    {u.error && <span className="text-red-600 ml-1">— {u.error}</span>}
                  </span>
                  <span className="text-slate-400 shrink-0">{formatBytes(u.file.size)}</span>
                  <button
                    onClick={() => onRemoveUpload(u.localId)}
                    disabled={u.uploading}
                    className="shrink-0 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={totalCount >= MAX_ATTACHMENTS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50 text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" />
            Adjuntar archivo
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Limit error */}
        {limitError && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{limitError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShareDocumentsModal({
  consultationId,
  standaloneDocumentId,
  patientPhone,
  patientName,
  doctorName,
  informeContent,
  savedPrescriptions,
  patientConsultationCount,
  patientEhrCount,
  restContent,
  onBeforeShare,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<DocumentTypeKey>>(new Set());
  const [informeCheckedKeys, setInformeCheckedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Attachments state
  const [libraryFiles, setLibraryFiles] = useState<DoctorDocumentFileListItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [attachLimitError, setAttachLimitError] = useState<string | null>(null);
  const [attachTotalSuccessCount, setAttachTotalSuccessCount] = useState(0);

  const availableTypes = computeAvailableDocTypes({
    informeContent,
    savedPrescriptions,
    patientConsultationCount,
    patientEhrCount,
    restContent,
  });

  // Counts for attachment limits
  const uploadedCount = pendingUploads.filter((u) => u.filePath !== null).length;
  const uploadingCount = pendingUploads.filter((u) => u.uploading).length;
  const totalAttachCount = selectedLibraryIds.size + uploadedCount;
  const totalAttachBytes =
    libraryFiles.filter((f) => selectedLibraryIds.has(f.id)).reduce((s, f) => s + f.sizeBytes, 0) +
    pendingUploads.filter((u) => u.filePath !== null).reduce((s, u) => s + u.file.size, 0);

  async function fetchLibrary() {
    setLibraryLoading(true);
    try {
      const res = await fetch('/api/doctor/document-files');
      const json = (await res.json()) as
        | { success: true; data: { files: DoctorDocumentFileListItem[] } }
        | { error: string };
      if (res.ok && 'success' in json) {
        setLibraryFiles(json.data.files ?? []);
      }
    } catch {
      /* non-fatal: library just shows empty */
    } finally {
      setLibraryLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    setError(null);
    setResult(null);
    setCopiedUrl(false);
    setCopiedCode(false);
    setAttachLimitError(null);
    setAttachTotalSuccessCount(0);
    setSelectedLibraryIds(new Set());
    setPendingUploads([]);

    const firstEnabled = availableTypes.find((t) => t.enabled);
    setSelectedTypes(firstEnabled ? new Set([firstEnabled.key]) : new Set());

    const defaults = informeContent
      .filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key) && INFORME_CHECKED_BY_DEFAULT.has(b.key))
      .map((b) => b.key);
    setInformeCheckedKeys(new Set(defaults));

    // Load library when opening (not for standalone docs — no attachments shown there)
    if (!standaloneDocumentId) {
      void fetchLibrary();
    }
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  function toggleType(key: DocumentTypeKey) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleInformeBlock(key: string) {
    setInformeCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleLibraryFile(id: string) {
    setAttachLimitError(null);
    setSelectedLibraryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      const newCount = next.size + uploadedCount;
      if (newCount >= MAX_ATTACHMENTS) {
        setAttachLimitError(`Máximo ${MAX_ATTACHMENTS} adjuntos por enlace.`);
        return prev;
      }
      next.add(id);
      return next;
    });
  }

  async function addUploadFile(file: File) {
    setAttachLimitError(null);

    const validErr = validateAttachFile(file);
    if (validErr) {
      setAttachLimitError(validErr);
      return;
    }

    const currentCount =
      selectedLibraryIds.size + pendingUploads.filter((u) => u.filePath !== null).length;
    if (currentCount >= MAX_ATTACHMENTS) {
      setAttachLimitError(`Máximo ${MAX_ATTACHMENTS} adjuntos por enlace.`);
      return;
    }

    const totalBytes = totalAttachBytes + file.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      setAttachLimitError(`El total de adjuntos supera 25 MB.`);
      return;
    }

    const localId = `${Date.now()}-${Math.random()}`;
    const pending: PendingUpload = { localId, file, filePath: null, uploading: true, error: null };
    setPendingUploads((prev) => [...prev, pending]);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'document');
      const res = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const json = (await res.json()) as
        | { success: true; data: { url: string; path: string } }
        | { success: false; error: { message: string } };

      if (!res.ok || !('success' in json) || !json.success) {
        const msg =
          'error' in json ? (json.error?.message ?? 'Error al subir') : 'Error al subir el archivo';
        setPendingUploads((prev) =>
          prev.map((u) => (u.localId === localId ? { ...u, uploading: false, error: msg } : u)),
        );
        return;
      }

      setPendingUploads((prev) =>
        prev.map((u) =>
          u.localId === localId ? { ...u, uploading: false, filePath: json.data.path } : u,
        ),
      );
    } catch (err: unknown) {
      reportError('doctor/consultations', 'ShareDocumentsModal:addUploadFile', err);
      setPendingUploads((prev) =>
        prev.map((u) =>
          u.localId === localId
            ? { ...u, uploading: false, error: 'No se pudo conectar con el servidor.' }
            : u,
        ),
      );
    }
  }

  function removeUpload(localId: string) {
    setPendingUploads((prev) => prev.filter((u) => u.localId !== localId));
  }

  // A submission is valid if: ≥1 doc type selected, OR ≥1 attachment (library or uploaded).
  // No pending uploads in progress.
  const hasDocSelection = selectedTypes.size > 0;
  const hasAttachments = selectedLibraryIds.size > 0 || uploadedCount > 0;
  const hasSelection = hasDocSelection || hasAttachments;
  const isBlocked = uploadingCount > 0;

  async function handleSubmit() {
    if (!hasSelection || loading || isBlocked) return;

    setLoading(true);
    setError(null);

    if (onBeforeShare) {
      try {
        await onBeforeShare();
      } catch {
        /* best-effort */
      }
    }

    const types = Array.from(selectedTypes);
    const informeBlockKeys = Array.from(informeCheckedKeys);

    const doc_selection = {
      types,
      informeBlockKeys,
      restContent: restContent ?? null,
    };

    const sections = {
      report: types.includes('informe'),
      prescriptions: types.includes('recipe'),
      ehr: types.includes('history'),
    };

    // Build attachments payload — only when non-empty
    const uploadedSucceeded = pendingUploads.filter((u) => u.filePath !== null);
    const attachmentsPayload =
      selectedLibraryIds.size > 0 || uploadedSucceeded.length > 0
        ? {
            libraryFileIds: Array.from(selectedLibraryIds),
            uploads: uploadedSucceeded.map((u) => ({
              name: u.file.name,
              filePath: u.filePath as string,
              mimeType: u.file.type,
              sizeBytes: u.file.size,
            })),
          }
        : undefined;

    // Track total attachments for success screen
    const totalAttach =
      (attachmentsPayload?.libraryFileIds?.length ?? 0) +
      (attachmentsPayload?.uploads?.length ?? 0);

    try {
      const shareUrl = standaloneDocumentId
        ? `/api/standalone-documents/${standaloneDocumentId}/share`
        : `/api/consultations/${consultationId}/share`;

      const res = await fetch(shareUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections,
          doc_selection,
          ...(attachmentsPayload ? { attachments: attachmentsPayload } : {}),
        }),
      });

      const json = (await res.json()) as { success: true; data: ShareResult } | { error: string };

      if (!res.ok || !('success' in json)) {
        const errMsg = 'error' in json ? json.error : 'Error al generar el enlace';
        setError(errMsg);
        showToast({ type: 'error', message: errMsg });
        return;
      }

      setAttachTotalSuccessCount(totalAttach);
      setResult(json.data);
      showToast({ type: 'success', message: 'Enlace de documentos generado' });
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function shareViaWhatsApp() {
    if (!result) return;
    const phone = normalizePhoneVE(patientPhone);
    const saludo = patientName ? `Hola ${patientName}, ` : 'Hola, ';
    const firma = doctorName ? `\n\n${doctorName}` : '';
    const message =
      `${saludo}aquí están los documentos de tu consulta.\n\n` +
      `Enlace: ${result.url}\n` +
      `Código de acceso: ${result.code}\n\n` +
      `El enlace vence el ${formatDate(result.expiresAt)}. Cualquier duda quedo a tu orden.${firma}`;
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
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
      /* ignore clipboard errors */
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Share2 className="w-4 h-4 text-teal-500" />
        Compartir documentos
      </button>

      {/* Modal backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Share2 className="w-4 h-4 text-teal-600" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Compartir documentos</h2>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="px-5 py-5 space-y-5 overflow-y-auto">
              {!result ? (
                <>
                  <p className="text-sm text-slate-500">
                    Selecciona qué documentos y/o adjuntos quieres compartir. El paciente recibe un
                    enlace con código de acceso de 6 dígitos.
                  </p>

                  {/* Doc type cards */}
                  <div className="space-y-2">
                    {availableTypes.map((dt) => (
                      <DocTypeCard
                        key={dt.key}
                        label={dt.label}
                        description={dt.description}
                        enabled={dt.enabled}
                        checked={selectedTypes.has(dt.key)}
                        onChange={() => {
                          if (!dt.enabled) return;
                          toggleType(dt.key);
                        }}
                      >
                        {dt.key === 'informe' && selectedTypes.has('informe') && dt.enabled ? (
                          <BlockSubSelector
                            informeContent={informeContent}
                            checkedKeys={informeCheckedKeys}
                            onToggle={toggleInformeBlock}
                          />
                        ) : null}
                      </DocTypeCard>
                    ))}
                  </div>

                  {/* Attachments section — hidden for standalone docs */}
                  {!standaloneDocumentId && (
                    <AttachmentsSection
                      libraryFiles={libraryFiles}
                      libraryLoading={libraryLoading}
                      selectedLibraryIds={selectedLibraryIds}
                      onToggleLibrary={toggleLibraryFile}
                      pendingUploads={pendingUploads}
                      onAddFile={addUploadFile}
                      onRemoveUpload={removeUpload}
                      totalCount={totalAttachCount}
                      totalBytes={totalAttachBytes}
                      limitError={attachLimitError}
                    />
                  )}

                  {/* Validation hint */}
                  {!hasSelection && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Selecciona al menos un tipo de documento o agrega un adjunto
                    </p>
                  )}

                  {isBlocked && (
                    <p className="text-xs text-teal-600 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      Subiendo archivos adjuntos…
                    </p>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!hasSelection || loading || isBlocked}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generando enlace...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4" />
                        Generar enlace y enviar
                      </>
                    )}
                  </button>
                </>
              ) : (
                /* Success state */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <p className="text-sm font-medium">
                      Se envió un email al paciente con el enlace y el código.
                      {attachTotalSuccessCount > 0 && (
                        <>
                          {' '}
                          Incluye{' '}
                          <strong>
                            {attachTotalSuccessCount}{' '}
                            {attachTotalSuccessCount === 1 ? 'adjunto' : 'adjuntos'}
                          </strong>{' '}
                          para descarga individual.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Link */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Enlace de descarga
                    </p>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-xs font-mono text-slate-700 break-all truncate">
                        {result.url}
                      </span>
                      <button
                        onClick={() => copyToClipboard(result.url, 'url')}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-200 transition-colors text-slate-600"
                      >
                        {copiedUrl ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedUrl ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Code */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Código de acceso
                    </p>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 font-mono text-xl font-bold tracking-widest text-slate-800">
                        {result.code}
                      </span>
                      <button
                        onClick={() => copyToClipboard(result.code, 'code')}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-200 transition-colors text-slate-600"
                      >
                        {copiedCode ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedCode ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Expiry */}
                  <p className="text-xs text-slate-400">
                    El enlace vence el{' '}
                    <span className="text-slate-600 font-medium">
                      {formatDate(result.expiresAt)}
                    </span>
                    . Pasada esa fecha el paciente deberá solicitar uno nuevo.
                  </p>

                  {/* WhatsApp */}
                  <button
                    onClick={shareViaWhatsApp}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition-colors"
                    style={{ background: '#25D366' }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Enviar por WhatsApp
                  </button>

                  {/* Close */}
                  <button
                    onClick={handleClose}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
