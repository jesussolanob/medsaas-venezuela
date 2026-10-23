'use client';

/**
 * ContentTemplateModal.tsx
 *
 * Modal for creating or editing a content template (plantilla de contenido).
 * Displayed from within the "Mis plantillas" tab of the templates page.
 *
 * Props:
 *   mode         — 'create' (new) or 'edit' (existing template)
 *   initialType  — pre-selected type when mode='create' from a branding tab
 *   template     — existing template data when mode='edit'
 *   catalogOptions — services/products for presupuesto editor
 *   onClose      — called on Cancel or ESC
 *   onSaved      — called after a successful save with the result
 */

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, BookMarked } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import {
  createContentTemplate,
  updateContentTemplate,
  type ContentTemplate,
  type ContentTemplateType,
  type TemplateContent,
  type RecipeTemplateContent,
  type ParaclinicalTemplateContent,
  type ReposoTemplateContent,
  type PresupuestoTemplateContent,
} from './content-actions';
import { RecipeEditor } from '@/components/doctor/document-editors/RecipeEditor';
import { ParaclinicalEditor } from '@/components/doctor/document-editors/ParaclinicalEditor';
import { ReposoEditor } from '@/components/doctor/document-editors/ReposoEditor';
import {
  PresupuestoItemsEditor,
  type PresupuestoEditorOptions,
} from '@/components/doctor/document-editors/PresupuestoItemsEditor';

// ---------------------------------------------------------------------------
// Type label helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<ContentTemplateType, string> = {
  recipe: 'Récipe',
  paraclinical: 'Paraclínicos',
  reposo: 'Reposo',
  presupuesto: 'Presupuesto',
};

const TYPE_OPTIONS: ContentTemplateType[] = ['recipe', 'paraclinical', 'reposo', 'presupuesto'];

// ---------------------------------------------------------------------------
// Default content per type
// ---------------------------------------------------------------------------

function defaultContent(type: ContentTemplateType): TemplateContent {
  switch (type) {
    case 'recipe':
      return { medications: [], notes: '' } satisfies RecipeTemplateContent;
    case 'paraclinical':
      return { items: [] } satisfies ParaclinicalTemplateContent;
    case 'reposo':
      return { diagnosis: '', days: 0, comments: '' } satisfies ReposoTemplateContent;
    case 'presupuesto':
      return { items: [] } satisfies PresupuestoTemplateContent;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContentTemplateModalProps {
  mode: 'create' | 'edit';
  initialType?: ContentTemplateType;
  template?: ContentTemplate;
  catalogOptions?: PresupuestoEditorOptions;
  onClose: () => void;
  onSaved: (template: ContentTemplate) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContentTemplateModal({
  mode,
  initialType = 'recipe',
  template,
  catalogOptions,
  onClose,
  onSaved,
}: ContentTemplateModalProps) {
  const [type, setType] = useState<ContentTemplateType>(template?.type ?? initialType);
  const [name, setName] = useState(template?.name ?? '');
  const [content, setContent] = useState<TemplateContent>(
    template?.content ?? defaultContent(template?.type ?? initialType),
  );
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const firstFocusRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Focus first field on mount
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  // ESC closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        openerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // When type changes (only in create mode), reset content
  function handleTypeChange(newType: ContentTemplateType) {
    setType(newType);
    setContent(defaultContent(newType));
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('El nombre es obligatorio.');
      firstFocusRef.current?.focus();
      return;
    }
    if (trimmedName.length > 120) {
      setNameError('El nombre no puede superar 120 caracteres.');
      return;
    }
    setNameError('');
    setSaving(true);

    try {
      let result: { ok: boolean; error?: string; template?: ContentTemplate };

      if (mode === 'create') {
        result = await createContentTemplate({ type, name: trimmedName, content });
      } else if (template) {
        result = await updateContentTemplate(template.id, {
          name: trimmedName,
          content,
        });
      } else {
        return;
      }

      if (!result.ok || !result.template) {
        showToast({
          type: 'error',
          message: result.error ?? 'Error al guardar la plantilla',
        });
        return;
      }

      showToast({
        type: 'success',
        message:
          mode === 'create'
            ? `Plantilla "${trimmedName}" creada.`
            : `Plantilla "${trimmedName}" actualizada.`,
      });
      onSaved(result.template);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? 'Nueva plantilla' : 'Editar plantilla'}
    >
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {mode === 'create' ? 'Nueva plantilla' : 'Editar plantilla'}
            </h2>
          </div>
          <button
            ref={openerRef}
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Type selector — only editable in create mode */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Tipo de plantilla
            </label>
            {mode === 'create' ? (
              <div className="flex gap-2 flex-wrap">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      type === t
                        ? 'bg-teal-500 text-white'
                        : 'border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="inline-flex items-center px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-xs font-semibold border border-teal-200">
                {TYPE_LABELS[type]}
                <span className="ml-2 text-teal-400 text-[10px]">(inmutable)</span>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label
              htmlFor="template-name"
              className="block text-sm font-semibold text-slate-700 mb-1.5"
            >
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstFocusRef}
              id="template-name"
              type="text"
              placeholder={`Ej: ${
                type === 'recipe'
                  ? 'Antibióticos para infección respiratoria'
                  : type === 'paraclinical'
                    ? 'Laboratorio de rutina anual'
                    : type === 'reposo'
                      ? 'Reposo post-operatorio 5 días'
                      : 'Paquete de consulta + laboratorio'
              }`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              maxLength={120}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                nameError
                  ? 'border-red-300 focus:border-red-400'
                  : 'border-slate-200 focus:border-teal-400'
              } bg-white`}
            />
            {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
          </div>

          {/* Content editor */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Contenido de la plantilla
            </label>
            {type === 'recipe' && (
              <RecipeEditor
                value={content as RecipeTemplateContent}
                onChange={(v) => setContent(v)}
              />
            )}
            {type === 'paraclinical' && (
              <ParaclinicalEditor
                value={content as ParaclinicalTemplateContent}
                onChange={(v) => setContent(v)}
              />
            )}
            {type === 'reposo' && (
              <ReposoEditor
                value={content as ReposoTemplateContent}
                onChange={(v) => setContent(v)}
              />
            )}
            {type === 'presupuesto' && (
              <PresupuestoItemsEditor
                value={content as PresupuestoTemplateContent}
                onChange={(v) => setContent(v)}
                options={catalogOptions}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando…
              </>
            ) : mode === 'create' ? (
              'Crear plantilla'
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
