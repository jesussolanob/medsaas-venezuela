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
import {
  Users,
  Copy,
  Check,
  Loader2,
  UserPlus,
  AlertCircle,
  X,
  Share2,
  LogOut,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

type SpecialistDetail = SpecialistRow & {
  email: string;
  phone: string | null;
  cedula: string | null;
  isActive: boolean;
};

type SpecialistRow = {
  id: string;
  fullName: string;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  lastSignInAt?: string | null;
  /** Terminó el alta (consultorio + servicio). El vendedor necesita ver a quién
   *  llamar porque quedó a mitad de camino. */
  onboardingCompleted?: boolean;
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

/**
 * Estado de seguimiento: a quién hay que llamar y por qué.
 *
 * El vendedor no necesita "cuántos días hace que no entra" como dato suelto:
 * necesita saber a quién perseguir. Por eso el orden es por urgencia comercial
 * y no cronológico —quien nunca entró y quien quedó a mitad del alta son dos
 * llamadas DISTINTAS— y por eso cada estado dice qué hacer:
 *
 *   1. Nunca entró            → el alta quedó en la nada, hay que activarlo.
 *   2. Registro incompleto    → entró pero no terminó de configurarse: no puede
 *                               cobrar ni recibir reservas, así que se va a ir
 *                               salvo que alguien lo ayude a terminar.
 *   3. Sin actividad / Activo → ya está operativo; solo importa si se enfrió.
 *
 * ⚠️ Los cortes (7 y 30 días) son los de esta pantalla; el panel de admin usa
 * 7 y 14 en `UsersPanel.tsx`. Ya divergían antes de este cambio. Unificarlos es
 * una decisión de producto pendiente, no algo que corresponda decidir acá.
 */
function estadoSeguimiento(row: { lastSignInAt?: string | null; onboardingCompleted?: boolean }): {
  label: string;
  className: string;
  detalle?: string;
} {
  if (!row.lastSignInAt) {
    return {
      label: 'Nunca entró',
      className: 'bg-red-50 text-red-600',
      detalle: 'Se registró y nunca inició sesión',
    };
  }

  // `undefined` = el backend todavía no manda el campo. No se acusa a nadie de
  // tener el registro incompleto por un dato que no llegó.
  if (row.onboardingCompleted === false) {
    return {
      label: 'Registro incompleto',
      className: 'bg-amber-50 text-amber-700',
      detalle: 'Entró pero no terminó de configurar consultorio y servicios',
    };
  }

  const dias = Math.floor((Date.now() - new Date(row.lastSignInAt).getTime()) / 86_400_000);
  if (dias <= 7) return { label: 'Activo', className: 'bg-emerald-50 text-emerald-700' };
  if (dias <= 30)
    return {
      label: `Hace ${dias} días`,
      className: 'bg-amber-50 text-amber-700',
      detalle: 'Se está enfriando',
    };
  return {
    label: `Hace ${dias} días`,
    className: 'bg-slate-100 text-slate-500',
    detalle: 'Sin actividad — conviene reactivarlo',
  };
}

export default function SellerPortalClient() {
  const [code, setCode] = useState<string | null>(null);
  const [rows, setRows] = useState<SpecialistRow[]>([]);
  // Nombre del vendedor: acompaña al botón de cerrar sesión, para que en una
  // máquina compartida se vea de quién es la sesión antes de cerrarla.
  const [nombre, setNombre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Ficha del especialista: se pide al abrirla y no se toma de la lista, para
  // pasar por el endpoint con guarda anti-IDOR y traer el dato fresco.
  const [ficha, setFicha] = useState<SpecialistDetail | null>(null);
  const [fichaCargando, setFichaCargando] = useState(false);
  const [fichaError, setFichaError] = useState('');
  // El enlace se arma en el cliente: el dominio cambia entre staging y prod,
  // asi que se toma del navegador en vez de hardcodearlo o pasarlo por env.
  const enlace = code
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/r/${code}`
    : '';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    specialty: '',
    phone: '',
    cedula: '',
  });
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
        const j = (await meRes.json()) as {
          data?: { sellerCode: string | null; fullName?: string | null };
        };
        setCode(j.data?.sellerCode ?? null);
        setNombre(j.data?.fullName ?? null);
      }
      if (listRes.ok) {
        const j = (await listRes.json()) as { data?: SpecialistRow[] };
        setRows(Array.isArray(j.data) ? j.data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cierra la sesión. Mismo comportamiento que los layouts de admin, doctor y
   * paciente: con Auth0 hay que pasar por su `/v2/logout`, porque borrar las
   * cookies locales NO cierra la sesión real y el vendedor seguiría dentro.
   */
  function cerrarSesion() {
    if (process.env.NEXT_PUBLIC_AUTH_MODE === 'auth0') {
      window.location.href = '/auth/logout';
      return;
    }
    document.cookie = 'dev_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'dev_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/login';
  }

  useEffect(() => {
    // En un tick aparte: arrancar la carga desde el cuerpo del efecto encadena
    // renders (el primer setState del fetch cae dentro del mismo commit).
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function abrirFicha(id: string) {
    setFicha(null);
    setFichaError('');
    setFichaCargando(true);
    try {
      const res = await fetch(`/api/seller/specialists/${id}`, { cache: 'no-store' });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: SpecialistDetail;
        error?: string;
      };
      if (!res.ok || !j.success || !j.data) {
        setFichaError(j.error ?? 'No se pudo cargar la ficha.');
        return;
      }
      setFicha(j.data);
    } catch {
      setFichaError('Error de conexión al cargar la ficha.');
    } finally {
      setFichaCargando(false);
    }
  }

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
      setForm({ fullName: '', email: '', specialty: '', phone: '', cedula: '' });
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
              {nombre ? `${nombre} — ` : ''}los que registraste vos o que se registraron con tu
              código.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 g-bg text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <UserPlus className="w-4 h-4" />
              Registrar especialista
            </button>
            {/*
              Cerrar sesión.

              El portal del vendedor es la única pantalla de la app SIN barra
              lateral —los portales de especialista, admin y paciente tienen la
              suya con este botón—, así que quedó sin ninguna forma de salir:
              el vendedor tenía que borrar cookies o cerrar el navegador. En una
              máquina compartida, que es donde trabaja un equipo comercial, eso
              deja la sesión abierta para el siguiente.
            */}
            <button
              onClick={cerrarSesion}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
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

          {/* El enlace: evita que el código se dicte y se tipee mal. */}
          {code && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Tu enlace para compartir
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs sm:text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all flex-1 min-w-[220px]">
                  {enlace}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(enlace);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {linkCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar enlace
                    </>
                  )}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Te comparto el enlace para registrarte en Delta Salud: ${enlace}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" /> WhatsApp
                </a>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Quien entre por acá queda asociado a vos{' '}
                <strong>sin tener que escribir nada</strong>: el código lo completa el sistema.
              </p>
            </div>
          )}
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
                    <th className="px-5 py-3">Seguimiento</th>
                    <th className="px-5 py-3">Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const act = estadoSeguimiento(r);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => void abrirFicha(r.id)}
                        className={`cursor-pointer hover:bg-slate-50/70 transition-colors ${
                          i < rows.length - 1 ? 'border-b border-slate-100' : ''
                        }`}
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
                          {act.detalle && (
                            <p className="text-[11px] text-slate-400 mt-1">{act.detalle}</p>
                          )}
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

      {/* Ficha del especialista */}
      {(ficha || fichaCargando || fichaError) && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => {
            setFicha(null);
            setFichaError('');
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {fichaCargando && (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando la ficha…
              </div>
            )}

            {fichaError && !fichaCargando && (
              <div className="text-center py-4">
                <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                <p className="text-sm text-red-600">{fichaError}</p>
              </div>
            )}

            {ficha && !fichaCargando && (
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{ficha.fullName}</h2>
                    <p className="text-xs text-slate-500">
                      {ficha.specialty || 'Sin especialidad'}
                    </p>
                  </div>
                  <button
                    onClick={() => setFicha(null)}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Cerrar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {!ficha.isActive && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-4">
                    Esta cuenta está <strong>dada de baja</strong>.
                  </div>
                )}

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase">Correo</dt>
                    <dd className="text-slate-800 break-all">{ficha.email}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase">Teléfono</dt>
                    <dd className="text-slate-800">
                      {ficha.phone ? (
                        <a href={`tel:${ficha.phone}`} className="text-teal-700 hover:underline">
                          {ficha.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">No cargado</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase">Cédula</dt>
                    <dd className="text-slate-800">{ficha.cedula || '—'}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <dt className="text-[11px] font-semibold text-slate-400 uppercase">Plan</dt>
                      <dd className="text-slate-800">{PLAN_LABELS[ficha.plan ?? ''] ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-slate-400 uppercase">Alta</dt>
                      <dd className="text-slate-800">{fmtDate(ficha.createdAt)}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase">
                      Último ingreso
                    </dt>
                    <dd className="text-slate-800">
                      {ficha.lastSignInAt ? fmtDate(ficha.lastSignInAt) : 'Nunca entró'}
                    </dd>
                  </div>
                </dl>

                <a
                  href={ficha.phone ? `https://wa.me/${ficha.phone}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                    ficha.phone
                      ? 'bg-teal-500 hover:bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-400 pointer-events-none'
                  }`}
                >
                  <Share2 className="w-4 h-4" />
                  {ficha.phone ? 'Escribirle por WhatsApp' : 'Sin teléfono cargado'}
                </a>
              </>
            )}
          </div>
        </div>
      )}

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
                  placeholder="Teléfono"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                />
              </div>
              {/*
                La cédula la aceptaba el backend desde siempre, pero el
                formulario no la pedía: el especialista terminaba tecleándola él
                en el onboarding, que es justo lo que el dueño quiere evitar.
                Cuanto más complete el vendedor acá, menos le piden a él después.
              */}
              <input
                value={form.cedula}
                onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                placeholder="Cédula"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
              />
            </div>

            <p className="text-xs text-slate-500">
              La cuenta arranca en el <strong>plan de prueba</strong>, igual que cualquier registro.
              El especialista mejora su plan pagando.
            </p>
            <p className="text-xs text-slate-500">
              Todo lo que cargues acá le queda precargado: cuanto más completo, menos datos le pide
              el sistema cuando entre por primera vez.
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
