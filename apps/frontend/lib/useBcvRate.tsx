'use client';

import { useState, useEffect } from 'react';
import { reportError } from '@/lib/report-error';

type BcvRateData = {
  rate: number | null;
  dateLabel: string;
  /** Modo de conversión que el doctor eligió: 'usd_bcv' | 'eur_bcv' | 'custom' */
  mode: string;
  /** Etiqueta corta del modo activo (ej: "USD → BsS BCV") */
  label: string;
  loading: boolean;
  refresh: () => void;
  /** Convert amount (USD/EUR según modo) to Bs string */
  toBs: (amount: number) => string;
  /** Convert amount to Bs number */
  toBsNum: (amount: number) => number;
};

/**
 * Hook to fetch the doctor's configured exchange rate.
 * Respects profiles.currency_mode:
 *   - 'usd_bcv' → tasa oficial BCV USD (default)
 *   - 'eur_bcv' → tasa oficial BCV EUR
 *   - 'custom'  → tasa manual fijada por el doctor
 *
 * Fallback: si el doctor no está autenticado, consume /api/admin/bcv-rate (USD).
 */
export function useBcvRate(): BcvRateData {
  const [rate, setRate] = useState<number | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [mode, setMode] = useState<string>('usd_bcv');
  const [label, setLabel] = useState<string>('USD → BsS');
  const [loading, setLoading] = useState(true);

  async function fetchRate() {
    setLoading(true);
    try {
      // 1. Preferencia del doctor: modo elegido en "Métodos de pago" + tasa personalizada.
      let prefMode = 'usd_bcv';
      let customRate: number | null = null;
      let customLabel = '';
      try {
        const prefRes = await fetch('/api/doctor/exchange-rate', { cache: 'no-store' });
        if (prefRes.ok) {
          const pref = await prefRes.json();
          if (typeof pref?.mode === 'string') prefMode = pref.mode;
          if (typeof pref?.customRate === 'number') customRate = pref.customRate;
          if (typeof pref?.customRateLabel === 'string') customLabel = pref.customRateLabel;
        }
      } catch {
        /* sin auth / error → se resuelve como BCV USD abajo */
      }

      // 2. Tasa personalizada: usar exactamente la que fijó el doctor.
      if (prefMode === 'custom' && customRate && customRate > 0) {
        setRate(customRate);
        setMode('custom');
        setLabel(customLabel || 'Tasa personalizada');
        setDateLabel('');
        return;
      }

      // 3. Modos BCV (usd_bcv / eur_bcv): usar la MISMA fuente BCV en vivo que
      //    muestra "Métodos de pago" (/api/admin/bcv-rate). Antes el backend
      //    devolvía la tasa USDT/global, distinta a la BCV → el costo en Bs no
      //    coincidía con la tasa seleccionada por el doctor.
      const bcvRes = await fetch('/api/admin/bcv-rate', { cache: 'no-store' });
      if (bcvRes.ok) {
        const bcv = await bcvRes.json();
        if (prefMode === 'eur_bcv' && typeof bcv?.eur_rate === 'number' && bcv.eur_rate > 0) {
          setRate(bcv.eur_rate);
          setMode('eur_bcv');
          setLabel('EUR → BsS (BCV)');
          setDateLabel(bcv.eur_date || bcv.date || '');
        } else if (typeof bcv?.rate === 'number' && bcv.rate > 0) {
          setRate(bcv.rate);
          setMode('usd_bcv');
          setLabel('USD → BsS (BCV)');
          setDateLabel(bcv.date || '');
        }
      }
    } catch (err) {
      reportError('useBcvRate', 'fetchRate', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRate();
  }, []);

  function toBs(amount: number): string {
    if (!rate) return '—';
    return `Bs. ${(amount * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function toBsNum(amount: number): number {
    if (!rate) return 0;
    return amount * rate;
  }

  return { rate, dateLabel, mode, label, loading, refresh: fetchRate, toBs, toBsNum };
}

/**
 * Inline component to display Bs equivalent in muted text.
 * Usage: <BsLabel usd={30} rate={bcvRate} />
 */
export function BsLabel({
  usd,
  rate,
  className = '',
}: {
  usd: number;
  rate: number | null;
  className?: string;
}) {
  if (!rate || !usd) return null;
  const bs = (usd * rate).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return <span className={`text-xs text-slate-400 ${className}`}>Bs. {bs}</span>;
}
