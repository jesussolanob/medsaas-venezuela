'use client';

// Componente compartido: modal "Registrar ingreso" usado tanto en
// /doctor/finances (tab Ingresos) como en /doctor (dashboard, quick action).
// Extrae la lógica del IncomeModal inline de finances/page.tsx para que ambas
// pantallas presenten exactamente el mismo flujo y UI.

import { useState } from 'react';
import { ArrowDownCircle, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { IncomeConcept } from '@/app/doctor/finances/actions';
import type { BackendConsultationRow } from '@/app/doctor/finances/actions';
import type { Patient } from '@/app/doctor/patients/actions';

export type IncomeForm = {
  description: string;
  amount: string;
  conceptId: string;
  date: string;
  relatedConsultationId: string;
  patientId: string;
};

type ConceptManagerResult =
  | { success: true; data: IncomeConcept }
  | { success: false; error: string };

type SimpleActionResult = { success: true } | { success: false; error: string };

interface IncomeModalProps {
  concepts: IncomeConcept[];
  consultations: BackendConsultationRow[];
  patients: Patient[];
  form: IncomeForm;
  saving: boolean;
  error: string;
  onChangeForm: React.Dispatch<React.SetStateAction<IncomeForm>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onCreateConcept: (name: string) => Promise<ConceptManagerResult>;
  onUpdateConcept: (
    id: string,
    patch: { name?: string; isActive?: boolean },
  ) => Promise<ConceptManagerResult>;
  onDeleteConcept: (id: string) => Promise<SimpleActionResult>;
}

export default function IncomeModal({
  concepts,
  consultations,
  patients,
  form,
  saving,
  error,
  onChangeForm,
  onSubmit,
  onClose,
  onCreateConcept,
  onUpdateConcept,
  onDeleteConcept,
}: IncomeModalProps) {
  const [showManager, setShowManager] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [savingConcept, setSavingConcept] = useState(false);
  const [conceptError, setConceptError] = useState('');
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editingConceptName, setEditingConceptName] = useState('');

  const handleCreateConcept = async () => {
    if (!newConceptName.trim()) return;
    setSavingConcept(true);
    setConceptError('');
    const res = await onCreateConcept(newConceptName.trim());
    if (!res.success) setConceptError(res.error);
    else setNewConceptName('');
    setSavingConcept(false);
  };

  const handleUpdateConcept = async (id: string) => {
    if (!editingConceptName.trim()) return;
    setSavingConcept(true);
    setConceptError('');
    const res = await onUpdateConcept(id, { name: editingConceptName.trim() });
    if (!res.success) setConceptError(res.error);
    else setEditingConceptId(null);
    setSavingConcept(false);
  };

  const handleDeleteConcept = async (id: string) => {
    setSavingConcept(true);
    setConceptError('');
    const res = await onDeleteConcept(id);
    if (!res.success) setConceptError(res.error);
    setSavingConcept(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
            >
              <ArrowDownCircle className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-slate-800">Registrar ingreso</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej. Consulta particular, honorarios, etc."
              value={form.description}
              onChange={(e) => onChangeForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
              required
            />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Monto (USD) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => onChangeForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                required
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => onChangeForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            />
          </div>

          {/* Asociación a consulta o paciente (opcional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Asociar a <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            {consultations.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">
                  Consulta existente
                </p>
                <select
                  value={form.relatedConsultationId}
                  onChange={(e) =>
                    onChangeForm((f) => ({
                      ...f,
                      relatedConsultationId: e.target.value,
                      patientId: '',
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                >
                  <option value="">— Sin consulta —</option>
                  {consultations
                    .filter((c) => c.consultation_date)
                    .slice(0, 50)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.consultation_code ? `[${c.consultation_code}] ` : ''}
                        {c.patient_name}
                        {c.consultation_date
                          ? ` · ${new Date(c.consultation_date).toLocaleDateString('es-VE')}`
                          : ''}
                      </option>
                    ))}
                </select>
                {form.relatedConsultationId && (
                  <p className="text-[10px] text-teal-600 mt-1 font-medium">
                    Paciente derivado de la consulta seleccionada
                  </p>
                )}
              </div>
            )}
            {!form.relatedConsultationId && patients.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">
                  Paciente directo
                </p>
                <select
                  value={form.patientId}
                  onChange={(e) => onChangeForm((f) => ({ ...f, patientId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
                >
                  <option value="">— Sin paciente —</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {consultations.length === 0 && patients.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                Sin consultas ni pacientes registrados.
              </p>
            )}
          </div>

          {/* Concepto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600">
                Concepto (opcional)
              </label>
              <button
                type="button"
                onClick={() => setShowManager((v) => !v)}
                className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
              >
                {showManager ? 'Cerrar gestor' : 'Gestionar conceptos'}
              </button>
            </div>

            <select
              value={form.conceptId}
              onChange={(e) => onChangeForm((f) => ({ ...f, conceptId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300"
            >
              <option value="">— Sin concepto —</option>
              {concepts
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>

            {showManager && (
              <div className="mt-3 border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Gestionar conceptos
                </p>

                <div className="space-y-1.5">
                  {concepts.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No hay conceptos aún.</p>
                  )}
                  {concepts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200"
                    >
                      {editingConceptId === c.id ? (
                        <>
                          <input
                            type="text"
                            value={editingConceptName}
                            onChange={(e) => setEditingConceptName(e.target.value)}
                            className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void handleUpdateConcept(c.id)}
                            disabled={savingConcept}
                            className="p-1 rounded-md text-teal-600 hover:bg-teal-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingConceptId(null)}
                            className="p-1 rounded-md text-slate-400 hover:bg-slate-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className={`flex-1 text-xs font-medium ${c.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}
                          >
                            {c.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingConceptId(c.id);
                              setEditingConceptName(c.name);
                            }}
                            className="p-1 rounded-md text-slate-300 hover:text-teal-600 hover:bg-teal-50"
                            title="Editar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteConcept(c.id)}
                            disabled={savingConcept}
                            className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nuevo concepto..."
                    value={newConceptName}
                    onChange={(e) => setNewConceptName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCreateConcept();
                      }
                    }}
                    className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateConcept()}
                    disabled={savingConcept || !newConceptName.trim()}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
                  >
                    {savingConcept ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {conceptError && <p className="text-xs text-red-500 font-medium">{conceptError}</p>}
              </div>
            )}
          </div>

          {/* Error general */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Guardar ingreso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
