'use client';

/**
 * Retention metrics card for Admin → Reuniones (plan de retención, fase 4).
 * Extracted from app/admin/team-meetings/page.tsx to keep the page under the
 * 800-line limit; behavior unchanged.
 */
import { useEffect, useState } from 'react';
import { Loader2, BarChart2, ChevronDown } from 'lucide-react';
import DateRangeFilter, { type DateRangeValue } from '@/components/admin/DateRangeFilter';
import { daysAgoCaracas, todayCaracas } from '@/lib/date-range';

interface RetentionMetrics {
  invitePreSent: number;
  inviteExpiredSent: number;
  inviteClicks: number;
  meetingsScheduledFromEmail: number;
  meetingsScheduledFromModal: number;
  meetingsDone: number;
  meetingsNoShow: number;
  graceMonthsGranted: number;
  contactRequestsPending: number;
  contactRequestsContacted: number;
  contactRequestsResolved: number;
  doctorsReturned: number;
}

type MetricsPeriod = '30d' | 'custom';

// ---------------------------------------------------------------------------
// MetricStat sub-component
// ---------------------------------------------------------------------------

function MetricStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-bold text-slate-800">{value}</span>
      <span className="text-[11px] text-slate-500 leading-tight">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RetentionMetricsCard
// ---------------------------------------------------------------------------

export function RetentionMetricsCard() {
  const [period, setPeriod] = useState<MetricsPeriod>('30d');
  const [customRange, setCustomRange] = useState<DateRangeValue>({ from: null, to: null });
  const [showCustom, setShowCustom] = useState(false);
  const [metrics, setMetrics] = useState<RetentionMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      const from = period === '30d' ? daysAgoCaracas(30) : (customRange.from ?? null);
      const to = period === '30d' ? todayCaracas() : (customRange.to ?? null);
      if (!from || !to) return;

      setLoadingMetrics(true);
      setMetricsError('');
      try {
        const res = await fetch(`/api/admin/retention/metrics?from=${from}&to=${to}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as {
          data?: RetentionMetrics;
          error?: string;
        };
        if (!cancelled) {
          if (!res.ok) {
            setMetricsError(json.error ?? 'No se pudieron cargar las métricas.');
          } else {
            setMetrics(json.data ?? null);
          }
        }
      } catch {
        if (!cancelled) setMetricsError('Error de red al cargar métricas.');
      } finally {
        if (!cancelled) setLoadingMetrics(false);
      }
    }

    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [period, customRange]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      {/* Card header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-teal-500" />
          <h2 className="text-sm font-semibold text-slate-700">Retención de especialistas</h2>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={period}
              onChange={(e) => {
                const v = e.target.value as MetricsPeriod;
                setPeriod(v);
                setShowCustom(v === 'custom');
              }}
              className="pl-3 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white text-slate-700 appearance-none cursor-pointer"
            >
              <option value="30d">Últimos 30 días</option>
              <option value="custom">Desde/Hasta</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          </div>

          {showCustom && (
            <DateRangeFilter
              value={customRange}
              onChange={(v) => setCustomRange(v)}
              syncUrl={false}
            />
          )}
        </div>
      </div>

      {/* Body */}
      {loadingMetrics ? (
        <div className="flex items-center gap-2 text-slate-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Cargando métricas…</span>
        </div>
      ) : metricsError ? (
        <p className="text-xs text-red-500">{metricsError}</p>
      ) : metrics ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-6 gap-y-4">
          {/* Invitaciones */}
          <MetricStat label="Inv. enviadas (7 días)" value={metrics.invitePreSent} />
          <MetricStat label="Inv. enviadas (vencidas)" value={metrics.inviteExpiredSent} />
          <MetricStat label="Clics en el correo" value={metrics.inviteClicks} />

          {/* Reuniones */}
          <MetricStat label="Reuniones (correo)" value={metrics.meetingsScheduledFromEmail} />
          <MetricStat label="Reuniones (modal)" value={metrics.meetingsScheduledFromModal} />
          <MetricStat label="Realizadas" value={metrics.meetingsDone} />
          <MetricStat label="No asistió" value={metrics.meetingsNoShow} />
          <MetricStat label="Meses de gracia" value={metrics.graceMonthsGranted} />

          {/* Solicitudes de contacto */}
          <MetricStat label="Solicitudes pendientes" value={metrics.contactRequestsPending} />
          <MetricStat label="Contactadas" value={metrics.contactRequestsContacted} />
          <MetricStat label="Resueltas" value={metrics.contactRequestsResolved} />

          {/* Retorno */}
          <MetricStat label="Volvieron a entrar" value={metrics.doctorsReturned} />
        </div>
      ) : (
        <p className="text-xs text-slate-400">Seleccioná un rango para ver métricas.</p>
      )}
    </div>
  );
}
