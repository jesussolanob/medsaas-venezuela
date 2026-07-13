'use client';
/**
 * PatientsAtendidosSection
 *
 * Sección "Pacientes atendidos por especialista" dentro de /admin/patients.
 * El admin elige un especialista de la lista y ve sus pacientes atendidos
 * con SOLO identidad (nombre, cédula, nº consultas, fecha última atención).
 *
 * Reutiliza DoctorPatientsList y el endpoint auditado
 * GET /api/admin/doctors/[id]/patients — sin exponer datos médicos.
 *
 * RBAC: super_admin — lo enforce el BFF y el backend.
 * Auditoría: el backend registra cada llamada en access_audit_log
 *            (fieldRevealed='admin_patient_identity').
 */
import { useState, useEffect } from 'react';
import { Search, Users } from 'lucide-react';
import { reportError } from '@/lib/report-error';
import DoctorPatientsList from '../doctors/DoctorPatientsList';

interface DoctorOption {
  id: string;
  full_name: string;
  specialty: string | null;
}

export default function PatientsAtendidosSection() {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [doctorsError, setDoctorsError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDoctors() {
      try {
        const res = await fetch('/api/admin/doctors');
        const body: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            body !== null &&
            typeof body === 'object' &&
            'error' in body &&
            typeof (body as Record<string, unknown>).error === 'string'
              ? (body as { error: string }).error
              : 'Error al cargar especialistas';
          throw new Error(msg);
        }
        setDoctors(body as DoctorOption[]);
      } catch (err: unknown) {
        if (cancelled) return;
        reportError('PatientsAtendidosSection', 'loadDoctors', err);
        setDoctorsError(err instanceof Error ? err.message : 'Error al cargar especialistas');
      } finally {
        if (!cancelled) setLoadingDoctors(false);
      }
    }

    void loadDoctors();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDoctors = doctors.filter((d) => {
    const q = search.toLowerCase();
    return d.full_name.toLowerCase().includes(q) || (d.specialty ?? '').toLowerCase().includes(q);
  });

  const selectedDoctor = doctors.find((d) => d.id === selectedId) ?? null;

  return (
    <section aria-labelledby="pacientes-atendidos-heading">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-teal-500 flex-shrink-0" />
        <h2 id="pacientes-atendidos-heading" className="text-sm font-semibold text-slate-700">
          Pacientes atendidos por especialista
        </h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Selector panel */}
        <div className="p-4 border-b border-slate-100">
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Selecciona un especialista para ver los pacientes que ha atendido. Solo se muestra
            identidad (nombre y cédula) — sin datos clínicos. Cada consulta queda registrada en el
            log de auditoría.
          </p>

          {/* Search input */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar especialista..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition"
              aria-label="Buscar especialista"
            />
          </div>

          {/* Doctor list */}
          {loadingDoctors && (
            <p className="text-xs text-slate-400 text-center py-4">Cargando especialistas...</p>
          )}

          {doctorsError && (
            <p className="text-xs text-red-500 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              {doctorsError}
            </p>
          )}

          {!loadingDoctors && !doctorsError && filteredDoctors.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">
              {search ? 'Sin resultados para esa búsqueda.' : 'No hay especialistas registrados.'}
            </p>
          )}

          {!loadingDoctors && !doctorsError && filteredDoctors.length > 0 && (
            <ul
              role="listbox"
              aria-label="Lista de especialistas"
              className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg"
            >
              {filteredDoctors.map((d) => (
                <li key={d.id} role="option" aria-selected={selectedId === d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                      selectedId === d.id ? 'bg-teal-50 border-l-2 border-l-teal-500' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          selectedId === d.id ? 'text-teal-700' : 'text-slate-800'
                        }`}
                      >
                        {d.full_name}
                      </p>
                      {d.specialty && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{d.specialty}</p>
                      )}
                    </div>
                    {selectedId === d.id && (
                      <span className="ml-2 text-xs font-semibold text-teal-600 flex-shrink-0">
                        Seleccionado
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Patients list — only renders when a doctor is selected */}
        {selectedDoctor ? (
          <div className="p-4">
            <p className="text-xs text-slate-500 mb-3">
              Pacientes de{' '}
              <span className="font-medium text-slate-700">{selectedDoctor.full_name}</span>
              {selectedDoctor.specialty ? ` · ${selectedDoctor.specialty}` : ''}
            </p>
            {/* DoctorPatientsList handles lazy load + expand/collapse internally */}
            <DoctorPatientsList doctorId={selectedDoctor.id} />
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-slate-400">
            Selecciona un especialista de la lista para ver sus pacientes atendidos.
          </div>
        )}
      </div>
    </section>
  );
}
