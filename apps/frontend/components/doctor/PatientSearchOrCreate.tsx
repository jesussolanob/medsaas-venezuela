'use client';

/**
 * components/doctor/PatientSearchOrCreate.tsx
 *
 * Controlled component: search existing patients or inline-create a new one.
 * Mirrors the patient search/create flow in ImmediateConsultationModal.tsx (~lines 82-230).
 * Created as a standalone component to avoid duplicating that logic for the
 * standalone-documents modal (technical debt note in docs/plan-plantillas-y-documentos.md, §E.1).
 *
 * Props:
 *   value      — currently selected patient (null if none)
 *   onSelect   — called with the new PatientLookup (or null to clear)
 *
 * Endpoints used:
 *   GET  /api/patients/search?q=…&limit=8  — search
 *   POST /api/patients                      — create new patient
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, Loader2, X } from 'lucide-react';
import {
  normalizePatient,
  type PatientLookup,
} from '@/components/appointment-flow/appointment-flow.utils';
import { apiErrorMessage } from '@/lib/api-error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PatientSearchOrCreateProps {
  value: PatientLookup | null;
  onSelect: (patient: PatientLookup | null) => void;
}

export function PatientSearchOrCreate({ value, onSelect }: PatientSearchOrCreateProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newPatient, setNewPatient] = useState({ full_name: '', cedula: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      const clear = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(clear);
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/patients/search?q=${encodeURIComponent(query)}&limit=8`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((json: { data?: Record<string, unknown>[] }) =>
          setResults(Array.isArray(json.data) ? json.data.map(normalizePatient) : []),
        )
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback(
    (p: PatientLookup) => {
      onSelect(p);
      setQuery('');
      setResults([]);
      setShowCreate(false);
      setError('');
    },
    [onSelect],
  );

  const handleClear = useCallback(() => {
    onSelect(null);
    setQuery('');
    setResults([]);
    setShowCreate(false);
    setNewPatient({ full_name: '', cedula: '', phone: '', email: '' });
    setError('');
  }, [onSelect]);

  async function createPatient() {
    if (!newPatient.full_name.trim() || !newPatient.cedula.trim()) {
      setError('El nombre y la cédula son obligatorios.');
      return;
    }
    const email = newPatient.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('El correo no es válido.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El correo es opcional, pero sin él "Crear y enviar" no puede mandar el
        // documento: se envía solo si se escribió (un "" lo rechazaría el DTO).
        body: JSON.stringify({
          full_name: newPatient.full_name,
          cedula: newPatient.cedula,
          phone: newPatient.phone,
          ...(email ? { email } : {}),
        }),
      });
      const json = (await res.json()) as { data?: Record<string, unknown> };
      if (!res.ok || !json.data) {
        setError(apiErrorMessage(json, 'No se pudo crear el paciente.'));
        return;
      }
      handleSelect(normalizePatient(json.data));
      setNewPatient({ full_name: '', cedula: '', phone: '', email: '' });
    } catch {
      setError('No se pudo crear el paciente.');
    } finally {
      setCreating(false);
    }
  }

  // ── Selected patient view ──────────────────────────────────────────────
  if (value) {
    return (
      <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-teal-800">{value.full_name}</p>
          <p className="text-xs text-teal-600">{value.cedula || value.phone || '—'}</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-teal-400 hover:text-teal-600 transition-colors"
          aria-label="Cambiar paciente"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Search / create view ───────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {!showCreate && (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              name="deltaPatientQueryStandalone"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o cédula…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
            />
            {searching && (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
            >
              <p className="text-sm font-semibold text-slate-800">{p.full_name}</p>
              <p className="text-xs text-slate-400">{p.cedula || p.phone || '—'}</p>
            </button>
          ))}
        </>
      )}

      {!showCreate ? (
        <button
          type="button"
          onClick={() => {
            const typed = query.trim();
            if (typed && !/^\d+$/.test(typed)) {
              setNewPatient((prev) => ({ ...prev, full_name: prev.full_name || typed }));
            } else if (/^\d+$/.test(typed)) {
              setNewPatient((prev) => ({ ...prev, cedula: prev.cedula || typed }));
            }
            setQuery('');
            setShowCreate(true);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" /> Es un paciente nuevo
        </button>
      ) : (
        <div className="space-y-2 border border-slate-200 rounded-lg p-3">
          <input
            autoFocus
            name="deltaNewPatientNameStandalone"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            value={newPatient.full_name}
            onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })}
            placeholder="Nombre y apellido"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
          />
          <div className="flex gap-2">
            <input
              name="deltaNewPatientCedulaStandalone"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              value={newPatient.cedula}
              onChange={(e) => setNewPatient({ ...newPatient, cedula: e.target.value })}
              placeholder="Cédula"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
            />
            <input
              name="deltaNewPatientPhoneStandalone"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              value={newPatient.phone}
              onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
              placeholder="Teléfono"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
            />
          </div>
          <input
            name="deltaNewPatientEmailStandalone"
            type="email"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            value={newPatient.email}
            onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
            placeholder="Correo (para enviarle el documento)"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => void createPatient()}
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              {creating ? 'Creando…' : 'Crear y continuar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewPatient({ full_name: '', cedula: '', phone: '', email: '' });
                setError('');
              }}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
