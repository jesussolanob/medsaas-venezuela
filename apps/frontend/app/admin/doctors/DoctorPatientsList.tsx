'use client';
import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Users, Loader2 } from 'lucide-react';
import { reportError } from '@/lib/report-error';
import DateRangeFilter, { type DateRangeValue } from '@/components/admin/DateRangeFilter';
import { isWithinRange } from '@/lib/date-range';

interface DoctorPatientItem {
  id: string;
  fullName: string;
  cedula: string | null;
  consultationCount: number;
  lastAttendedAt: string | null;
}

interface DoctorPatientsListProps {
  doctorId: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

type LoadState = 'idle' | 'loading' | 'done' | 'error';

export default function DoctorPatientsList({ doctorId }: DoctorPatientsListProps) {
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [patients, setPatients] = useState<DoctorPatientItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const loadPatients = useCallback(async () => {
    if (loadState === 'loading' || loadState === 'done') return;
    try {
      setLoadState('loading');
      setErrorMsg('');
      const res = await fetch(`/api/admin/doctors/${doctorId}/patients`);
      const body: unknown = await res.json();
      if (!res.ok) {
        const msg =
          body !== null &&
          typeof body === 'object' &&
          'error' in body &&
          typeof (body as Record<string, unknown>).error === 'string'
            ? (body as { error: string }).error
            : 'Error al cargar los pacientes';
        throw new Error(msg);
      }
      const data = body as { success: true; data: DoctorPatientItem[] };
      setPatients(data.data);
      setLoadState('done');
    } catch (err: unknown) {
      reportError('DoctorPatientsList', 'loadPatients', err);
      setErrorMsg(err instanceof Error ? err.message : 'Error al cargar los pacientes');
      setLoadState('error');
    }
  }, [doctorId, loadState]);

  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: null, to: null });

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && loadState === 'idle') {
      void loadPatients();
    }
  };

  const visiblePatients = useMemo(
    () =>
      dateRange.from || dateRange.to
        ? patients.filter((p) => isWithinRange(p.lastAttendedAt, dateRange.from, dateRange.to))
        : patients,
    [patients, dateRange],
  );

  const patientCount = loadState === 'done' ? patients.length : null;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Users className="w-4 h-4 text-teal-500 flex-shrink-0" />
          Pacientes atendidos
          {patientCount !== null && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">
              {patientCount}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="bg-white">
          {loadState === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando pacientes...
            </div>
          )}

          {loadState === 'error' && (
            <div className="mx-4 my-3 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg">
              {errorMsg}
            </div>
          )}

          {loadState === 'done' && (
            <div className="px-4 py-2 border-b border-slate-100">
              <DateRangeFilter value={dateRange} onChange={setDateRange} syncUrl={false} />
            </div>
          )}

          {loadState === 'done' && visiblePatients.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8 px-4">
              {dateRange.from || dateRange.to
                ? 'No hay resultados en ese rango'
                : 'Este especialista aún no tiene pacientes atendidos.'}
            </p>
          )}

          {loadState === 'done' && visiblePatients.length > 0 && (
            <div className="divide-y divide-slate-100">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 bg-slate-50">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Paciente
                  {(dateRange.from || dateRange.to) && visiblePatients.length < patients.length && (
                    <span className="ml-1 font-normal text-teal-600">
                      ({visiblePatients.length} de {patients.length})
                    </span>
                  )}
                </span>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide text-right whitespace-nowrap">
                  Consultas
                </span>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide text-right whitespace-nowrap">
                  Última atención
                </span>
              </div>

              {/* Rows */}
              {visiblePatients.map((patient) => (
                <div
                  key={patient.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  {/* Identity column */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {patient.fullName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{patient.cedula ?? '—'}</p>
                  </div>

                  {/* Consultation count */}
                  <div className="flex items-center justify-end">
                    <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 rounded-md bg-teal-50 text-teal-700 text-xs font-semibold px-1.5">
                      {patient.consultationCount}
                    </span>
                  </div>

                  {/* Last attended date */}
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(patient.lastAttendedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
