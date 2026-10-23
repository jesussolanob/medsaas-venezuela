'use client';

/**
 * RecipeEditor.tsx
 *
 * Controlled editor for recipe (récipe) content templates.
 * Mirrors the medication fields and UX from the recipe modal in ConsultationsClient.tsx.
 * Used in the "Mis plantillas" tab and in the "Crear plantilla" modal from the
 * Récipe PDF branding tab.
 *
 * Props:
 *   value    — current RecipeTemplateContent state
 *   onChange — called with the new value whenever anything changes
 */

import { X, Plus } from 'lucide-react';
import type {
  MedicationTemplate,
  RecipeTemplateContent,
} from '@/app/doctor/templates/content-actions';

// ---------------------------------------------------------------------------
// Constants — same presentation options as ConsultationsClient.tsx
// ---------------------------------------------------------------------------

const PRESENTATION_OPTIONS = [
  'Tabletas',
  'Cápsulas',
  'Gotas',
  'Jarabe',
  'Spray',
  'Crema',
  'Ungüento',
  'Ampolla/Inyección',
  'Supositorio',
  'Óvulo',
  'Inhalador',
  'Polvo',
  'Solución',
  'Parche',
] as const;

const fi =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white placeholder:text-slate-300';

function emptyMed(): MedicationTemplate {
  return {
    name: '',
    dose: '',
    route: '',
    frequency: '',
    duration: '',
    presentation: '',
    indications: '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RecipeEditorProps {
  value: RecipeTemplateContent;
  onChange: (v: RecipeTemplateContent) => void;
}

export function RecipeEditor({ value, onChange }: RecipeEditorProps) {
  function updateMed(idx: number, patch: Partial<MedicationTemplate>) {
    const medications = value.medications.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange({ ...value, medications });
  }

  function removeMed(idx: number) {
    onChange({ ...value, medications: value.medications.filter((_, i) => i !== idx) });
  }

  function addMed() {
    onChange({ ...value, medications: [...value.medications, emptyMed()] });
  }

  function isOtherPresentation(p: string): boolean {
    return p !== '' && !(PRESENTATION_OPTIONS as readonly string[]).includes(p);
  }

  return (
    <div className="space-y-4">
      {/* Medications list */}
      <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
        {value.medications.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-2">
            Sin medicamentos — agrega el primero abajo.
          </p>
        )}
        {value.medications.map((med, idx) => (
          <div key={idx} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Medicamento {idx + 1}
              </p>
              <button
                type="button"
                onClick={() => removeMed(idx)}
                className="text-red-400 hover:text-red-600 transition-colors"
                aria-label={`Eliminar medicamento ${idx + 1}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Nombre del medicamento"
                value={med.name}
                onChange={(e) => updateMed(idx, { name: e.target.value })}
                className={fi}
              />
              <input
                type="text"
                placeholder="Dosis (ej: 500mg)"
                value={med.dose}
                onChange={(e) => updateMed(idx, { dose: e.target.value })}
                className={fi}
              />
              <input
                type="text"
                placeholder="Vía de administración (ej: oral, intramuscular)"
                value={med.route}
                onChange={(e) => updateMed(idx, { route: e.target.value })}
                className={fi}
              />
              <input
                type="text"
                placeholder="Frecuencia (ej: cada 8h)"
                value={med.frequency}
                onChange={(e) => updateMed(idx, { frequency: e.target.value })}
                className={fi}
              />
              <input
                type="text"
                placeholder="Duración (ej: 7 días)"
                value={med.duration}
                onChange={(e) => updateMed(idx, { duration: e.target.value })}
                className={fi}
              />
              {/* Presentation selector */}
              <div className="flex gap-2">
                <select
                  value={isOtherPresentation(med.presentation) ? 'Otro' : med.presentation}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateMed(idx, { presentation: val === 'Otro' ? '' : val });
                  }}
                  className={`${fi} flex-1`}
                >
                  <option value="">Presentación</option>
                  {PRESENTATION_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="Otro">Otro</option>
                </select>
                {isOtherPresentation(med.presentation) && (
                  <input
                    type="text"
                    placeholder="Especificar presentación"
                    value={med.presentation}
                    onChange={(e) => updateMed(idx, { presentation: e.target.value })}
                    className={`${fi} flex-1`}
                  />
                )}
              </div>
              <input
                type="text"
                placeholder="Indicaciones (opcional)"
                value={med.indications}
                onChange={(e) => updateMed(idx, { indications: e.target.value })}
                className={fi}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add medication */}
      <button
        type="button"
        onClick={addMed}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50 transition-colors"
      >
        <Plus className="w-4 h-4" /> Agregar medicamento
      </button>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Notas adicionales <span className="text-slate-400 font-normal text-xs">(opcional)</span>
        </label>
        <textarea
          placeholder="Observaciones generales del récipe..."
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
          className={`${fi} resize-none`}
        />
      </div>
    </div>
  );
}
