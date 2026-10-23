'use client';

/**
 * DateRangeFilter — compact date range picker for admin list pages.
 *
 * Controlled component:  from/to are YYYY-MM-DD strings (or null = unset).
 * Quick presets:         Hoy, Últimos 7 días, Este mes, Mes pasado, Limpiar.
 * Accessibility:         keyboard-usable, labelled inputs, visible focus rings.
 * URL sync:              syncs ?desde= and ?hasta= via router.replace (best effort).
 * Design:                teal-500 accent, slate borders, rounded-lg; compact.
 *
 * NOTE: The inner component is wrapped in <Suspense> so that useSearchParams()
 * does not cause a prerender error (Next.js App Router requirement).
 */

import { Suspense, useCallback, useEffect, useId } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CalendarDays, X } from 'lucide-react';
import {
  todayCaracas,
  daysAgoCaracas,
  startOfCurrentMonthCaracas,
  endOfPreviousMonthCaracas,
  startOfPreviousMonthCaracas,
} from '@/lib/date-range';

export interface DateRangeValue {
  from: string | null;
  to: string | null;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  /** Whether to sync the range to URL query params ?desde= and ?hasta=. Default true. */
  syncUrl?: boolean;
}

const INPUT_CLS =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] ' +
  'text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 ' +
  'transition-colors';

type Preset = 'today' | '7d' | 'month' | 'prev_month';

function buildPreset(p: Preset): DateRangeValue {
  const today = todayCaracas();
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: daysAgoCaracas(6), to: today };
    case 'month':
      return { from: startOfCurrentMonthCaracas(), to: today };
    case 'prev_month':
      return { from: startOfPreviousMonthCaracas(), to: endOfPreviousMonthCaracas() };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prev_month', label: 'Mes pasado' },
];

// Inner component that uses useSearchParams — must be wrapped in Suspense.
function DateRangeFilterInner({ value, onChange, syncUrl = true }: DateRangeFilterProps) {
  const uid = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { from, to } = value;
  const hasRange = Boolean(from || to);

  // Sync from URL params on mount (restore from shared link).
  useEffect(() => {
    if (!syncUrl) return;
    const urlFrom = searchParams.get('desde') || null;
    const urlTo = searchParams.get('hasta') || null;
    if (urlFrom !== from || urlTo !== to) {
      onChange({ from: urlFrom, to: urlTo });
    }
    // Only run on mount — we don't want to react to every searchParams change
    // because that would create a loop when we write back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushUrl = useCallback(
    (next: DateRangeValue) => {
      if (!syncUrl) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next.from) {
        params.set('desde', next.from);
      } else {
        params.delete('desde');
      }
      if (next.to) {
        params.set('hasta', next.to);
      } else {
        params.delete('hasta');
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false });
    },
    [syncUrl, searchParams, router, pathname],
  );

  const set = useCallback(
    (next: DateRangeValue) => {
      onChange(next);
      pushUrl(next);
    },
    [onChange, pushUrl],
  );

  const clear = () => set({ from: null, to: null });

  const activePreset = PRESETS.find(({ key }) => {
    const preset = buildPreset(key);
    return preset.from === from && preset.to === to;
  })?.key;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarDays className="w-4 h-4 shrink-0 text-slate-400" aria-hidden />

      {/* Desde */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={`${uid}-desde`}
          className="text-[12px] font-medium text-slate-500 whitespace-nowrap"
        >
          Desde
        </label>
        <input
          id={`${uid}-desde`}
          type="date"
          value={from ?? ''}
          max={to ?? undefined}
          onChange={(e) => set({ from: e.target.value || null, to })}
          className={INPUT_CLS + ' w-[138px]'}
        />
      </div>

      {/* Hasta */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={`${uid}-hasta`}
          className="text-[12px] font-medium text-slate-500 whitespace-nowrap"
        >
          Hasta
        </label>
        <input
          id={`${uid}-hasta`}
          type="date"
          value={to ?? ''}
          min={from ?? undefined}
          onChange={(e) => set({ from, to: e.target.value || null })}
          className={INPUT_CLS + ' w-[138px]'}
        />
      </div>

      {/* Presets */}
      <div className="flex items-center gap-1 flex-wrap">
        {PRESETS.map(({ key, label }) => {
          const active = activePreset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => (active ? clear() : set(buildPreset(key)))}
              className={
                'px-2.5 py-1 rounded-lg text-[12px] font-semibold border transition-colors ' +
                (active
                  ? 'bg-teal-500 text-white border-teal-500'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')
              }
            >
              {label}
            </button>
          );
        })}

        {hasRange && (
          <button
            type="button"
            onClick={clear}
            title="Limpiar rango de fechas"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

// Exported wrapper — suspends during SSR so useSearchParams() is safe.
export default function DateRangeFilter(props: DateRangeFilterProps) {
  return (
    <Suspense fallback={<div className="h-8" />}>
      <DateRangeFilterInner {...props} />
    </Suspense>
  );
}
