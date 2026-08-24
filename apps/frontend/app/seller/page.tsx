'use client';

/**
 * Inicio del portal del vendedor.
 *
 * Dos cosas, en el orden en que las necesita:
 *   1. Su CÓDIGO y su enlace, para compartirlos. Es la mitad del mecanismo de
 *      atribución y lo que usa todo el día, así que va arriba de todo.
 *   2. Cómo le está yendo — pero medido por lo que puede HACER algo al
 *      respecto, no por vanidad: a quién llamar, quién se está enfriando,
 *      cuántos de los que registró llegaron a usar el producto.
 *
 * Todas las métricas se derivan de la MISMA lista que muestra Especialistas.
 * No hay endpoint de métricas y no hace falta: la cartera de un vendedor cabe
 * holgadamente en una respuesta.
 */

import { useMemo, useState } from 'react';
import { Copy, Check, Loader2, Share2, TrendingUp, AlertCircle } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import {
  useSellerData,
  estadoSeguimiento,
  PLAN_LABELS,
  type EtapaKey,
  type SpecialistRow,
} from './seller-data';

/** Etapas del embudo, en orden de urgencia comercial. */
const ETAPAS: { key: EtapaKey; label: string; ayuda: string; color: string }[] = [
  {
    key: 'nunca_entro',
    label: 'Nunca entraron',
    ayuda: 'Se registraron y no iniciaron sesión — el alta quedó en la nada',
    color: 'var(--dh-error)',
  },
  {
    key: 'incompleto',
    label: 'Registro incompleto',
    ayuda: 'Entraron pero no configuraron consultorio y servicios: no pueden cobrar',
    color: 'var(--dh-warning)',
  },
  {
    key: 'enfriando',
    label: 'Sin actividad reciente',
    ayuda: 'Ya operan, pero hace más de una semana que no entran',
    color: 'var(--dh-gray-400)',
  },
  {
    key: 'activo',
    label: 'Activos',
    ayuda: 'Entraron en los últimos 7 días',
    color: 'var(--dh-success)',
  },
];

/** Etiqueta "ago. 2026" a partir de una clave "2026-08". */
function rotuloMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number);
  return new Date(anio, mes - 1, 1)
    .toLocaleDateString('es-VE', { month: 'short', year: '2-digit' })
    .replace('.', '');
}

