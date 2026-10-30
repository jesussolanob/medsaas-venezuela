'use client';

/**
 * /admin/team-meetings
 *
 * Admin view for specialist team meetings (phase 3 + 4 — retention plan).
 *
 * Features (phase 3):
 *   - Filter by status and date range.
 *   - List with specialist info, date/time (Caracas), source, status pill.
 *   - Actions: "Marcar hecha", "No asistió", "Cancelar" (inline confirm),
 *     edit notes, "Contactar" (reuses ContactarModal).
 *   - Pagination via meta.total.
 *
 * Features (phase 4):
 *   - "Otorgar mes de gracia" button on done meetings (inline confirm, no alert()).
 *   - Retention metrics card at the top with period selector.
 */

import { useEffect, useState } from 'react';
import {
  Video,
  Filter,
  Loader2,
  CheckCircle2,
  X,
  UserX,
  Pencil,
  Save,
  Phone,
  ExternalLink,
  RefreshCcw,
  Calendar,
  Gift,
} from 'lucide-react';
import { ContactarModal } from '@/components/admin/ContactarModal';
import { RetentionMetricsCard } from '@/components/admin/RetentionMetricsCard';
import DateRangeFilter, { type DateRangeValue } from '@/components/admin/DateRangeFilter';
import Paginator from '@/components/ui/Paginator';
import { showToast, Toaster } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminTeamMeeting {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorPlan: string;
  doctorSpecialty: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  source: string;
  meetingUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the doctor already received his (one) grace month. */
  graceGrantedAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'done', label: 'Realizadas' },
  { value: 'no_show', label: 'No asistió' },
  { value: 'cancelled', label: 'Canceladas' },
];

const SOURCE_LABELS: Record<string, string> = {
  email: 'Correo',
  modal: 'Modal',
};

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VE_LOCALE = 'es-VE';
const VE_TZ = 'America/Caracas';

