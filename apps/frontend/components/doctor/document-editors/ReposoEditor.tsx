'use client';

/**
 * ReposoEditor.tsx
 *
 * Controlled editor for reposo (medical rest) content templates.
 * Stores diagnosis, days, and comments — WITHOUT from/to dates, since those are
 * set at apply time (from = today, to = from + days - 1) per decision E.2.
 */

import { FileText, Clock } from 'lucide-react';
import type { ReposoTemplateContent } from '@/app/doctor/templates/content-actions';

const fi =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white placeholder:text-slate-300';

interface ReposoEditorProps {
  value: ReposoTemplateContent;
  onChange: (v: ReposoTemplateContent) => void;
}

export function ReposoEditor({ value, onChange }: ReposoEditorProps) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
        Las fechas (desde / hasta) se calculan automáticamente al aplicar la plantilla en una
        consulta, usando el día actual como punto de inicio.
      </div>

      {/* Diagnosis */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" /> Diagnóstico
        </label>
        <textarea
          placeholder="Diagnóstico para el reposo"
          value={value.diagnosis}
          onChange={(e) => onChange({ ...value, diagnosis: e.target.value })}
          rows={3}
          className={`${fi} resize-none`}
        />
      </div>

      {/* Days */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> Días de reposo
        </label>
        <input
          type="number"
          placeholder="0"
          min="1"
          max="365"
          value={value.days === 0 ? '' : value.days}
          onChange={(e) => {
            const days = Math.max(0, parseInt(e.target.value) || 0);
            onChange({ ...value, days });
          }}
          className={fi}
        />
      </div>

      {/* Comments */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" /> Comentarios{' '}
          <span className="text-slate-400 font-normal text-xs">(opcional)</span>
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
