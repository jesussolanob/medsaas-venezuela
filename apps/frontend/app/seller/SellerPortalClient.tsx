'use client';

/**
 * Portal del vendedor.
 *
 * Tres cosas, en el orden en que las necesita:
 *   1. Su CÓDIGO, para compartirlo. Es la mitad del mecanismo de atribución:
 *      lo que se registre con ese código se le acredita.
 *   2. Un resumen: cuántos especialistas registró y cómo se reparten por plan.
 *   3. La lista, con fecha de registro, última vez que entró y plan activo —
 *      que es lo que permite ver si el especialista está usando el producto o
 *      lo abandonó.
 *
 * El vendedor NO elige plan al dar de alta: el backend fija el de prueba. Por
 * eso el formulario no tiene selector de plan — no es que esté escondido.
 */

import { useCallback, useEffect, useState } from 'react';
import { Users, Copy, Check, Loader2, UserPlus, AlertCircle, X } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

type SpecialistRow = {
  id: string;
  fullName: string;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  lastSignInAt?: string | null;
};

const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Prueba',
  delta_free: 'Delta Free',
  delta_base: 'Delta Base',
  delta_plus: 'Delta Plus',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Días desde la última vez que entró — para ver de un vistazo si lo abandonó. */
function actividad(lastSignInAt: string | null | undefined): {
  label: string;
  className: string;
} {
  if (!lastSignInAt) {
    return { label: 'Nunca entró', className: 'bg-red-50 text-red-600' };
  }
  const dias = Math.floor((Date.now() - new Date(lastSignInAt).getTime()) / 86_400_000);
  if (dias <= 7) return { label: 'Activo', className: 'bg-emerald-50 text-emerald-700' };
  if (dias <= 30) return { label: `Hace ${dias} días`, className: 'bg-amber-50 text-amber-700' };
  return { label: `Hace ${dias} días`, className: 'bg-slate-100 text-slate-500' };
}

export default function SellerPortalClient() {
  const [code, setCode] = useState<string | null>(null);
  const [rows, setRows] = useState<SpecialistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', specialty: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, listRes] = await Promise.all([
        fetch('/api/seller/me', { cache: 'no-store' }),
        fetch('/api/seller/specialists', { cache: 'no-store' }),
      ]);
      if (meRes.ok) {
        const j = (await meRes.json()) as { data?: { sellerCode: string | null } };
        setCode(j.data?.sellerCode ?? null);
      }
      if (listRes.ok) {
        const j = (await listRes.json()) as { data?: SpecialistRow[] };
        setRows(Array.isArray(j.data) ? j.data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // En un tick aparte: arrancar la carga desde el cuerpo del efecto encadena
    // renders (el primer setState del fetch cae dentro del mismo commit).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function crear() {
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('El nombre y el correo son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/seller/specialists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error || 'No se pudo registrar el especialista.');
        return;
      }
      showToast({ type: 'success', message: 'Especialista registrado' });
      setForm({ fullName: '', email: '', specialty: '', phone: '' });
      setShowForm(false);
      await load();
    } catch {
      setError('No se pudo registrar el especialista.');
    } finally {
      setSaving(false);
    }
  }

  // Resumen por plan — el conteo que pidió la fundadora.
  const porPlan = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.plan ?? 'sin_plan';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mis especialistas</h1>
            <p className="text-sm text-slate-500">
              Los que registraste vos o que se registraron con tu código.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 g-bg text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <UserPlus className="w-4 h-4" />
            Registrar especialista
          </button>
        </header>

        {/* El código, arriba de todo: es lo que tiene que compartir */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Tu código de vendedor
          </p>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          ) : code ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xl font-extrabold tracking-[0.2em] text-teal-700 font-mono">
                {code}
              </span>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </>
                )}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Todavía no tenés un código asignado.</p>
          )}
          <p className="text-xs text-slate-500 mt-3">
            El especialista lo escribe al registrarse, en el campo{' '}
            <strong>&ldquo;Código de vendedor&rdquo;</strong>. Lo que se registre con tu código se
            te acredita automáticamente.
          </p>
        </section>

        {/* Resumen */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-2xl font-extrabold text-slate-900">{rows.length}</p>
            <p className="text-xs text-slate-500 font-medium">registrados</p>
          </div>
          {Object.entries(porPlan).map(([plan, n]) => (
            <div key={plan} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-teal-700">{n}</p>
              <p className="text-xs text-slate-500 font-medium">
                {PLAN_LABELS[plan] ?? 'Sin plan'}
              </p>
            </div>
          ))}
        </section>

        {/* Lista */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Todavía no registraste ningún especialista.</p>
              <p className="text-xs text-slate-400 mt-1">
                Compartí tu código o usá &ldquo;Registrar especialista&rdquo;.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Especialista</th>
                    <th className="px-5 py-3">Registrado</th>
                    <th className="px-5 py-3">Última entrada</th>
                    <th className="px-5 py-3">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const act = actividad(r.lastSignInAt);
                    return (
                      <tr
                        key={r.id}
                        className={i < rows.length - 1 ? 'border-b border-slate-100' : ''}
                      >
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-800">{r.fullName}</p>
                          <p className="text-xs text-slate-400">{r.specialty || '—'}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{fmtDate(r.createdAt)}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${act.className}`}
                          >
                            {act.label}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-semibold text-slate-700">
                            {PLAN_LABELS[r.plan ?? ''] ?? '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Alta de especialista */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => !saving && setShowForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">Registrar especialista</h2>
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                autoFocus
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Nombre y apellido"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
              />
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Correo"
                type="email"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
              />
              <div className="flex gap-2">
                <input
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  placeholder="Especialidad (opcional)"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                />
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Teléfono (opcional)"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              La cuenta arranca en el <strong>plan de prueba</strong>, igual que cualquier registro.
              El especialista mejora su plan pagando.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void crear()}
                disabled={saving}
                className="flex-1 py-2.5 g-bg text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