function formatDateTime(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat(VE_LOCALE, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: VE_TZ,
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

function formatDate(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat(VE_LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: VE_TZ,
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: 'Agendada', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    done: { label: 'Realizada', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    no_show: { label: 'No asistió', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    cancelled: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminTeamMeetingsPage() {
  const [meetings, setMeetings] = useState<AdminTeamMeeting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: null, to: null });

  // Per-row state
  const [contactDoctorId, setContactDoctorId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [editNotesId, setEditNotesId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Phase 4 — grant-grace per-row state
  const [confirmGraceId, setConfirmGraceId] = useState<string | null>(null);
  const [graceBusy, setGraceBusy] = useState<string | null>(null);
  // Track granted rows: meeting id → new expiry ISO string
  const [grantedGrace, setGrantedGrace] = useState<Record<string, string>>({});

  // Incrementing this triggers a data reload from action handlers.
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Data loading — function defined inside useEffect so it never triggers the
  // react-hooks/set-state-in-effect lint rule (matches contact-requests pattern).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (dateRange.from) params.set('from', `${dateRange.from}T00:00:00-04:00`);
        if (dateRange.to) params.set('to', `${dateRange.to}T23:59:59-04:00`);
        const limit = pageSize === 0 ? 500 : pageSize;
        params.set('limit', String(limit));
        params.set('offset', String((page - 1) * limit));

        const res = await fetch(`/api/admin/team-meetings?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled)
            showToast({ type: 'error', message: 'No se pudieron cargar las reuniones.' });
          return;
        }
        const json = (await res.json()) as {
          data?: AdminTeamMeeting[];
          meta?: { total?: number };
        };
        if (!cancelled) {
          setMeetings(json.data ?? []);
          setTotal(json.meta?.total ?? 0);
        }
      } catch {
        if (!cancelled) showToast({ type: 'error', message: 'Error de red al cargar reuniones.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, statusFilter, dateRange, reloadTrigger]);

  async function patchMeeting(id: string, body: { status?: string; notes?: string | null }) {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/admin/team-meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        showToast({ type: 'error', message: j.error ?? 'Error al actualizar la reunión.' });
        return false;
      }
      return true;
    } catch {
      showToast({ type: 'error', message: 'Error de red. Intenta de nuevo.' });
      return false;
    } finally {
      setActionBusy(null);
    }
  }

  async function handleMarkDone(id: string) {
    const ok = await patchMeeting(id, { status: 'done' });
    if (ok) {
      showToast({ type: 'success', message: 'Reunión marcada como realizada.' });
      setReloadTrigger((t) => t + 1);
    }
  }

  async function handleMarkNoShow(id: string) {
    const ok = await patchMeeting(id, { status: 'no_show' });
    if (ok) {
      showToast({ type: 'success', message: 'Marcada como "No asistió".' });
      setReloadTrigger((t) => t + 1);
    }
  }

  async function handleCancel(id: string) {
    const ok = await patchMeeting(id, { status: 'cancelled' });
    if (ok) {
      setConfirmCancelId(null);
      showToast({ type: 'success', message: 'Reunión cancelada.' });
      setReloadTrigger((t) => t + 1);
    }
  }

  async function handleSaveNotes(id: string) {
    const ok = await patchMeeting(id, { notes: notesValue || null });
    if (ok) {
      setEditNotesId(null);
      showToast({ type: 'success', message: 'Notas guardadas.' });
      setReloadTrigger((t) => t + 1);
    }
  }

  // Phase 4 — grant grace month
  async function handleGrantGrace(meeting: AdminTeamMeeting) {
    setGraceBusy(meeting.id);
    try {
      const res = await fetch(`/api/admin/team-meetings/${meeting.id}/grant-grace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        data?: { doctorId: string; newExpiresAt: string };
        error?: string;
      };
      if (!res.ok) {
        const msg = json.error ?? 'Error al otorgar el mes de gracia.';
        showToast({ type: 'error', message: msg });
        setConfirmGraceId(null);
        return;
      }
      const newExpiry = json.data?.newExpiresAt ?? '';
      setGrantedGrace((prev) => ({ ...prev, [meeting.id]: newExpiry }));
      setConfirmGraceId(null);
      showToast({
        type: 'success',
        message: `Mes de gracia otorgado a ${meeting.doctorName}. Nuevo vencimiento: ${formatDate(newExpiry)}.`,
      });
    } catch {
      showToast({ type: 'error', message: 'Error de red. Intenta de nuevo.' });
      setConfirmGraceId(null);
    } finally {
      setGraceBusy(null);
    }
  }

  function handleFilterChange(key: 'status', value: string) {
    setPage(1);
    if (key === 'status') setStatusFilter(value);
  }

  function handleDateRangeChange(v: DateRangeValue) {
    setPage(1);
    setDateRange(v);
  }

  return (
    <>
      <Toaster />
      <div className="space-y-6">
        {/* Retention metrics card (phase 4) */}
        <RetentionMetricsCard />

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Reuniones</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Reuniones de especialistas con el equipo Delta (Plan de Retención — Fase 3 + 4)
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Video className="w-4 h-4 text-teal-500" />
            <span>
              {total} reunión{total !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white text-slate-700"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Date range */}
          <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} syncUrl={false} />

          <button
            onClick={() => {
              setStatusFilter('');
              setDateRange({ from: null, to: null });
              setPage(1);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCcw className="w-3 h-3" />
            Limpiar
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Cargando reuniones…</span>
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Calendar className="w-12 h-12 text-slate-200" />
              <p className="text-sm text-slate-500 font-medium">
                No hay reuniones con estos filtros.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Especialista
                      </th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Fecha y hora
                      </th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Origen
                      </th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Enlace
                      </th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Notas
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {meetings.map((m) => {
                      const alreadyGranted =
                        Boolean(grantedGrace[m.id]) || Boolean(m.graceGrantedAt);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                          {/* Specialist */}
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800 text-sm">{m.doctorName}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {m.doctorSpecialty ?? '—'} · {m.doctorPlan}
                            </p>
                          </td>

                          {/* Date/time */}
                          <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                            {formatDateTime(m.startsAt)}
                          </td>

                          {/* Source */}
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {SOURCE_LABELS[m.source] ?? m.source}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <StatusPill status={m.status} />
                          </td>

                          {/* Meeting URL */}
                          <td className="px-4 py-3">
                            {m.meetingUrl ? (
                              <a
                                href={m.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline font-medium"
                              >
                                <Video className="w-3 h-3" />
                                Unirse
                                <ExternalLink className="w-3 h-3 opacity-60" />
                              </a>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>

                          {/* Notes */}
                          <td className="px-4 py-3 max-w-[200px]">
                            {editNotesId === m.id ? (
                              <div className="flex items-start gap-2">
                                <textarea
                                  value={notesValue}
                                  onChange={(e) => setNotesValue(e.target.value)}
                                  rows={2}
                                  maxLength={2000}
                                  className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                                  placeholder="Notas del feedback…"
                                />
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => void handleSaveNotes(m.id)}
                                    disabled={actionBusy === m.id}
                                    className="p-1.5 rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-60 transition-colors"
                                    aria-label="Guardar notas"
                                  >
                                    {actionBusy === m.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Save className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setEditNotesId(null)}
                                    className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"
                                    aria-label="Cancelar edición"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="flex items-start gap-1.5 cursor-pointer group"
                                onClick={() => {
                                  setEditNotesId(m.id);
                                  setNotesValue(m.notes ?? '');
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    setEditNotesId(m.id);
                                    setNotesValue(m.notes ?? '');
                                  }
                                }}
                                aria-label="Editar notas"
                              >
                                <span className="text-xs text-slate-500 line-clamp-2 flex-1">
                                  {m.notes ?? (
                                    <span className="text-slate-300 italic">Sin notas</span>
                                  )}
                                </span>
                                <Pencil className="w-3 h-3 text-slate-300 group-hover:text-slate-500 shrink-0 mt-0.5 transition-colors" />
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Contactar */}
                              <button
                                onClick={() => setContactDoctorId(m.doctorId)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 transition-colors"
                                title="Ver contacto"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                Contactar
                              </button>

                              {m.status === 'scheduled' && (
                                <>
                                  {/* Mark done */}
                                  <button
                                    onClick={() => void handleMarkDone(m.id)}
                                    disabled={actionBusy === m.id}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-200 text-teal-700 bg-teal-50 text-xs hover:bg-teal-100 disabled:opacity-60 transition-colors"
                                    title="Marcar como realizada"
                                  >
                                    {actionBusy === m.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    )}
                                    Hecha
                                  </button>

                                  {/* No show */}
                                  <button
                                    onClick={() => void handleMarkNoShow(m.id)}
                                    disabled={actionBusy === m.id}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 text-xs hover:bg-amber-100 disabled:opacity-60 transition-colors"
                                    title="No asistió"
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    No asistió
                                  </button>

                                  {/* Cancel */}
                                  {confirmCancelId === m.id ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-slate-600">¿Cancelar?</span>
                                      <button
                                        onClick={() => void handleCancel(m.id)}
                                        disabled={actionBusy === m.id}
                                        className="px-2 py-1 rounded bg-red-500 text-white text-[11px] font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors"
                                      >
                                        Sí
                                      </button>
                                      <button
                                        onClick={() => setConfirmCancelId(null)}
                                        className="px-2 py-1 rounded border border-slate-200 text-slate-600 text-[11px] hover:bg-slate-50 transition-colors"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmCancelId(m.id)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                      title="Cancelar reunión"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      Cancelar
                                    </button>
                                  )}
                                </>
                              )}

                              {/* FASE 4 — "Otorgar mes de gracia" on done meetings */}
                              {m.status === 'done' &&
                                (alreadyGranted ? (
                                  <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-[11px]">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>
                                      Mes otorgado
                                      {grantedGrace[m.id]
                                        ? ` · vence ${formatDate(grantedGrace[m.id])}`
                                        : m.graceGrantedAt
                                          ? ` el ${formatDate(m.graceGrantedAt)}`
                                          : ''}
                                    </span>
                                  </div>
                                ) : confirmGraceId === m.id ? (
                                  <div className="flex flex-col items-end gap-1.5">
                                    <p className="text-[11px] text-slate-600 max-w-[220px] text-right">
                                      Se le sumará 1 mes de prueba (o 30 días a su plan pago) a{' '}
                                      <strong>{m.doctorName}</strong>. Solo se puede otorgar una
                                      vez.
                                    </p>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => void handleGrantGrace(m)}
                                        disabled={graceBusy === m.id}
                                        aria-label={`Confirmar mes de gracia para ${m.doctorName}`}
                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-500 text-white text-[11px] font-semibold hover:bg-teal-600 disabled:opacity-60 transition-colors"
                                      >
                                        {graceBusy === m.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Gift className="w-3.5 h-3.5" />
                                        )}
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => setConfirmGraceId(null)}
                                        disabled={graceBusy === m.id}
                                        aria-label={`Cancelar el mes de gracia para ${m.doctorName}`}
                                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] hover:bg-slate-50 disabled:opacity-60 transition-colors"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmGraceId(m.id)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-200 text-teal-700 bg-teal-50 text-xs hover:bg-teal-100 transition-colors"
                                    title="Otorgar mes de gracia"
                                  >
                                    <Gift className="w-3.5 h-3.5" />
                                    Mes de gracia
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Paginator
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                pageSizeOptions={[25, 50, 100]}
              />
            </>
          )}
        </div>
      </div>

      {/* Contactar modal */}
      {contactDoctorId && (
        <ContactarModal doctorId={contactDoctorId} onClose={() => setContactDoctorId(null)} />
      )}
    </>
  );
}
