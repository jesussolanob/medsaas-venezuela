'use client';

/**
 * Especialistas del vendedor: la cartera y el alta manual.
 *
 * Antes esto convivía con el código, el resumen y las métricas en una sola
 * página. Separarlo permite que la tabla tenga aire —buscador propio, y espacio
 * para filtros o exportación si hacen falta— sin empujar hacia abajo lo que el
 * vendedor mira todos los días.
 *
 * El vendedor NO elige plan al dar de alta: el backend fija el de prueba. Por
 * eso el formulario no tiene selector de plan — no es que esté escondido.
 */

import { useMemo, useState } from 'react';
import { Users, Loader2, UserPlus, AlertCircle, X, Share2, Search } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import {
  useSellerData,
  estadoSeguimiento,
  normalizar,
  fmtDate,
  PLAN_LABELS,
  type SpecialistDetail,
} from '../seller-data';

export default function SellerEspecialistasPage() {
  const { rows, loading, recargar } = useSellerData();

  const [busqueda, setBusqueda] = useState('');
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

  // Ficha: se pide al abrirla y no se toma de la lista, para pasar por el
  // endpoint con guarda anti-IDOR y traer el dato fresco.
  const [ficha, setFicha] = useState<SpecialistDetail | null>(null);
  const [fichaCargando, setFichaCargando] = useState(false);
  const [fichaError, setFichaError] = useState('');

  // Edición del teléfono y las notas. Un especialista ASIGNADO por el admin
  // llega sin teléfono y antes la ficha era de solo lectura: no había forma de
  // cargarlo desde el portal.
  const [editando, setEditando] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [guardandoFicha, setGuardandoFicha] = useState(false);
  const [fichaGuardarError, setFichaGuardarError] = useState('');

  function empezarEdicion() {
    setEditPhone(ficha?.phone ?? '');
    setEditNotes(ficha?.sellerNotes ?? '');
    setFichaGuardarError('');
    setEditando(true);
  }

  function cancelarEdicion() {
    setEditando(false);
    setFichaGuardarError('');
  }

  async function guardarFicha() {
    if (!ficha) return;
    setGuardandoFicha(true);
    setFichaGuardarError('');
    try {
      const res = await fetch(`/api/seller/specialists/${ficha.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: editPhone, seller_notes: editNotes }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: SpecialistDetail;
        error?: string;
      };
      if (!res.ok || !j.success || !j.data) {
        setFichaGuardarError(j.error ?? 'No se pudieron guardar los cambios.');
        return;
      }
      // Se toma la ficha que devuelve el servidor, no el estado local: así lo
      // que se ve es lo que quedó guardado (el backend recorta y normaliza).
      setFicha(j.data);
      setEditando(false);
      showToast({ type: 'success', message: 'Ficha actualizada' });
      await recargar();
    } catch {
      setFichaGuardarError('No se pudieron guardar los cambios.');
    } finally {
      setGuardandoFicha(false);
    }
  }

  /**
   * Filtro del lado del cliente: la lista llega completa en un solo fetch.
   *
   * Se busca por nombre, especialidad y plan. NO por correo ni cédula: esos
   * campos no vienen en la lista —solo en la ficha— y filtrar por algo que la
   * fila no muestra da resultados que el vendedor no puede explicar.
   */
  const filtradas = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return rows;
    return rows.filter((r) => {
      const plan = PLAN_LABELS[r.plan ?? ''] ?? r.plan ?? '';
      return normalizar(`${r.fullName} ${r.specialty ?? ''} ${plan}`).includes(q);
    });
  }, [rows, busqueda]);

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
      await recargar();
    } catch {
      setError('No se pudo registrar el especialista.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Los que registraste vos o que se registraron con tu código.
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 g-bg text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <UserPlus className="w-4 h-4" />
          Registrar especialista
        </button>
      </div>

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
          <>
            {/*
              El buscador se sigue mostrando cuando el filtro no encuentra nada:
              si desapareciera junto con las filas, el vendedor se quedaría sin
              forma de borrar lo que escribió.
            */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, especialidad o plan…"
                  aria-label="Buscar especialista"
                  className="w-full text-sm border border-slate-200 rounded-lg py-2 pl-9 pr-9 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-white text-slate-700 placeholder:text-slate-400"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {busqueda && (
                <p className="text-xs text-slate-400 shrink-0 tabular-nums">
                  {filtradas.length} de {rows.length}
                </p>
              )}
            </div>

            {filtradas.length === 0 ? (
              <div className="p-8 text-center">
                <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">
                  Ningún especialista coincide con &ldquo;{busqueda}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="mt-3 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline"
                >
                  Ver todos
                </button>
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
                    {filtradas.map((r, i) => {
                      const act = estadoSeguimiento(r);
                      return (
                        <tr
                          key={r.id}
                          onClick={() => void abrirFicha(r.id)}
                          className={`cursor-pointer hover:bg-slate-50/70 transition-colors ${
                            i < filtradas.length - 1 ? 'border-b border-slate-100' : ''
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
          </>
        )}
      </section>

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
                      {editando ? (
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="04141234567"
                          className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-teal-400"
                        />
                      ) : ficha.phone ? (
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

                  {/* Notas del vendedor: seguimiento comercial, no dato clínico. */}
                  <div className="pt-2 border-t border-slate-100">
                    <dt className="text-[11px] font-semibold text-slate-400 uppercase">
                      Mis notas
                    </dt>
                    <dd className="text-slate-800 mt-1">
                      {editando ? (
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={4}
                          maxLength={2000}
                          placeholder="Cómo viene la conversación, cuándo volver a llamarlo…"
                          className="w-full text-sm border-2 border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 resize-y"
                        />
                      ) : ficha.sellerNotes ? (
                        <p className="whitespace-pre-wrap text-sm">{ficha.sellerNotes}</p>
                      ) : (
                        <span className="text-slate-400 text-sm">Sin notas</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {fichaGuardarError && (
                  <p className="mt-3 text-xs text-red-600">{fichaGuardarError}</p>
                )}

                {/* Editar / guardar */}
                <div className="mt-4 flex gap-2">
                  {editando ? (
                    <>
                      <button
                        type="button"
                        disabled={guardandoFicha}
                        onClick={() => void guardarFicha()}
                        className="flex-1 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 text-sm font-semibold transition-colors"
                      >
                        {guardandoFicha ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        disabled={guardandoFicha}
                        onClick={cancelarEdicion}
                        className="rounded-lg border-2 border-slate-200 hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={empezarEdicion}
                      className="w-full rounded-lg border-2 border-teal-500 text-teal-700 hover:bg-teal-50 py-2 text-sm font-semibold transition-colors"
                    >
                      Editar teléfono y notas
                    </button>
                  )}
                </div>

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
    </div>
  );
}
