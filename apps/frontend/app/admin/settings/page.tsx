'use client';

import { useEffect, useState } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  UserPlus,
} from 'lucide-react';

type Admin = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
};

type RateSource = 'binance' | 'bcv' | 'manual';
type RatesSummary = {
  source: RateSource;
  manual: number | null;
  binance: number | null;
  bcv: number | null;
  effective: number | null;
};

const SOURCE_LABELS: Record<RateSource, string> = {
  binance: 'Binance P2P',
  bcv: 'BCV oficial',
  manual: 'Manual',
};

const fmtRate = (v: number | null | undefined): string =>
  v != null
    ? v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '—';

export default function AdminSettingsPage() {
  // ── Administradores ────────────────────────────────────────────────────────
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [newAdminOpen, setNewAdminOpen] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ email: '', full_name: '', phone: '', password: '' });
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ── BCV (USD + EUR) ──────────────────────────────────────────────────────
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvUpdated, setBcvUpdated] = useState<string | null>(null);
  const [eurRate, setEurRate] = useState<number | null>(null);
  const [eurUpdated, setEurUpdated] = useState<string | null>(null);
  const [bcvLoading, setBcvLoading] = useState(false);
  const [bcvMsg, setBcvMsg] = useState<string | null>(null);

  // ── Fuente de tasa del sistema (Binance P2P / BCV / Manual) ───────────────
  // A diferencia del bloque informativo BCV de arriba, ESTA es la tasa que el
  // sistema usa de verdad (booking, finanzas, exchange-rate del doctor).
  const [rates, setRates] = useState<RatesSummary | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [savingSource, setSavingSource] = useState<RateSource | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [ratesMsg, setRatesMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function loadAdmins() {
    setLoadingAdmins(true);
    try {
      const r = await fetch('/api/admin/admins');
      const j = await r.json();
      if (r.ok) setAdmins(j.data || []);
    } finally {
      setLoadingAdmins(false);
    }
  }

  async function loadBCV() {
    setBcvLoading(true);
    setBcvMsg(null);
    try {
      const r = await fetch('/api/admin/bcv-rate', { cache: 'no-store' });
      const j = await r.json();
      if (j.rate) {
        setBcvRate(j.rate);
        setBcvUpdated(j.updated || j.date || null);
      }
      if (j.eur_rate) {
        setEurRate(j.eur_rate);
        setEurUpdated(j.eur_date || null);
      }
      if (!j.rate && !j.eur_rate) {
        setBcvMsg('No se pudo obtener las tasas BCV');
      }
    } catch {
      setBcvMsg('Error al consultar BCV');
    } finally {
      setBcvLoading(false);
    }
  }

  async function loadRates() {
    setRatesLoading(true);
    try {
      const r = await fetch('/api/admin/settings/rates', { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) {
        const summary = j as RatesSummary;
        setRates(summary);
        if (typeof summary.manual === 'number') setManualInput(String(summary.manual));
      } else {
        setRatesMsg({ kind: 'err', text: j.error || 'Error al cargar tasas' });
      }
    } catch {
      setRatesMsg({ kind: 'err', text: 'Error al cargar tasas' });
    } finally {
      setRatesLoading(false);
    }
  }

  async function changeSource(source: RateSource) {
    setSavingSource(source);
    setRatesMsg(null);
    try {
      const payload: { source: RateSource; value?: number } = { source };
      if (source === 'manual') {
        const v = parseFloat(manualInput);
        if (!isFinite(v) || v <= 0) {
          setRatesMsg({ kind: 'err', text: 'Ingresa una tasa manual válida (mayor a 0)' });
          setSavingSource(null);
          return;
        }
        payload.value = v;
      }
      const r = await fetch('/api/admin/settings/rate-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        setRatesMsg({ kind: 'err', text: j.error || 'Error al cambiar la fuente' });
      } else {
        setRatesMsg({ kind: 'ok', text: 'Fuente de tasa actualizada' });
        await loadRates();
      }
    } catch {
      setRatesMsg({ kind: 'err', text: 'Error al cambiar la fuente' });
    } finally {
      setSavingSource(null);
    }
  }

  useEffect(() => {
    loadAdmins();
    loadBCV();
    loadRates();
  }, []);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setSavingAdmin(true);
    setAdminMsg(null);
    try {
      const r = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin),
      });
      const j = await r.json();
      if (!r.ok) {
        setAdminMsg({ kind: 'err', text: j.error || 'Error al crear admin' });
      } else {
        setAdminMsg({ kind: 'ok', text: `Admin ${newAdmin.email} creado` });
        setNewAdmin({ email: '', full_name: '', phone: '', password: '' });
        setNewAdminOpen(false);
        loadAdmins();
      }
    } catch (err: any) {
      setAdminMsg({ kind: 'err', text: err?.message || 'Error' });
    } finally {
      setSavingAdmin(false);
    }
  }

  async function revokeAdmin(id: string, email: string) {
    if (!confirm(`¿Revocar acceso de super_admin a ${email}? Será degradado a doctor.`)) return;
    const r = await fetch(`/api/admin/admins?id=${id}`, { method: 'DELETE' });
    const j = await r.json();
    if (!r.ok) {
      setAdminMsg({ kind: 'err', text: j.error || 'Error al revocar' });
    } else {
      setAdminMsg({ kind: 'ok', text: `Acceso revocado para ${email}` });
      loadAdmins();
    }
  }

  return (
    <div>
      {/* PageHead Delta Health Tech */}
      <div className="mb-6">
        <h1
          className="font-semibold tracking-tight m-0 leading-tight"
          style={{
            fontFamily: 'var(--dh-font-display)',
            fontSize: 'clamp(22px, 3.2vw, 34px)',
            color: 'var(--dh-ink)',
          }}
        >
          Configuración
        </h1>
        <p className="mt-1.5 text-[15px]" style={{ color: 'var(--dh-gray-600)' }}>
          Administradores de la plataforma y tasa de cambio BCV
        </p>
      </div>

      <div className="space-y-5">
        {/* ── Administradores ── */}
        <section
          className="bg-white p-6"
          style={{ border: '1px solid var(--dh-gray-100)', borderRadius: 'var(--dh-r-lg)' }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" style={{ color: 'var(--dh-turquoise-700)' }} />
              <h2 className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
                Super administradores
              </h2>
            </div>
            <button
              onClick={() => setNewAdminOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition-all hover:-translate-y-px"
              style={{ background: 'var(--dh-ink)', color: '#fff' }}
            >
              <UserPlus className="w-4 h-4" /> Agregar admin
            </button>
          </div>

          {adminMsg && (
            <div
              className={`mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                adminMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {adminMsg.kind === 'ok' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {adminMsg.text}
            </div>
          )}

          {loadingAdmins ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : admins.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No hay administradores</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {admins.map((a) => (
                <div key={a.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {a.full_name || '—'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{a.email}</p>
                    {a.phone && <p className="text-xs text-slate-400">{a.phone}</p>}
                  </div>
                  <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-1 rounded-full bg-teal-50 text-teal-700">
                    Super admin
                  </span>
                  <button
                    onClick={() => revokeAdmin(a.id, a.email)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Revocar acceso"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario nuevo admin */}
          {newAdminOpen && (
            <form onSubmit={createAdmin} className="mt-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="Email"
                  required
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <input
                  type="text"
                  placeholder="Nombre completo"
                  required
                  value={newAdmin.full_name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <input
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={newAdmin.phone}
                  onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <input
                  type="password"
                  placeholder="Password (min 8 caracteres)"
                  required
                  minLength={8}
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewAdminOpen(false);
                    setAdminMsg(null);
                  }}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAdmin}
                  className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {savingAdmin ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Crear admin
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ── Fuente de tasa del sistema ── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-slate-900">Fuente de tasa del sistema</h2>
            </div>
            <button
              onClick={loadRates}
              disabled={ratesLoading}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {ratesLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Actualizar
            </button>
          </div>

          {ratesMsg && (
            <div
              className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                ratesMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {ratesMsg.kind === 'ok' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {ratesMsg.text}
            </div>
          )}

          {/* Tasa efectiva */}
          <div className="bg-teal-50 border border-teal-100 rounded-lg p-4 mb-4">
            <p className="text-xs text-teal-700 uppercase tracking-wider font-medium">
              Tasa efectiva (Bs por USD)
            </p>
            <p className="text-3xl font-bold text-teal-900 mt-1">{fmtRate(rates?.effective)}</p>
            <p className="text-xs text-teal-600 mt-1">
              Fuente activa: {rates ? SOURCE_LABELS[rates.source] : '—'}
            </p>
          </div>

          {/* Opciones de fuente */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['binance', 'bcv'] as const).map((src) => {
              const active = rates?.source === src;
              const value = src === 'binance' ? rates?.binance : rates?.bcv;
              const sub = src === 'binance' ? 'Paralelo (mercado)' : 'Banco Central';
              return (
                <button
                  key={src}
                  onClick={() => changeSource(src)}
                  disabled={savingSource !== null}
                  className={`text-left rounded-lg border p-4 transition-colors disabled:opacity-60 ${
                    active ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{SOURCE_LABELS[src]}</p>
                    {active && (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                        Activa
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                  <p className="text-lg font-bold text-slate-800 mt-2">{fmtRate(value)}</p>
                  {savingSource === src && (
                    <Loader2 className="w-3 h-3 animate-spin text-teal-500 mt-1" />
                  )}
                </button>
              );
            })}

            {/* Manual (se activa con el input de abajo) */}
            <div
              className={`rounded-lg border p-4 ${
                rates?.source === 'manual' ? 'border-teal-500 bg-teal-50' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{SOURCE_LABELS.manual}</p>
                {rates?.source === 'manual' && (
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                    Activa
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Valor fijo</p>
              <p className="text-lg font-bold text-slate-800 mt-2">{fmtRate(rates?.manual)}</p>
            </div>
          </div>

          {/* Input manual */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="number"
              step="0.01"
              min="0"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Tasa manual (Bs/$)"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
            />
            <button
              onClick={() => changeSource('manual')}
              disabled={savingSource === 'manual'}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {savingSource === 'manual' && <Loader2 className="w-4 h-4 animate-spin" />}
              Usar tasa manual
            </button>
          </div>

          <p className="text-xs mt-4" style={{ color: 'var(--dh-gray-600)' }}>
            Binance P2P = mercado paralelo (promedio de órdenes USDT/VES). BCV = tasa oficial. La
            tasa se refresca automáticamente al consultarse (cada ~10 min). Esta es la tasa que el
            sistema usa para convertir USD → Bs en booking, finanzas y reportes.
          </p>
        </section>

        {/* ── Tasa BCV ── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-slate-900">Tasa de cambio BCV</h2>
            </div>
            <button
              onClick={loadBCV}
              disabled={bcvLoading}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {bcvLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Actualizar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* USD card */}
            <div className="bg-slate-50 rounded-lg p-6">
              {bcvRate !== null ? (
                <>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                    USD → BsS
                  </p>
                  <p className="text-4xl font-bold text-slate-900 mt-2">
                    {bcvRate.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </p>
                  {bcvUpdated && (
                    <p className="text-xs text-slate-400 mt-2 truncate">{bcvUpdated}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">{bcvMsg || 'Cargando tasa USD…'}</p>
              )}
            </div>

            {/* EUR card */}
            <div className="bg-slate-50 rounded-lg p-6">
              {eurRate !== null ? (
                <>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                    EUR → BsS
                  </p>
                  <p className="text-4xl font-bold text-slate-900 mt-2">
                    {eurRate.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </p>
                  {eurUpdated && (
                    <p className="text-xs text-slate-400 mt-2 truncate">{eurUpdated}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">{bcvMsg || 'Cargando tasa EUR…'}</p>
              )}
            </div>
          </div>

          <p className="text-xs mt-4" style={{ color: 'var(--dh-gray-600)' }}>
            Fuente: Banco Central de Venezuela (bcv.org.ve) con fallback a PyDolarVe / DolarAPI. Se
            consulta automáticamente al cargar. Estas tasas se usan para convertir precios USD/EUR →
            BsS en citas, facturas y reportes.
          </p>
        </section>
      </div>
    </div>
  );
}
