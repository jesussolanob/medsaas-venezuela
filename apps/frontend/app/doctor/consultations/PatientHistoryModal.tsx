'use client';

/**
 * PatientHistoryModal.tsx
 *
 * Drawer de solo lectura (slide-in desde la derecha) que muestra el historial
 * de consultas previas de un paciente. Se abre desde el editor de consulta sin
 * sacar al médico de la consulta en curso.
 *
 * Datos: llama al Server Action `getPatientConsultations` (ya existente),
 * excluye la consulta en edición, ordena por fecha DESC y pagina de 5 en 5
 * en el cliente.
 *
 * Bloques: recorre `blocks_structure` ordenado por `sort_order` y muestra
 * label + valor de `blocks_snapshot`. Omite bloques vacíos. El bloque
 * `paraclinical` almacena un array de strings — se renderiza como lista.
 */

import { useEffect, useState } from 'react';
import {
  X,
  History,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
} from 'lucide-react';
import { getPatientConsultations, type Consultation } from './actions';

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type BlockStructure = NonNullable<NonNullable<Consultation['blocks_structure']>[number]>;

interface Props {
  patientId: string;
  currentConsultationId: string;
  patientName?: string | null;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PAGE_SIZE = 5;

const CONSULTA_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'En curso', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Atendida', color: 'bg-emerald-100 text-emerald-700' },
  no_show: { label: 'No asistió', color: 'bg-red-100 text-red-700' },
  scheduled: { label: 'Agendada', color: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmada', color: 'bg-teal-100 text-teal-700' },
  cancelled: { label: 'Cancelada', color: 'bg-slate-100 text-slate-500' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Parsea el valor de `blocks_snapshot['paraclinical']`.
 * Formato canónico: array de strings "examen — indicaciones".
 * Fallback legacy: string con saltos de línea.
 */
function parseParaclinicalValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return (raw as unknown[]).map((x) => String(x)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split('\n').filter(Boolean);
  }
  return [];
}

function isValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = CONSULTA_STATUS[status ?? ''] ?? {
    label: status ?? '—',
    color: 'bg-slate-100 text-slate-500',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.color}`}
    >
      {s.label}
    </span>
  );
}

function ParaclinicalList({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 space-y-0.5 pl-3">
      {items.map((item, i) => {
        const sepIdx = item.indexOf(' — ');
        const exam = sepIdx > -1 ? item.slice(0, sepIdx) : item;
        const notes = sepIdx > -1 ? item.slice(sepIdx + 3) : null;
        return (
          <li key={i} className="text-xs text-slate-700 list-disc list-inside">
            <span className="font-medium">{exam}</span>
            {notes && <span className="text-slate-500"> — {notes}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function ConsultationCard({
  consultation,
  defaultExpanded = false,
}: {
  consultation: Consultation;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const structure: BlockStructure[] = Array.isArray(consultation.blocks_structure)
    ? [...consultation.blocks_structure].sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const snapshot = consultation.blocks_snapshot ?? {};

  // Collect block keys that are NOT in structure (legacy top-level fields)
  // so we don't duplicate diagnosis/chief_complaint etc if they're already blocks.
  const structureKeys = new Set(structure.map((b) => b.key));

  // Legacy fields to show when no blocks_structure is available
  const legacyFields: Array<{ label: string; value: string | null | undefined }> =
    structure.length === 0
      ? [
          { label: 'Motivo de consulta', value: consultation.chief_complaint },
          { label: 'Diagnóstico', value: consultation.diagnosis },
          { label: 'Tratamiento', value: consultation.treatment },
          { label: 'Notas', value: consultation.notes },
        ]
      : [];

  const hasDiagnosisBlock = structureKeys.has('diagnosis');

  return (
    <article className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header de la consulta — clic para colapsar/descolapsar */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-bold text-slate-800">
            {formatDate(consultation.consultation_date)}
          </p>
          <p className="text-[10px] font-mono text-slate-400">{consultation.consultation_code}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={consultation.appointment_status ?? undefined} />
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Cuerpo colapsable */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Diagnóstico destacado — solo si no está ya en blocks_structure */}
          {!hasDiagnosisBlock && consultation.diagnosis && (
            <div className="px-3 py-2 bg-teal-50 border border-teal-100 rounded-lg">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 mb-0.5">
                Diagnóstico
              </p>
              <p className="text-xs text-slate-800 leading-relaxed">{consultation.diagnosis}</p>
            </div>
          )}

          {/* Bloques dinámicos desde blocks_structure */}
          {structure.length > 0 && (
            <div className="space-y-2.5">
              {structure.map((block) => {
                const raw = snapshot[block.key];
                if (isValueEmpty(raw)) return null;

                if (block.key === 'paraclinical') {
                  const items = parseParaclinicalValue(raw);
                  if (items.length === 0) return null;
                  return (
                    <div key={block.key}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {block.label}
                      </p>
                      <ParaclinicalList items={items} />
                    </div>
                  );
                }

                const strValue = typeof raw === 'string' ? raw.trim() : String(raw);
                if (!strValue) return null;

                // Diagnóstico dentro de bloques: mostrar destacado
                if (block.key === 'diagnosis') {
                  return (
                    <div
                      key={block.key}
                      className="px-3 py-2 bg-teal-50 border border-teal-100 rounded-lg"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 mb-0.5">
                        {block.label}
                      </p>
                      <p className="text-xs text-slate-800 leading-relaxed">{strValue}</p>
                    </div>
                  );
                }

                return (
                  <div key={block.key}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      {block.label}
                    </p>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {strValue}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fallback: campos legacy cuando no hay blocks_structure */}
          {legacyFields.length > 0 && (
            <div className="space-y-2.5">
              {legacyFields.map(({ label, value }) => {
                if (!value?.trim()) return null;
                const isdiag = label === 'Diagnóstico';
                return (
                  <div
                    key={label}
                    className={
                      isdiag ? 'px-3 py-2 bg-teal-50 border border-teal-100 rounded-lg' : undefined
                    }
                  >
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                        isdiag ? 'text-teal-600' : 'text-slate-400'
                      }`}
                    >
                      {label}
                    </p>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {value}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PatientHistoryModal({
  patientId,
  currentConsultationId,
  patientName,
  open,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [page, setPage] = useState(1);

  // Animación slide-in: primero monta, luego activa la clase de transformación.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cargar historial cuando se abre el modal.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setPage(1);

    (async () => {
      try {
        const all = await getPatientConsultations(patientId);
        if (!active) return;

        // Excluir la consulta en edición y ordenar por fecha DESC.
        const filtered = all
          .filter((c) => c.id !== currentConsultationId)
          .sort(
            (a, b) =>
              new Date(b.consultation_date).getTime() - new Date(a.consultation_date).getTime(),
          );

        setConsultations(filtered);
      } catch {
        if (active) setError('No se pudo cargar el historial del paciente.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, patientId, currentConsultationId]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  // Paginación cliente-side.
  const totalPages = Math.max(1, Math.ceil(consultations.length / PAGE_SIZE));
  const paginated = consultations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[99] bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Historial de consultas del paciente"
        className={`fixed top-0 right-0 z-[100] h-full w-full max-w-lg bg-white shadow-2xl flex flex-col
          transition-transform duration-300 ease-out
          ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate text-sm">{patientName ?? 'Paciente'}</p>
            <p className="text-xs text-slate-400">Historial de consultas anteriores</p>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0"
            aria-label="Cerrar historial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Estado: cargando */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando historial…</span>
            </div>
          )}

          {/* Estado: error */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm font-semibold text-red-500">{error}</p>
              <p className="text-xs text-slate-400">
                Intenta cerrar y volver a abrir el historial.
              </p>
            </div>
          )}

          {/* Estado: sin consultas previas */}
          {!loading && !error && consultations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">
                Este paciente no tiene consultas anteriores
              </p>
              <p className="text-xs text-slate-400">
                Las próximas consultas aparecerán aquí como referencia.
              </p>
            </div>
          )}

          {/* Lista paginada */}
          {!loading && !error && consultations.length > 0 && (
            <>
              <p className="text-xs text-slate-400">
                {consultations.length === 1
                  ? '1 consulta anterior'
                  : `${consultations.length} consultas anteriores`}
              </p>
              <div className="space-y-3">
                {paginated.map((c, idx) => (
                  <ConsultationCard key={c.id} consultation={c} defaultExpanded={idx === 0} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer de paginación */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Siguiente
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
