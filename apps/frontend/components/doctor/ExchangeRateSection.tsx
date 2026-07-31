'use client';

/**
 * ExchangeRateSection
 *
 * Sección compacta de configuración de tasa de cambio incrustada en el tab
 * "Métodos de pago" de /doctor/settings. Reemplaza la pantalla dedicada
 * /doctor/settings/exchange-rate que fue eliminada.
 *
 * Responsabilidades:
 * - Cargar la configuración guardada con loadExchangeRate()
 * - Mostrar las tasas BCV en vivo (USD y EUR) desde /api/admin/bcv-rate
 * - Permitir seleccionar el modo: usd_bcv | eur_bcv | custom
 * - Guardar con saveExchangeRate()
 * - Mostrar feedback ok/error al guardar
 */

import { useEffect, useState } from 'react';
import {
  DollarSign,
  Euro,
  Edit3,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { loadExchangeRate, saveExchangeRate } from '@/app/doctor/settings/actions';
import { showToast } from '@/components/ui/Toaster';

type ExchangeMode = 'usd_bcv' | 'eur_bcv' | 'custom';

interface BcvRates {
  usd: number | null;
  eur: number | null;
}

interface SaveMsg {
  kind: 'ok' | 'err';
  text: string;
}

export default function ExchangeRateSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<SaveMsg | null>(null);

  const [mode, setMode] = useState<ExchangeMode>('usd_bcv');
  const [customRate, setCustomRate] = useState<string>('');
  const [customLabel, setCustomLabel] = useState<string>('');

  const [bcvRates, setBcvRates] = useState<BcvRates>({ usd: null, eur: null });
  const [bcvLoading, setBcvLoading] = useState(false);

  async function fetchBcvRates() {
    setBcvLoading(true);
    try {
      const res = await fetch('/api/admin/bcv-rate', { cache: 'no-store' });
      const json = await res.json();
      setBcvRates({
        usd: typeof json.rate === 'number' ? json.rate : null,
        eur: typeof json.eur_rate === 'number' ? json.eur_rate : null,
      });
    } catch {
      /* no-bloqueante: muestra "—" si falla */
    } finally {
      setBcvLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [data] = await Promise.all([loadExchangeRate(), fetchBcvRates()]);
      if (data) {
        setMode(data.mode);
        setCustomRate(data.customRate != null ? String(data.customRate) : '');
        setCustomLabel(data.customRateLabel ?? '');
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      if (mode === 'custom') {
        const n = Number(customRate);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Ingresa un valor válido mayor a cero para la tasa personalizada');
        }
      }
      const result = await saveExchangeRate({
        mode,
        custom_rate: mode === 'custom' ? Number(customRate) : null,
        custom_rate_label: mode === 'custom' ? customLabel || null : null,
      });
      if (!result.ok) throw new Error(result.error ?? 'Error al guardar');
      showToast({ type: 'success', message: 'Tasa de cambio guardada' });
      setMsg({ kind: 'ok', text: 'Tasa de cambio guardada' });
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : 'Error al guardar';
      showToast({ type: 'error', message: text });
      setMsg({ kind: 'err', text });
    } finally {
      setSaving(false);
    }
  }

  function formatRate(value: number | null): string {
    if (value == null) return '—';
    return value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  const radioBase =
    'flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none';
  const radioActive = 'border-teal-500 bg-teal-50/60';
  const radioIdle = 'border-slate-200 hover:bg-slate-50';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <section aria-label="Configuración de tasa de cambio" className="space-y-3">
      {/* Encabezado de sección */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">
            Tasa de cambio
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Elige con cuál tasa convertir precios USD/EUR a bolívares en citas y facturas.
          </p>
        </div>
        {/* Tasas BCV en vivo (compacto) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              <DollarSign className="w-3 h-3 text-teal-600" />
              {bcvLoading ? '…' : formatRate(bcvRates.usd)} Bs
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1 font-medium">
              <Euro className="w-3 h-3 text-teal-600" />
              {bcvLoading ? '…' : formatRate(bcvRates.eur)} Bs
            </span>
          </div>
          <button
            type="button"
            onClick={fetchBcvRates}
            disabled={bcvLoading}
            aria-label="Actualizar tasas BCV"
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-white hover:text-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${bcvLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Feedback de guardado */}
      {msg && (
        <div
          role="alert"
          className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
            msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {msg.text}
        </div>
      )}

      {/* Radio group de modos */}
      <fieldset>
        <legend className="sr-only">Modo de conversión de tasa</legend>
        <div className="space-y-2">
          {/* Opción 1: USD BCV */}
          <label className={`${radioBase} ${mode === 'usd_bcv' ? radioActive : radioIdle}`}>
            <input
              type="radio"
              name="exchange-mode"
              value="usd_bcv"
              checked={mode === 'usd_bcv'}
              onChange={() => setMode('usd_bcv')}
              className="mt-0.5 accent-teal-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DollarSign className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="font-semibold text-slate-900 text-sm">Tasa BCV Oficial — USD</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 shrink-0">
                  RECOMENDADO
                </span>
                {bcvRates.usd != null && (
                  <span className="ml-auto text-sm font-bold text-slate-700">
                    {formatRate(bcvRates.usd)} Bs
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Se actualiza automáticamente desde el BCV. Convierte precios USD a Bs.
              </p>
            </div>
          </label>

          {/* Opción 2: EUR BCV */}
          <label className={`${radioBase} ${mode === 'eur_bcv' ? radioActive : radioIdle}`}>
            <input
              type="radio"
              name="exchange-mode"
              value="eur_bcv"
              checked={mode === 'eur_bcv'}
              onChange={() => setMode('eur_bcv')}
              className="mt-0.5 accent-teal-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Euro className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="font-semibold text-slate-900 text-sm">Tasa BCV Oficial — EUR</span>
                {bcvRates.eur != null && (
                  <span className="ml-auto text-sm font-bold text-slate-700">
                    {formatRate(bcvRates.eur)} Bs
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Útil si cobras en euros. Usa la tasa oficial EUR → BsS del BCV.
              </p>
            </div>
          </label>

          {/* Opción 3: Personalizada */}
          <label className={`${radioBase} ${mode === 'custom' ? radioActive : radioIdle}`}>
            <input
              type="radio"
              name="exchange-mode"
              value="custom"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
              className="mt-0.5 accent-teal-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="font-semibold text-slate-900 text-sm">Tasa personalizada</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Define tu propia tasa. No se actualiza automáticamente.
              </p>
              {mode === 'custom' && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="custom-rate-value"
                      className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1"
                    >
                      Tasa (1 unidad → Bs)
                    </label>
                    <input
                      id="custom-rate-value"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      placeholder="Ej: 43.50"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-rate-label"
                      className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1"
                    >
                      Etiqueta (opcional)
                    </label>
                    <input
                      id="custom-rate-label"
                      type="text"
                      maxLength={40}
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="Ej: Tasa clínica · paralelo"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
                    />
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>
      </fieldset>

      {/* Botón de guardado propio para la sección de tasa */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Guardar tasa
        </button>
      </div>
    </section>
  );
}
