'use client';

/**
 * FrequentDocumentsTab — Biblioteca de documentos frecuentes del especialista.
 *
 * Permite subir PDFs e imágenes una vez y adjuntarlos al compartir
 * documentos con pacientes sin necesidad de volver a subirlos.
 *
 * Límites:
 *  - 50 archivos por biblioteca (error del backend)
 *  - 10 MB por archivo (validado en cliente)
 *  - Tipos: PDF, JPEG, PNG, WEBP
 */

import { useState, useEffect, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Upload,
  Loader2,
  Trash2,
  Pencil,
  Eye,
  X,
  Check,
  AlertCircle,
  FolderOpen,
  PlusCircle,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { reportError } from '@/lib/report-error';
import type {
  DoctorDocumentFileListItem,
  DoctorDocumentFileCreatedResponse,
} from '@delta/shared-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileNameWithoutExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot > 0) return name.slice(0, lastDot);
  return name;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `Tipo de archivo no permitido (${file.type || 'desconocido'}). Usa PDF, JPEG, PNG o WEBP.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `El archivo pesa ${formatBytes(file.size)}. El máximo es 10 MB.`;
  }
  return null;
}

// ─── Sub-component: File icon ─────────────────────────────────────────────────

function FileTypeIcon({
  mimeType,
  className = 'w-5 h-5',
}: {
  mimeType: string;
  className?: string;
}) {
  if (mimeType === 'application/pdf') {
    return <FileText className={`${className} text-red-500`} />;
  }
  return <ImageIcon className={`${className} text-sky-500`} />;
}

// ─── Sub-component: Confirm delete modal ─────────────────────────────────────

interface ConfirmDeleteModalProps {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function ConfirmDeleteModal({ fileName, onConfirm, onCancel, deleting }: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-red-500" />
          </div>
          <h2 className="text-base font-bold text-slate-800">Eliminar archivo</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            ¿Eliminar <span className="font-semibold text-slate-800">{fileName}</span> de tu
            biblioteca? Esta acción es definitiva.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-bold text-white transition-colors disabled:opacity-60"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: Upload zone ───────────────────────────────────────────────

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

function UploadZone({ onFileSelected, disabled = false }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setValidationError(null);
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div>
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all p-6 ${
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
            : dragActive
              ? 'border-teal-500 bg-teal-50 scale-[1.01]'
              : 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/50'
        }`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Área de carga de archivos"
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <div className={`rounded-full p-3 shadow-sm ${dragActive ? 'bg-teal-100' : 'bg-white'}`}>
            {dragActive ? (
              <Upload className="w-6 h-6 text-teal-600" />
            ) : (
              <PlusCircle className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {dragActive ? 'Suelta aquí el archivo' : 'Subir documento'}
          </p>
          <p className="text-xs text-slate-400">
            Arrastra o haz clic · PDF, JPEG, PNG, WEBP · máximo 10 MB
          </p>
        </div>
      </div>
      {validationError && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: Stage-upload panel ───────────────────────────────────────

interface UploadStagingProps {
  file: File;
  onCancel: () => void;
  onSaved: (item: DoctorDocumentFileListItem) => void;
}

function UploadStaging({ file, onCancel, onSaved }: UploadStagingProps) {
  const [name, setName] = useState(fileNameWithoutExtension(file.name));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (trimmedName.length > 120) {
      setError('El nombre no puede superar 120 caracteres.');
      return;
    }
    setUploading(true);
    setError(null);

    try {
      // 1. Upload file to storage
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'document');
      const storageRes = await fetch('/api/storage/upload', { method: 'POST', body: fd });
      const storageJson = (await storageRes.json()) as
        | { success: true; data: { url: string; path: string } }
        | { success: false; error: { message: string } };

      if (!storageRes.ok || !('success' in storageJson) || !storageJson.success) {
        const msg =
          'error' in storageJson
            ? (storageJson.error?.message ?? 'Error al subir el archivo')
            : 'Error al subir el archivo';
        setError(msg);
        return;
      }

      const filePath = storageJson.data.path;

      // 2. Register in library
      const registerRes = await fetch('/api/doctor/document-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          filePath,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const registerJson = (await registerRes.json()) as
        | { success: true; data: DoctorDocumentFileCreatedResponse }
        | { error: string };

      if (!registerRes.ok || !('success' in registerJson)) {
        const msg = 'error' in registerJson ? registerJson.error : 'Error al registrar el archivo';
        setError(msg);
        return;
      }

      const created = registerJson.data;
      showToast({ type: 'success', message: `"${created.name}" guardado en tu biblioteca.` });
      onSaved({
        id: created.id,
        name: created.name,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        createdAt: created.createdAt,
      });
    } catch (err: unknown) {
      reportError('doctor/templates', 'UploadStaging:handleSave', err);
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white border-2 border-teal-300 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
          <FileTypeIcon mimeType={file.type} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 truncate">
            {file.name} · {formatBytes(file.size)}
          </p>
          <div className="mt-1.5">
            <label htmlFor="doc-name" className="text-xs font-semibold text-slate-600 mb-1 block">
              Nombre en la biblioteca
            </label>
            <input
              id="doc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Nombre del documento"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
            {error && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {error}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" /> Guardar en biblioteca
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={uploading}
          className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Sub-component: Library item row ─────────────────────────────────────────

interface LibraryItemProps {
  item: DoctorDocumentFileListItem;
  onRenamed: (id: string, newName: string) => void;
  onDeleted: (id: string) => void;
}

function LibraryItem({ item, onRenamed, onDeleted }: LibraryItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(item.name);
  const [savingRename, setSavingRename] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleView() {
    if (fetchingUrl) return;
    setFetchingUrl(true);
    try {
      const res = await fetch(`/api/doctor/document-files/${item.id}/url`);
      const json = (await res.json()) as
        | { success: true; data: { url: string } }
        | { error: string };
      if (!res.ok || !('success' in json)) {
        showToast({
          type: 'error',
          message: 'error' in json ? json.error : 'No se pudo obtener el enlace',
        });
        return;
      }
      window.open(json.data.url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      reportError('doctor/templates', 'LibraryItem:handleView', err);
      showToast({ type: 'error', message: 'Error al obtener la vista previa.' });
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleRenameSubmit() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setRenameError('El nombre no puede estar vacío.');
      return;
    }
    if (trimmed.length > 120) {
      setRenameError('Máximo 120 caracteres.');
      return;
    }
    if (trimmed === item.name) {
      setRenaming(false);
      return;
    }
    setSavingRename(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/doctor/document-files/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = (await res.json()) as { success: true } | { error: string };
      if (!res.ok || !('success' in json)) {
        setRenameError('error' in json ? json.error : 'Error al renombrar');
        return;
      }
      onRenamed(item.id, trimmed);
      setRenaming(false);
      showToast({ type: 'success', message: 'Nombre actualizado.' });
    } catch (err: unknown) {
      reportError('doctor/templates', 'LibraryItem:handleRenameSubmit', err);
      setRenameError('Error al guardar el nombre.');
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/doctor/document-files/${item.id}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: true } | { error: string };
      if (!res.ok || !('success' in json)) {
        const msg = 'error' in json ? json.error : 'Error al eliminar';
        showToast({ type: 'error', message: msg });
        return;
      }
      onDeleted(item.id);
      showToast({ type: 'success', message: `"${item.name}" eliminado de la biblioteca.` });
    } catch (err: unknown) {
      reportError('doctor/templates', 'LibraryItem:handleDelete', err);
      showToast({ type: 'error', message: 'Error al eliminar el archivo.' });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const dateLabel = new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(item.createdAt));

  return (
    <>
      {confirmDelete && (
        <ConfirmDeleteModal
          fileName={item.name}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          deleting={deleting}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start gap-3 group hover:border-slate-300 transition-colors">
        {/* Icon */}
        <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
          <FileTypeIcon mimeType={item.mimeType} className="w-4 h-4" />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={120}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') {
                    setRenaming(false);
                    setNameInput(item.name);
                    setRenameError(null);
                  }
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-teal-300 text-sm outline-none focus:ring-2 focus:ring-teal-100"
              />
              {renameError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> {renameError}
                </p>
              )}
              <div className="flex gap-1.5">
                <button
                  onClick={handleRenameSubmit}
                  disabled={savingRename}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
                >
                  {savingRename ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  Guardar
                </button>
                <button
                  onClick={() => {
                    setRenaming(false);
                    setNameInput(item.name);
                    setRenameError(null);
                  }}
                  className="px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {item.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'} ·{' '}
                {formatBytes(item.sizeBytes)} · {dateLabel}
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        {!renaming && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleView}
              disabled={fetchingUrl}
              title="Ver archivo"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-teal-600 transition-colors disabled:opacity-50"
            >
              {fetchingUrl ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => setRenaming(true)}
              title="Renombrar"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar"
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FrequentDocumentsTab() {
  const [files, setFiles] = useState<DoctorDocumentFileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/doctor/document-files');
      const json = (await res.json()) as
        | { success: true; data: { files: DoctorDocumentFileListItem[] } }
        | { error: string };
      if (!res.ok || !('success' in json)) {
        setLoadError('error' in json ? json.error : 'No se pudieron cargar los archivos.');
        return;
      }
      setFiles(json.data.files ?? []);
    } catch (err: unknown) {
      reportError('doctor/templates', 'FrequentDocumentsTab:fetchFiles', err);
      setLoadError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  function handleFileSelected(file: File) {
    setStagedFile(file);
  }

  function handleStagedCancelled() {
    setStagedFile(null);
  }

  function handleSaved(item: DoctorDocumentFileListItem) {
    setFiles((prev) => [item, ...prev]);
    setStagedFile(null);
  }

  function handleRenamed(id: string, newName: string) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName } : f)));
  }

  function handleDeleted(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-5">
      {/* Explanation card */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
        <FolderOpen className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-teal-800">Tu biblioteca de documentos frecuentes</p>
          <p className="text-xs text-teal-700 mt-0.5 leading-relaxed">
            Sube PDFs o imágenes que envías seguido — por ejemplo tareas, guías de alimentación o
            instrucciones preoperatorias — y adjúntalos al compartir documentos con tus pacientes.
            El paciente descarga cada adjunto por separado (no se mezclan en el PDF). Límite:{' '}
            <strong>50 archivos</strong>.
          </p>
        </div>
      </div>

      {/* Upload zone or staging */}
      {stagedFile ? (
        <UploadStaging file={stagedFile} onCancel={handleStagedCancelled} onSaved={handleSaved} />
      ) : (
        <UploadZone onFileSelected={handleFileSelected} disabled={files.length >= 50} />
      )}

      {/* Files list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-700">
            Archivos en biblioteca{' '}
            <span className="text-slate-400 font-normal">({files.length}/50)</span>
          </p>
          {loadError && (
            <button
              onClick={() => {
                setLoading(true);
                void fetchFiles();
              }}
              className="text-xs text-teal-600 font-semibold hover:underline"
            >
              Reintentar
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}

        {!loading && loadError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && files.length === 0 && (
          <div className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center space-y-2">
            <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-500">Tu biblioteca está vacía</p>
            <p className="text-xs text-slate-400">
              Sube tu primer documento usando el área de arriba.
            </p>
          </div>
        )}

        {!loading && !loadError && files.length > 0 && (
          <div className="space-y-2">
            {files.map((file) => (
              <LibraryItem
                key={file.id}
                item={file}
                onRenamed={handleRenamed}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
