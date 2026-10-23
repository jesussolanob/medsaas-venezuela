'use client';

/**
 * ContentTemplatesTab.tsx
 *
 * Full UI for the "Mis plantillas" tab within the Plantillas page.
 * Lists all content templates for the authenticated doctor, grouped/filterable
 * by type, with create, edit, and delete actions.
 *
 * Props:
 *   initialType — pre-selected filter type when coming from a branding tab
 *   onCreateFromBrandingTab — callback so parent can open create modal directly
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, BookMarked, AlertCircle } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import {
  listContentTemplates,
  deleteContentTemplate,
  type ContentTemplate,
  type ContentTemplateType,
} from './content-actions';
import ContentTemplateModal from './ContentTemplateModal';
import type { PresupuestoEditorOptions } from '@/components/doctor/document-editors/PresupuestoItemsEditor';
import { getDoctorServices } from '@/app/doctor/services/actions';
import { getProducts } from '@/app/doctor/inventory/actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<ContentTemplateType, string> = {
  recipe: 'Récipe',
  paraclinical: 'Paraclínicos',
  reposo: 'Reposo',
  presupuesto: 'Presupuesto',
};

type FilterType = ContentTemplateType | 'all';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'recipe', label: 'Récipe' },
  { value: 'paraclinical', label: 'Paraclínicos' },
  { value: 'reposo', label: 'Reposo' },
  { value: 'presupuesto', label: 'Presupuesto' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContentTemplatesTabProps {
  /** When set, auto-opens the create modal pre-filtered to this type. */
  openCreateForType?: ContentTemplateType | null;
  onCreateHandled?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContentTemplatesTab({
  openCreateForType,
  onCreateHandled,
}: ContentTemplatesTabProps) {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalInitialType, setModalInitialType] = useState<ContentTemplateType>('recipe');
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [catalogOptions, setCatalogOptions] = useState<PresupuestoEditorOptions>({
    services: [],
    products: [],
  });
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const newTemplateButtonRef = useRef<HTMLButtonElement>(null);

  // Load templates on mount
  useEffect(() => {
    let cancelled = false;
    listContentTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        /* fail silently — list stays empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the services/products catalog every time the modal opens, from ANY
  // entry point (create, edit, branding-tab button): the type can be switched to Presupuesto inside the modal,
  // so loading only when it opened as presupuesto left the pickers saying
  // "Sin servicios" (seen in staging QA, 23/10).
  const ensureCatalog = useCallback(async () => {
    if (catalogLoaded) return;
    try {
      const [services, productsResult] = await Promise.allSettled([
        getDoctorServices(),
        getProducts({ active: true, limit: 100 }),
      ]);
      setCatalogOptions({
        services: services.status === 'fulfilled' ? services.value : [],
        products: productsResult.status === 'fulfilled' ? productsResult.value.products : [],
      });
      setCatalogLoaded(true);
    } catch {
      /* catalog stays empty — editor handles the empty state */
    }
  }, [catalogLoaded]);

  // Handle parent-driven "create for this type" (from branding tab button)
  useEffect(() => {
    if (!openCreateForType) return;
    // Queue as microtask to avoid synchronous setState inside effect body
    queueMicrotask(() => {
      setModalMode('create');
      setModalInitialType(openCreateForType);
      setEditingTemplate(null);
      void ensureCatalog();
      setShowModal(true);
      onCreateHandled?.();
    });
  }, [openCreateForType, onCreateHandled, ensureCatalog]);

  function openCreate(type: ContentTemplateType = 'recipe') {
    setModalMode('create');
    setModalInitialType(type);
    setEditingTemplate(null);
    void ensureCatalog();
    setShowModal(true);
  }

  function openEdit(tpl: ContentTemplate) {
    setModalMode('edit');
    setModalInitialType(tpl.type);
    setEditingTemplate(tpl);
    void ensureCatalog();
    setShowModal(true);
  }

  function handleSaved(saved: ContentTemplate) {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setShowModal(false);
    setEditingTemplate(null);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    const result = await deleteContentTemplate(id);
    setDeleting(false);

    if (!result.ok) {
      showToast({ type: 'error', message: result.error ?? 'Error al eliminar la plantilla' });
      return;
    }

    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setDeleteConfirmId(null);
    showToast({ type: 'success', message: 'Plantilla eliminada.' });
    newTemplateButtonRef.current?.focus();
  }

  const filtered =
    filterType === 'all' ? templates : templates.filter((t) => t.type === filterType);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-teal-500" /> Mis plantillas de contenido
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Crea plantillas reutilizables de récipes, paraclínicos, reposos y presupuestos. Privadas
            — solo tú las ves.
          </p>
        </div>
        <button
          ref={newTemplateButtonRef}
          type="button"
          onClick={() => openCreate()}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-bold transition-colors"
        >
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilterType(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === opt.value
                ? 'bg-teal-100 text-teal-700 border border-teal-200'
                : 'border border-slate-200 text-slate-500 hover:border-teal-200 hover:text-teal-600'
            }`}
          >
            {opt.label}
            {opt.value !== 'all' && (
              <span className="ml-1.5 text-[10px] opacity-60">
                ({templates.filter((t) => t.type === opt.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
          <span className="text-sm">Cargando plantillas…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <BookMarked className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">
            {templates.length === 0
              ? 'No tienes plantillas todavía'
              : `Sin plantillas de tipo "${filterType === 'all' ? 'todos' : TYPE_LABELS[filterType]}"`}
          </p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Crea tu primera plantilla para reutilizarla rápidamente en consultas y presupuestos.
          </p>
          <button
            type="button"
            onClick={() =>
              openCreate(filterType === 'all' ? 'recipe' : (filterType as ContentTemplateType))
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> Nueva plantilla
          </button>
        </div>
      )}

      {/* Template list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-teal-200 transition-colors"
            >
              {/* Type badge */}
              <span
                className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  tpl.type === 'recipe'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : tpl.type === 'paraclinical'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : tpl.type === 'reposo'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-violet-50 text-violet-700 border border-violet-200'
                }`}
              >
                {TYPE_LABELS[tpl.type]}
              </span>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{tpl.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Intl.DateTimeFormat('es-VE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }).format(new Date(tpl.updatedAt))}
                </p>
              </div>

              {/* Actions */}
              {deleteConfirmId === tpl.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-xs text-amber-700">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>¿Eliminar?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(tpl.id)}
                    disabled={deleting}
                    className="px-2.5 py-1 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-60 transition-colors"
                  >
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sí, eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(tpl)}
                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    aria-label={`Editar ${tpl.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(tpl.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label={`Eliminar ${tpl.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <ContentTemplateModal
          mode={modalMode}
          initialType={modalInitialType}
          template={editingTemplate ?? undefined}
          catalogOptions={catalogOptions}
          onClose={() => {
            setShowModal(false);
            setEditingTemplate(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
