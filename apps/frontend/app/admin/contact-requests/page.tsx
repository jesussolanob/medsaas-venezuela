'use client';

/**
 * /admin/contact-requests
 *
 * Admin view for specialist "Contáctame ya" requests.
 * Filters: status, date range.
 * Actions: view contact info, mark contacted/resolved, edit notes.
 */

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  PhoneCall,
  Filter,
  Loader2,
  CheckCircle2,
  Clock,
  CheckCheck,
  ChevronRight,
  Pencil,
  X,
  Save,
  MessageCircle,
  Phone,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { ContactarModal } from '@/components/admin/ContactarModal';
import DateRangeFilter, { type DateRangeValue } from '@/components/admin/DateRangeFilter';
import Paginator from '@/components/ui/Paginator';
import { showToast } from '@/components/ui/Toaster';
import { Toaster } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactRequest {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  doctorPhone: string | null;
  doctorPlan: string;
  doctorSpecialty: string | null;
  channel: string;
  message: string | null;
  status: string;
  handledBy: string | null;
  handledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'contacted', label: 'Contactados' },
  { value: 'resolved', label: 'Resueltos' },
];

const PAGE_SIZE = 50;

const CHANNEL_LABELS: Record<string, string> = {
  call_now: 'Llámame ya',
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  email: 'Correo',
};

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  call_now: PhoneCall,
  whatsapp: MessageCircle,
  call: Phone,
  email: Mail,
};

const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Delta Free',
  basic: 'Delta Base',
  professional: 'Delta Plus',
  clinic: 'Delta Clínica',
  trial: 'Período de prueba',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCaracasDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Caracas',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: string }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        Pendiente
      </span>
    );
  }
  if (status === 'contacted') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <CheckCircle2 className="w-3 h-3" />
        Contactado
      </span>
    );
  }
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCheck className="w-3 h-3" />
        Resuelto
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
      {status}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const label = CHANNEL_LABELS[channel] ?? channel;
  const Icon = CHANNEL_ICONS[channel] ?? PhoneCall;
  const isUrgent = channel === 'call_now';

  if (isUrgent) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
        <Icon className="w-3 h-3" />
        {label}
        <span className="text-[10px] bg-red-600 text-white px-1 rounded">URGENTE</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Notes editor inline
// ---------------------------------------------------------------------------

