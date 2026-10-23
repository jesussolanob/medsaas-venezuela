'use client';

/**
 * ParaclinicalEditor.tsx
 *
 * Controlled editor for paraclinical (paraclínicos) content templates.
 * Mirrors the exam fields and UX from the paraclínicos tab in ConsultationsClient.tsx.
 */

import { X, Plus } from 'lucide-react';
import type { ParaclinicalTemplateContent } from '@/app/doctor/templates/content-actions';

const fi =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white placeholder:text-slate-300';

interface ParaclinicalEditorProps {
  value: ParaclinicalTemplateContent;
  onChange: (v: ParaclinicalTemplateContent) => void;
}

export function ParaclinicalEditor({ value, onChange }: ParaclinicalEditorProps) {
  function updateItem(idx: number, patch: { exam_name?: string; notes?: string }) {
    const items = value.items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange({ items });
  }

  function removeItem(idx: number) {
    onChange({ items: value.items.filter((_, i) => i !== idx) });
  }

  function addItem() {
    onChange({ items: [...value.items, { exam_name: '', notes: '' }] });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Exámenes e indicaciones que el especialista ordena al paciente (laboratorio, imágenes, etc.)
      </p>

      {value.items.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
          Sin exámenes — agrega el primero abajo.
        </p>
      )}

      <div className="space-y-3">
        {value.items.map((item, idx) => (
          <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  placeholder="Nombre del examen (ej: Hematología completa, Rx de tórax...)"
                  value={item.exam_name}
                  onChange={(e) => updateItem(idx, { exam_name: e.target.value })}
                  className={fi}
                />
                <input
                  type="text"
                  placeholder="Indicaciones (ej: En ayunas, contraste oral...)"
                  value={item.notes}
                  onChange={(e) => updateItem(idx, { notes: e.target.value })}
                  className={fi}
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="text-red-400 hover:text-red-600 mt-1 transition-colors"
                aria-label={`Eliminar examen ${idx + 1}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
      >
        <Plus className="w-4 h-4" /> Agregar examen
      </button>
    </div>
  );
}
