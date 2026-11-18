'use client';

/**
 * SpecialistFollowUp — the seller's commercial follow-up ("gestión") of one
 * specialist, inside the specialist's card in the seller portal.
 *
 * - Shows the current status and lets the seller change it; every change can
 *   carry a comment.
 * - "Agregar comentario" adds a note without changing the status.
 * - History newest first. Date, time and author are stamped by the server and
 *   entries cannot be edited or deleted, so the history stays trustworthy.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquarePlus, ArrowRight } from 'lucide-react';
import {
  FOLLOW_UP_STATUS_LABELS,
  STORABLE_FOLLOW_UP_STATUSES,
  type FollowUpStatus,
} from '@delta/shared-types';
import { showToast } from '@/components/ui/Toaster';

interface Activity {
  id: string;
  type: 'status_change' | 'comment';
  fromStatus: FollowUpStatus | null;
  toStatus: FollowUpStatus | null;
  comment: string | null;
  createdAt: string;
  authorName: string | null;
}

interface Props {
  specialistId: string;
  /** Lets the table refresh its "Gestión" column after a change. */
  onChanged?: (status: FollowUpStatus, at: string) => void;
}

const MAX_COMMENT = 2000;

/** Pill colors per status: progress in teal/green, stalls in amber, lost in slate. */
export const FOLLOW_UP_PILL: Record<FollowUpStatus, string> = {
  sin_contactar: 'bg-slate-100 text-slate-600',
  primer_contacto: 'bg-sky-50 text-sky-700',
  no_atendio: 'bg-amber-50 text-amber-700',
  completar_onboarding: 'bg-amber-50 text-amber-700',
  induccion: 'bg-teal-50 text-teal-700',
  reactivar: 'bg-violet-50 text-violet-700',
  desistido: 'bg-slate-200 text-slate-500',
};

function labelOf(status: FollowUpStatus | null): string {
  return status ? (FOLLOW_UP_STATUS_LABELS[status] ?? status) : '—';
}

export function formatCaracasDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Caracas',
  }).format(new Date(iso));
}

export default function SpecialistFollowUp({ specialistId, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [current, setCurrent] = useState<FollowUpStatus>('sin_contactar');
  const [activities, setActivities] = useState<Activity[]>([]);

  // Form: a status (optional) + a comment (optional), at least one.
  const [nextStatus, setNextStatus] = useState<FollowUpStatus | ''>('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/seller/specialists/${specialistId}/activities`, {
        cache: 'no-store',
      });
      const j = (await res.json()) as {
        error?: string;
        data?: { currentStatus: FollowUpStatus; activities: Activity[] };
      };
      if (!res.ok || !j.data) {
        setLoadError(j.error ?? 'No se pudo cargar la gestión.');
        return;
      }
      setCurrent(j.data.currentStatus);
      setActivities(j.data.activities);
    } catch {
      setLoadError('No se pudo cargar la gestión.');
    } finally {
      setLoading(false);
    }
  }, [specialistId]);

  // In a separate tick, like the rest of the seller portal: calling setState
  // straight from the effect body chains renders (react-hooks lint rule).
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    const text = comment.trim();
    const status = nextStatus && nextStatus !== current ? nextStatus : '';
    if (!status && !text) {
      setFormError('Elige un estado nuevo o escribe un comentario.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/seller/specialists/${specialistId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(status ? { status } : {}), ...(text ? { comment: text } : {}) }),
      });
      const j = (await res.json()) as {
        error?: string;
        data?: { activity: Activity; currentStatus: FollowUpStatus };
      };
      if (!res.ok || !j.data) {
        setFormError(j.error ?? 'No se pudo guardar.');
        return;
      }
      const { activity, currentStatus } = j.data;
      setCurrent(currentStatus);
      setActivities((prev) => [activity, ...prev]);
      setNextStatus('');
      setComment('');
      onChanged?.(currentStatus, activity.createdAt);
      showToast({
        type: 'success',
        message: status ? `Estado: ${labelOf(currentStatus)}` : 'Comentario agregado',
      });
    } catch {
      setFormError('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando la gestión…
      </div>
    );
  }
  if (loadError) return <p className="text-sm text-red-600 py-2">{loadError}</p>;

  const changingStatus = nextStatus !== '' && nextStatus !== current;

  return (
    <section aria-labelledby="gestion-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="gestion-title" className="text-[11px] font-semibold text-slate-400 uppercase">
          Gestión
        </h3>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${FOLLOW_UP_PILL[current]}`}
        >
          {labelOf(current)}
        </span>
      </div>

      {/* Change status and/or comment */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <label htmlFor="followup-status" className="block text-xs font-medium text-slate-600">
          Cambiar estado
        </label>
        <select
          id="followup-status"
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as FollowUpStatus | '')}
          className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-teal-400 bg-white"
        >
          <option value="">Mantener: {labelOf(current)}</option>
          {STORABLE_FOLLOW_UP_STATUSES.filter((s) => s !== current).map((s) => (
            <option key={s} value={s}>
              {FOLLOW_UP_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={MAX_COMMENT}
          aria-label="Comentario"
          placeholder={
            changingStatus
              ? 'Comentario sobre este cambio (opcional): qué pasó, próximo paso…'
              : 'Escribe un comentario sobre la gestión…'
          }
          className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 resize-y"
        />
        {formError && <p className="text-xs text-red-600">{formError}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || (!changingStatus && !comment.trim())}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 text-sm font-semibold transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="w-4 h-4" />
          )}
          {changingStatus ? 'Guardar cambio de estado' : 'Agregar comentario'}
        </button>
      </div>

      {/* History */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase mb-2">Historial</h4>
        {activities.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay actividad con este especialista.</p>
        ) : (
          <ol className="space-y-3 border-l-2 border-slate-100 pl-3">
            {activities.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-[11px] text-slate-400">
                  {formatCaracasDateTime(a.createdAt)}
                  {a.authorName ? ` · ${a.authorName}` : ''}
                </p>
                {a.type === 'status_change' && (
                  <p className="flex flex-wrap items-center gap-1.5 mt-0.5 text-slate-700">
                    <span className="text-xs">{labelOf(a.fromStatus ?? 'sin_contactar')}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        a.toStatus ? FOLLOW_UP_PILL[a.toStatus] : ''
                      }`}
                    >
                      {labelOf(a.toStatus)}
                    </span>
                  </p>
                )}
                {a.comment && (
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.comment}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