function NotesEditor({
  requestId,
  initialNotes,
  onSaved,
}: {
  requestId: string;
  initialNotes: string | null;
  onSaved: (notes: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/contact-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value.trim() || null }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        showToast({ type: 'error', message: json.error ?? 'Error al guardar notas' });
        return;
      }
      onSaved(value.trim() || null);
      setEditing(false);
      showToast({ type: 'success', message: 'Notas guardadas' });
    } catch {
      showToast({ type: 'error', message: 'Error de red' });
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2 group">
        <p className="text-xs text-slate-500 flex-1 min-w-0">
          {initialNotes ? (
            <span className="text-slate-700">{initialNotes}</span>
          ) : (
            <span className="italic">Sin notas</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 p-1 rounded text-slate-400 hover:text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Editar notas"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <textarea
        rows={2}
        value={value}
        onChange={(e: { target: { value: string } }) => setValue(e.target.value)}
        maxLength={2000}
        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-teal-500 outline-none"
        placeholder="Agrega notas de seguimiento…"
        autoFocus
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-teal-500 text-white rounded-md hover:bg-teal-600 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(initialNotes ?? '');
            setEditing(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <X className="w-3 h-3" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ContactRequestsPage() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState('pending');
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: null, to: null });
  const [page, setPage] = useState(1);

  const [contactTarget, setContactTarget] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // loadTrigger lets external actions (e.g. updateStatus) request a reload
  // without calling setState inside a useEffect body.
  const [loadTrigger, setLoadTrigger] = useState(0);

  const offset = (page - 1) * PAGE_SIZE;

  // Data loading — defined inside useEffect so it never triggers the
  // react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (dateRange.from) {
          // Convert YYYY-MM-DD Caracas day to ISO with offset for backend
          params.set('from', `${dateRange.from}T00:00:00-04:00`);
        }
        if (dateRange.to) {
          params.set('to', `${dateRange.to}T23:59:59-04:00`);
        }
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(offset));

        const res = await fetch(`/api/admin/contact-requests?${params.toString()}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as {
          data?: ContactRequest[];
          meta?: { total?: number };
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? 'Error al cargar solicitudes');
        if (!cancelled) {
          setRequests(Array.isArray(json.data) ? json.data : []);
          setTotal(json.meta?.total ?? 0);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error de red');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, dateRange, offset, loadTrigger]);

  // Status and date filter changes reset pagination to page 1.
  // Done inline in the handler to avoid a second useEffect with setState.
  function changeStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function changeDateRange(value: DateRangeValue) {
    setDateRange(value);
    setPage(1);
  }

  async function updateStatus(id: string, status: 'contacted' | 'resolved') {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/contact-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        showToast({ type: 'error', message: json.error ?? 'Error al actualizar' });
        return;
      }
      showToast({
        type: 'success',
        message: status === 'contacted' ? 'Marcado como contactado' : 'Marcado como resuelto',
      });
      setLoadTrigger((n) => n + 1);
    } catch {
      showToast({ type: 'error', message: 'Error de red' });
    } finally {
      setActionLoading(null);
    }
  }

  function handleNotesSaved(id: string, notes: string | null) {
    setRequests((prev: ContactRequest[]) =>
      prev.map((r: ContactRequest) => (r.id === id ? { ...r, notes } : r)),
    );
  }

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitudes de contacto</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Especialistas que solicitaron ser contactados por el equipo de Delta.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <PhoneCall className="w-4 h-4 text-teal-500" />
          <span>
            {total} solicitud{total !== 1 ? 'es' : ''} encontrada{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => changeStatusFilter(opt.value)}
                className={[
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  statusFilter === opt.value
                    ? 'bg-white text-teal-600 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <DateRangeFilter value={dateRange} onChange={changeDateRange} syncUrl={false} />

          {/* Refresh */}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Loader2 className={['w-3.5 h-3.5', loading ? 'animate-spin' : ''].join(' ')} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && requests.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Cargando solicitudes…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 py-8 text-red-600 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <PhoneCall className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay solicitudes con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Especialista
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Canal
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Mensaje
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Fecha
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Notas
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req: ContactRequest) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    {/* Specialist */}
                    <td className="px-4 py-3">
                      <div className="min-w-[160px]">
                        <p className="font-semibold text-slate-900 leading-tight">
                          {req.doctorName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{req.doctorEmail}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                            {PLAN_LABELS[req.doctorPlan] ?? req.doctorPlan}
                          </span>
                          {req.doctorSpecialty && (
                            <span className="text-[11px] text-slate-400">
                              {req.doctorSpecialty}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Channel */}
                    <td className="px-4 py-3">
                      <ChannelBadge channel={req.channel} />
                    </td>

                    {/* Message */}
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-600 max-w-[200px] line-clamp-2">
                        {req.message ?? <span className="italic text-slate-400">Sin mensaje</span>}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-slate-600">
                        {formatCaracasDateTime(req.createdAt)}
                      </p>
                      {req.handledAt && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Atendido: {formatCaracasDateTime(req.handledAt)}
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusPill status={req.status} />
                    </td>

                    {/* Notes */}
                    <td className="px-4 py-3">
                      <div className="min-w-[140px] max-w-[200px]">
                        <NotesEditor
                          requestId={req.id}
                          initialNotes={req.notes}
                          onSaved={(notes) => handleNotesSaved(req.id, notes)}
                        />
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap min-w-[180px]">
                        {/* Contactar (opens doctor contact info modal) */}
                        <button
                          type="button"
                          onClick={() => setContactTarget(req.doctorId)}
                          className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          <ChevronRight className="w-3 h-3" />
                          Contactar
                        </button>

                        {/* Mark contacted */}
                        {req.status === 'pending' && (
                          <button
                            type="button"
                            disabled={actionLoading === req.id}
                            onClick={() => void updateStatus(req.id, 'contacted')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            {actionLoading === req.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            Marcar contactado
                          </button>
                        )}

                        {/* Mark resolved */}
                        {req.status !== 'resolved' && (
                          <button
                            type="button"
                            disabled={actionLoading === req.id}
                            onClick={() => void updateStatus(req.id, 'resolved')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            {actionLoading === req.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCheck className="w-3 h-3" />
                            )}
                            Marcar resuelto
                          </button>
                        )}

                        {/* View specialist profile */}
                        <Link
                          href={`/admin/doctors?focus=${req.doctorId}`}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-teal-600 hover:underline whitespace-nowrap"
                        >
                          Ver perfil →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginator
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
            pageSizeOptions={[50]}
          />
        </div>
      )}

      {/* Contactar modal */}
      {contactTarget && (
        <ContactarModal doctorId={contactTarget} onClose={() => setContactTarget(null)} />
      )}
    </div>
  );
}
