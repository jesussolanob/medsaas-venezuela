'use client';

import { useState, useEffect } from 'react';
import { reportError } from '@/lib/report-error';

/**
 * Divisa en la que el especialista MUESTRA sus precios.
 *
 * No hay conversión de por medio: un servicio cargado en 50 se muestra como
 * $50 o €50 según lo que eligió en Configuración. Lo único que cambia de
 * verdad es el símbolo y la tasa con la que se calcula el equivalente en
 * bolívares. Decisión del dueño (2026-08-16).
 *
 * OJO: esto NO aplica al plan que el especialista le paga a Delta — eso lo
 * fijan los administradores y es SIEMPRE USD.
 */
export type PortalCurrency = { code: 'USD' | 'EUR'; symbol: '$' | '€' };

export function currencyForMode(mode: string): PortalCurrency {
  return mode === 'eur_bcv' ? { code: 'EUR', symbol: '€' } : { code: 'USD', symbol: '$' };
}

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
  /** Símbolo de la divisa elegida por el especialista ('$' o '€'). */
  symbol: string;
  /** Código ISO de esa divisa, para textos donde el símbolo no alcanza. */
  currencyCode: 'USD' | 'EUR';
  /** Formatea un importe en la divisa del especialista: "$1,234.56" / "€1,234.56". */
  format: (amount: number | null | undefined) => string;
};

const amountFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Hook to fetch the doctor's configured exchange rate.
 * Respects profiles.currency_mode:
 *   - 'usd_bcv' → tasa oficial BCV USD (default)
 *   - 'eur_bcv' → tasa oficial BCV EUR
 *   - 'custom'  → tasa manual fijada por el doctor
 *
 * Fallback: si el doctor no está autenticado, consume /api/admin/bcv-rate (USD).
 */
/**
 * Preferencia del especialista pasada desde afuera.
 *
 * La usa la página pública `/book/:doctorId`: ahí no hay sesión, así que el
 * hook no puede leer `/api/doctor/exchange-rate` y caía a dólar oficial —
 * el paciente veía `$` y otra tasa mientras el especialista veía `€`.
 * Los datos vienen en el payload público del booking.
 */
export type ExchangeRateOverride = {
  mode?: string | null;
  customRate?: number | null;
};

export function useBcvRate(override?: ExchangeRateOverride): BcvRateData {
  const [rate, setRate] = useState<number | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  // El modo arranca en el que YA vino por props, no en el default de dólar.
  //
  // Si no, el booking público de un especialista en euros pintaba todos los
  // precios con `$` en el primer render y recién saltaba a `€` cuando resolvía
  // el fetch de la tasa: el paciente veía la divisa equivocada durante un
  // instante. La preferencia no depende de esa llamada — el Server Component ya
  // la pasó por props —, así que el símbolo puede ser correcto desde el
  // principio. Solo la tasa numérica en bolívares sigue llegando después.
  const [mode, setMode] = useState<string>(() => override?.mode ?? 'usd_bcv');
  const [label, setLabel] = useState<string>(() => {
    // Mismos textos que fija `fetchRate`, para que el rótulo tampoco cambie
    // debajo del cursor cuando resuelve la tasa.
    if (override?.mode === 'custom') return 'Tasa personalizada';
    if (override?.mode === 'eur_bcv') return 'EUR → BsS (BCV)';
    return 'USD → BsS (BCV)';
  });
  const [loading, setLoading] = useState(true);

  async function fetchRate() {
    setLoading(true);
    try {
      // 1. Preferencia del doctor: modo elegido en "Métodos de pago" + tasa personalizada.
      let prefMode = 'usd_bcv';
      let customRate: number | null = null;
      let customLabel = '';

      if (override !== undefined) {
        // La preferencia llega por props (booking público, sin sesión): se usa
        // esa y NO se consulta el endpoint autenticado.
        //
        // La condición mira si HAY override, no si `override.mode` es verdadero.
        // Con `if (override?.mode)` un payload sin modo —el backend lo devuelve
        // null cuando el perfil nunca lo fijó, y la respuesta de `/info` está
        // cacheada 60s— caía al `else` y consultaba `/api/doctor/exchange-rate`.
        // En el navegador del propio especialista ese endpoint responde 200 con
        // SU preferencia: la página arrancaba en `$` y saltaba a `€`. Peor: lo
        // que veía el visitante dependía de si había una sesión de médico
        // abierta en ese navegador. Una página pública no puede leer una sesión.
        prefMode = override.mode || 'usd_bcv';
        customRate = override.customRate ?? null;
      } else {
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
        if (prefMode === 'eur_bcv') {
          // La DIVISA es del especialista y no depende de que el BCV publique
          // la tasa del euro. Antes, si `eur_rate` faltaba o venía en 0, este
          // bloque caía al `else if` y hacía `setMode('usd_bcv')`: sus precios
          // pasaban a mostrarse en dólares sin que nadie lo pidiera ni lo
          // avisara. Ahora se conserva `€` y, sin tasa, el equivalente en
          // bolívares queda en "—" — que es la verdad.
          setMode('eur_bcv');
          setLabel('EUR → BsS (BCV)');
          if (typeof bcv?.eur_rate === 'number' && bcv.eur_rate > 0) {
            setRate(bcv.eur_rate);
            setDateLabel(bcv.eur_date || bcv.date || '');
          }
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
    // Se re-consulta si cambia la preferencia recibida por props (el payload
    // público del booking llega después del primer render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override?.mode, override?.customRate]);

  function toBs(amount: number): string {
    if (!rate) return '—';
    return `Bs. ${(amount * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function toBsNum(amount: number): number {
    if (!rate) return 0;
    return amount * rate;
  }

  const { code: currencyCode, symbol } = currencyForMode(mode);

  function format(amount: number | null | undefined): string {
    return `${symbol}${amountFmt.format(Number(amount || 0))}`;
  }

  return {
    rate,
    dateLabel,
    mode,
    label,
    loading,
    refresh: fetchRate,
    toBs,
    toBsNum,
    symbol,
    currencyCode,
    format,
  };
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
