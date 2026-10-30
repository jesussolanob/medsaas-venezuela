'use client';

/**
 * /admin/release-notes
 *
 * Admin management of release notes (Novedades de versión).
 * Roles: super_admin, admin.
 *
 * Features:
 *   - List with status filter (Borradores / Publicadas / Todas)
 *   - Pagination via meta.total
 *   - Per-row actions: Editar, Vista previa, Publicar/Despublicar, Eliminar (drafts only)
 *   - Create/edit form in a modal
 *   - Vista previa reuses ReleaseNotesModal (read-only)
 */

import { useEffect, useState, useRef } from 'react';
import {
  Plus,
  Pencil,
  Eye,
  Send,
  Trash2,
  Loader2,
  X,
  Upload,
  ImageOff,
  ArrowLeft,
  RefreshCcw,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import Paginator from '@/components/ui/Paginator';
import { showToast, Toaster } from '@/components/ui/Toaster';
import ReleaseNotesModal, {
  type ReleaseNoteSlide,
} from '@/components/release-notes/ReleaseNotesModal';
import { formatPlanLabel, PLAN_DISPLAY_NAMES } from '@/lib/plan-features';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminReleaseNote {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  audiencePlans: string[] | null;
  publishedAt: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'all' | 'draft' | 'published';

interface NoteFormData {
  title: string;
  body: string;
  imageUrl: string | null; // storage path or null
  imagePreview: string | null; // signed URL for preview
  audiencePlans: string[] | null; // null = all plans
}

const EMPTY_FORM: NoteFormData = {
  title: '',
  body: '',
  imageUrl: null,
  imagePreview: null,
  audiencePlans: null,
};

const PAGE_SIZE = 20;

const PLAN_OPTIONS: { key: string; label: string }[] = Object.entries(PLAN_DISPLAY_NAMES).map(
  ([key, label]) => ({ key, label }),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCaracasDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Caracas',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function audienceLabel(plans: string[] | null): string {
  if (!plans || plans.length === 0) return 'Todos los planes';
  return plans.map(formatPlanLabel).join(', ');
}

// ---------------------------------------------------------------------------
// Form modal component
// ---------------------------------------------------------------------------

interface NoteFormModalProps {
  editing: AdminReleaseNote | null; // null = create new
  onClose: () => void;
  onSaved: () => void;
}

function NoteFormModal({ editing, onClose, onSaved }: NoteFormModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<NoteFormData>(() =>
    editing
      ? {
          title: editing.title,
          body: editing.body,
          imageUrl: editing.imageUrl,
          imagePreview: editing.imageUrl, // will be a signed URL if loaded from list
          audiencePlans: editing.audiencePlans,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Return focus on close.
  const [returnTo] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  useEffect(() => {
    return () => {
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [returnTo]);

  // Focus trap + Escape.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/release-notes/image-upload', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { imageUrl: string; path: string };
        error?: { message?: string };
        message?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        const msg = json.error?.message ?? json.message ?? 'Error al subir la imagen';
        showToast({ type: 'error', message: msg });
        return;
      }
      setForm((f) => ({ ...f, imageUrl: json.data!.path, imagePreview: json.data!.imageUrl }));
    } catch {
      showToast({ type: 'error', message: 'Error de red al subir la imagen.' });
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave() {
    setFormError('');
    if (!form.title.trim()) {
      setFormError('El título es obligatorio.');
      return;
    }
    if (!form.body.trim()) {
      setFormError('El contenido es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        body: form.body.trim(),
        imageUrl: form.imageUrl ?? null,
        audiencePlans: form.audiencePlans,
      };
      const url = editing ? `/api/admin/release-notes/${editing.id}` : '/api/admin/release-notes';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: AdminReleaseNote;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setFormError(json.error ?? 'Error al guardar la novedad.');
        return;
      }
      showToast({
        type: 'success',
        message: editing ? 'Novedad actualizada.' : 'Borrador creado.',
      });
      onSaved();
    } catch {
      setFormError('Error de red al guardar.');
    } finally {
      setSaving(false);
    }
  }

  const titleId = 'note-form-modal-title';
  const allPlansSelected = !form.audiencePlans;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id={titleId} className="font-semibold text-slate-800">
            {editing ? 'Editar novedad' : 'Nueva novedad'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label htmlFor="note-title" className="block text-sm font-medium text-slate-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              id="note-title"
              type="text"
              maxLength={80}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ej: Nueva función de agenda sincronizada"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{form.title.length}/80</p>
          </div>

          {/* Body */}
          <div>
            <label htmlFor="note-body" className="block text-sm font-medium text-slate-700 mb-1">
              Contenido <span className="text-red-500">*</span>
            </label>
            <textarea
              id="note-body"
              maxLength={1500}
              rows={6}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder={
                'Describe la novedad. Escribe en texto simple.\n\nLas líneas que empiecen con "- " se convierten en lista de puntos.'
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 resize-y"
            />
            <p className="text-xs text-slate-400 mt-1 flex justify-between">
              <span>Texto simple. Líneas con &quot;- &quot; se renderizan como lista.</span>
              <span>{form.body.length}/1500</span>
            </p>
          </div>

          {/* Image upload */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Imagen (opcional)</p>
            {form.imagePreview ? (
              <div className="relative rounded-xl overflow-hidden bg-slate-100 aspect-video">
                <Image
                  src={form.imagePreview}
                  alt="Vista previa"
                  fill
                  className="object-cover"
                  sizes="(max-width: 576px) 100vw, 576px"
                />
                <button
                  onClick={() => setForm((f) => ({ ...f, imageUrl: null, imagePreview: null }))}
                  className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-lg hover:bg-white text-slate-600 transition-colors"
                  aria-label="Quitar imagen"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors disabled:opacity-50"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />{' '}
                    <span className="text-sm">Subiendo imagen...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />{' '}
                    <span className="text-sm">Subir imagen (JPG, PNG, WebP)</span>
                  </>
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Audience plans */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Audiencia</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, audiencePlans: null }))}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  allPlansSelected
                    ? 'bg-teal-500 text-white border-teal-500'
                    : 'border-slate-200 text-slate-600 hover:border-teal-400'
                }`}
              >
                Todos los planes
              </button>
              {PLAN_OPTIONS.map(({ key, label }) => {
                const selected = !allPlansSelected && (form.audiencePlans ?? []).includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setForm((f) => {
                        const current = f.audiencePlans ?? [];
                        const next = selected
                          ? current.filter((p) => p !== key)
                          : [...current, key];
                        return { ...f, audiencePlans: next.length ? next : null };
                      });
                    }}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      selected
                        ? 'bg-teal-500 text-white border-teal-500'
                        : 'border-slate-200 text-slate-600 hover:border-teal-400'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Guardar borrador'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ReleaseNotesAdminPage() {
  const [notes, setNotes] = useState<AdminReleaseNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // loadTrigger: increment to request a data reload without calling setState in an effect body.
  const [loadTrigger, setLoadTrigger] = useState(0);

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<AdminReleaseNote | null>(null);
  const [previewNote, setPreviewNote] = useState<AdminReleaseNote | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Data loading — defined inside useEffect so it never triggers react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams({ status: statusFilter });
        params.set('limit', String(pageSize || PAGE_SIZE));
        params.set('offset', String((page - 1) * (pageSize || PAGE_SIZE)));
        const res = await fetch(`/api/admin/release-notes?${params.toString()}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: AdminReleaseNote[];
          meta?: { total: number };
          error?: string;
        };
        if (!res.ok || !json.success) {
          if (!cancelled) setLoadError(json.error ?? 'Error al cargar las novedades.');
          return;
        }
        if (!cancelled) {
          setNotes(json.data ?? []);
          setTotal(json.meta?.total ?? 0);
        }
      } catch {
        if (!cancelled) setLoadError('Error de red al cargar las novedades.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, page, pageSize, loadTrigger]);

  function handleSaved() {
    setShowForm(false);
    setEditingNote(null);
    setLoadTrigger((t) => t + 1);
  }

  async function handlePublish(id: string, currentlyPublished: boolean) {
    setPublishingId(id);
    try {
      const action = currentlyPublished ? 'unpublish' : 'publish';
      const res = await fetch(`/api/admin/release-notes/${id}/${action}`, { method: 'POST' });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        showToast({ type: 'error', message: json.error ?? 'Error al cambiar el estado.' });
        return;
      }
      showToast({
        type: 'success',
        message: currentlyPublished ? 'Novedad despublicada.' : 'Novedad publicada.',
      });
      setLoadTrigger((t) => t + 1);
    } catch {
      showToast({ type: 'error', message: 'Error de red.' });
    } finally {
      setPublishingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/release-notes/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const json = (await res.json()) as { error?: string };
        showToast({ type: 'error', message: json.error ?? 'Error al eliminar la novedad.' });
        return;
      }
      showToast({ type: 'success', message: 'Novedad eliminada.' });
      setLoadTrigger((t) => t + 1);
    } catch {
      showToast({ type: 'error', message: 'Error de red.' });
    } finally {
      setDeletingId(null);
    }
  }

  function noteToSlide(note: AdminReleaseNote): ReleaseNoteSlide {
    return {
      id: note.id,
      title: note.title,
      body: note.body,
      imageUrl: note.imageUrl,
      publishedAt: note.publishedAt ?? note.createdAt,
    };
  }

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'draft', label: 'Borradores' },
    { value: 'published', label: 'Publicadas' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Novedades de versión</h1>
              <p className="text-sm text-slate-500">Gestión de anuncios para especialistas</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingNote(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva novedad
          </button>
        </div>

        {/* Status filter */}
        <div className="bg-white border border-slate-200 rounded-xl p-1 flex gap-1 mb-4 w-fit">
          {statusOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === value
                  ? 'bg-teal-500 text-white font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-red-500 text-sm">{loadError}</p>
              <button
                onClick={() => setLoadTrigger((t) => t + 1)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <RefreshCcw className="w-3 h-3" /> Reintentar
              </button>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm gap-2">
              <ImageOff className="w-8 h-8 opacity-40" />
              <p>No hay novedades en esta categoría.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Título
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                        Fecha
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                        Audiencia
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                        Creado por
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {notes.map((note) => {
                      const isPublished = !!note.publishedAt;
                      const isProcessing = publishingId === note.id || deletingId === note.id;
                      return (
                        <tr key={note.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  isPublished
                                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {isPublished ? 'Publicada' : 'Borrador'}
                              </span>
                              <span className="font-medium text-slate-800 truncate max-w-[200px]">
                                {note.title}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell whitespace-nowrap">
                            {isPublished ? (
                              formatCaracasDate(note.publishedAt!)
                            ) : (
                              <span className="italic text-slate-400">Borrador</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                            {audienceLabel(note.audiencePlans)}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                            {note.createdByName}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {/* Edit */}
                              <button
                                onClick={() => {
                                  setEditingNote(note);
                                  setShowForm(true);
                                }}
                                disabled={isProcessing}
                                title="Editar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {/* Preview */}
                              <button
                                onClick={() => setPreviewNote(note)}
                                disabled={isProcessing}
                                title="Vista previa"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Publish / Unpublish */}
                              <button
                                onClick={() => {
                                  void handlePublish(note.id, isPublished);
                                }}
                                disabled={isProcessing}
                                title={isPublished ? 'Despublicar' : 'Publicar'}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium disabled:opacity-40 transition-colors ${
                                  isPublished
                                    ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                    : 'text-teal-600 bg-teal-50 hover:bg-teal-100'
                                }`}
                              >
                                {publishingId === note.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                {isPublished ? 'Despublicar' : 'Publicar'}
                              </button>

                              {/* Delete (drafts only) */}
                              {!isPublished &&
                                (confirmDeleteId === note.id ? (
                                  <span className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        void handleDelete(note.id);
                                      }}
                                      disabled={deletingId === note.id}
                                      className="px-2 py-1 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                                    >
                                      {deletingId === note.id ? '...' : 'Confirmar'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50"
                                    >
                                      No
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDeleteId(note.id)}
                                    disabled={isProcessing}
                                    title="Eliminar borrador"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Paginator
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                pageSizeOptions={[10, 20, 50]}
              />
            </>
          )}
        </div>
      </div>

      {/* Create/edit form modal */}
      {showForm && (
        <NoteFormModal
          editing={editingNote}
          onClose={() => {
            setShowForm(false);
            setEditingNote(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* Preview modal — reuses doctor ReleaseNotesModal in read-only mode */}
      {previewNote && (
        <ReleaseNotesModal
          readOnly
          notes={[noteToSlide(previewNote)]}
          onClose={() => setPreviewNote(null)}
        />
      )}
    </div>
  );
}