/** Clave "YYYY-MM" en hora local, para agrupar altas por mes. */
function claveMes(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SellerInicioPage() {
  const { code, nombre, rows, loading } = useSellerData();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // El dominio cambia entre staging y prod: se toma del navegador en vez de
  // hardcodearlo o pasarlo por variable de entorno.
  const enlace = code
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/r/${code}`
    : '';

  const metricas = useMemo(() => {
    const total = rows.length;

    const porEtapa = ETAPAS.map((e) => ({
      ...e,
      n: rows.filter((r) => estadoSeguimiento(r).key === e.key).length,
    }));

    const porPlan = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.plan ?? 'sin_plan';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

    // Últimos 6 meses, incluidos los que no tuvieron altas: un hueco es
    // información (ese mes no registró a nadie), no una barra que se omite.
    const hoy = new Date();
    const meses: { clave: string; n: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push({ clave, n: rows.filter((r) => claveMes(r.createdAt) === clave).length });
    }

    const entraron = rows.filter((r: SpecialistRow) => !!r.lastSignInAt).length;
    const completaron = rows.filter((r: SpecialistRow) => r.onboardingCompleted === true).length;

    return {
      total,
      porEtapa,
      porPlan,
      meses,
      entraron,
      completaron,
      pctEntraron: total ? Math.round((entraron / total) * 100) : 0,
      pctCompletaron: total ? Math.round((completaron / total) * 100) : 0,
    };
  }, [rows]);

  async function copiar(texto: string, cual: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(texto);
      if (cual === 'code') {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch {
      showToast({ type: 'error', message: 'No se pudo copiar. Copialo a mano.' });
    }
  }

  const maxMes = Math.max(1, ...metricas.meses.map((m) => m.n));

  return (
    <div className="space-y-6">
      {nombre && <p className="text-sm text-slate-500 -mt-2">Hola, {nombre}.</p>}

      {/* ── Código y enlace ─────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Tu código de vendedor
        </p>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        ) : code ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-3xl font-extrabold tracking-[0.25em] text-teal-700 font-mono">
                {code}
              </span>
              <button
                onClick={() => void copiar(code, 'code')}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              El especialista lo escribe al registrarse, en el campo{' '}
              <strong>&ldquo;Código de vendedor&rdquo;</strong>. Lo que se registre con tu código se
              te acredita automáticamente.
            </p>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Tu enlace para compartir
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 min-w-[240px] text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 break-all">
                  {enlace}
                </code>
                <button
                  onClick={() => void copiar(enlace, 'link')}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {linkCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {linkCopied ? 'Copiado' : 'Copiar enlace'}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Te comparto el enlace para registrarte en Delta Salud: ${enlace}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 g-bg text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Quien entre por acá queda asociado a vos{' '}
                <strong>sin tener que escribir nada</strong>: el código lo completa el sistema.
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Todavía no tenés un código asignado. Pedíselo a un administrador — sin código no se te
              acredita lo que registres por enlace.
            </span>
          </div>
        )}
      </section>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando métricas…
        </div>
      ) : metricas.total === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Todavía no registraste ningún especialista.</p>
          <p className="text-xs text-slate-400 mt-1">
            Cuando lo hagas, acá vas a ver cómo avanza cada uno.
          </p>
        </section>
      ) : (
        <>
          {/* ── Tasa de activación ────────────────────────────────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-3xl font-extrabold text-slate-900 tabular-nums">
                {metricas.total}
              </p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">registrados en total</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-3xl font-extrabold text-teal-700 tabular-nums">
                {metricas.pctEntraron}%
              </p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                llegaron a entrar
                <span className="text-slate-400">
                  {' '}
                  · {metricas.entraron} de {metricas.total}
                </span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-3xl font-extrabold text-teal-700 tabular-nums">
                {metricas.pctCompletaron}%
              </p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                terminaron el alta
                <span className="text-slate-400">
                  {' '}
                  · {metricas.completaron} de {metricas.total}
                </span>
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Embudo ──────────────────────────────────────────────── */}
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-slate-900">En qué etapa está cada uno</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                Ordenado por urgencia: arriba, a quién conviene llamar hoy.
              </p>
              <div className="space-y-3">
                {metricas.porEtapa.map((e) => (
                  <div key={e.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">{e.label}</span>
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{e.n}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${metricas.total ? (e.n / metricas.total) * 100 : 0}%`,
                          background: e.color,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{e.ayuda}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Altas por mes ───────────────────────────────────────── */}
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-slate-900">Altas por mes</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Últimos seis meses.</p>
              <div className="flex items-end justify-between gap-2 h-32">
                {metricas.meses.map((m) => (
                  <div key={m.clave} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 tabular-nums">
                      {m.n || ''}
                    </span>
                    <div
                      className="w-full rounded-t-md transition-[height] duration-500"
                      style={{
                        height: `${Math.max(m.n ? 6 : 2, (m.n / maxMes) * 100)}%`,
                        background: m.n ? 'var(--dh-turquoise)' : 'var(--dh-gray-100)',
                      }}
                    />
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {rotuloMes(m.clave)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ── Reparto por plan ──────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4">Reparto por plan</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metricas.porPlan.map(([plan, n]) => (
                <div key={plan} className="border border-slate-100 rounded-lg p-3">
                  <p className="text-2xl font-extrabold text-teal-700 tabular-nums">{n}</p>
                  <p className="text-xs text-slate-500 font-medium">
                    {PLAN_LABELS[plan] ?? 'Sin plan'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
