'use client';

import { Search, UserPlus, Loader2 } from 'lucide-react';
import CedulaInput from '@/components/shared/CedulaInput';
import PhoneInput from '@/components/shared/PhoneInput';
import type { PatientLookup, NewPatientForm } from '../appointment-flow.utils';

type Props = {
  patientQuery: string;
  setPatientQuery: (q: string) => void;
  patientResults: PatientLookup[];
  searchingPatients: boolean;
  showInlineCreator: boolean;
  setShowInlineCreator: (v: boolean) => void;
  newPatient: NewPatientForm;
  setNewPatient: React.Dispatch<React.SetStateAction<NewPatientForm>>;
  creatingPatient: boolean;
  createPatientInline: (e: React.FormEvent) => Promise<void>;
  selectPatient: (p: PatientLookup) => void;
};

export default function StepPatient({
  patientQuery,
  setPatientQuery,
  patientResults,
  searchingPatients,
  showInlineCreator,
  setShowInlineCreator,
  newPatient,
  setNewPatient,
  creatingPatient,
  createPatientInline,
  selectPatient,
}: Props) {
  if (showInlineCreator) {
    return (
      <form onSubmit={createPatientInline} className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Nuevo paciente</h3>
          <button
            type="button"
            onClick={() => setShowInlineCreator(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            ← Volver al buscador
          </button>
        </div>
        <input
          required
          placeholder="Nombre completo *"
          value={newPatient.full_name}
          onChange={(e) => setNewPatient((p) => ({ ...p, full_name: e.target.value }))}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <CedulaInput
            value={newPatient.cedula}
            onChange={(v) => setNewPatient((p) => ({ ...p, cedula: v }))}
            required
          />
          <PhoneInput
            value={newPatient.phone}
            onChange={(v) => setNewPatient((p) => ({ ...p, phone: v }))}
          />
          <input
            type="email"
            placeholder="Email"
            value={newPatient.email}
            onChange={(e) => setNewPatient((p) => ({ ...p, email: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm col-span-2"
          />
          <input
            type="date"
            value={newPatient.birth_date}
            onChange={(e) => setNewPatient((p) => ({ ...p, birth_date: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <select
            value={newPatient.sex}
            onChange={(e) => setNewPatient((p) => ({ ...p, sex: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="">Sexo</option>
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
            <option value="other">Otro</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creatingPatient}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {creatingPatient ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          Crear paciente y continuar
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, cédula, teléfono o email..."
          value={patientQuery}
          onChange={(e) => setPatientQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          autoFocus
        />
      </div>
      {searchingPatients && <p className="text-xs text-slate-400 mt-2">Buscando...</p>}
      {patientResults.length > 0 && (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto mt-2">
          {patientResults.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPatient(p)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                <p className="text-xs text-slate-500">{p.email ?? p.phone ?? p.cedula ?? '—'}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {patientQuery.length >= 2 && !searchingPatients && patientResults.length === 0 && (
        <div className="text-center py-4 mt-2 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <p className="text-sm text-slate-500 mb-3">No se encontró ningún paciente</p>
          <button
            onClick={() => {
              setShowInlineCreator(true);
              setNewPatient((p) => ({ ...p, full_name: patientQuery }));
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg"
          >
            <UserPlus className="w-3.5 h-3.5" /> Crear nuevo paciente
          </button>
        </div>
      )}
      <button
        onClick={() => setShowInlineCreator(true)}
        className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-semibold inline-flex items-center gap-1"
      >
        <UserPlus className="w-3.5 h-3.5" /> Crear paciente nuevo
      </button>
    </>
  );
}
