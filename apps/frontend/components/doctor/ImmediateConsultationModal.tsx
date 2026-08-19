'use client';

/**
 * ImmediateConsultationModal — el paciente que llega SIN CITA.
 *
 * Flujo, tal como lo pidió la fundadora:
 *   1. Paciente: buscar o crear en el momento.
 *   2. Si tiene sesiones pendientes de un combo, se usa una de esas (ya están
 *      pagadas). Si no, elige el servicio.
 *   3. Solo se ofrecen los servicios del consultorio donde está AHORA, que se
 *      infiere del horario. Fuera de horario (o con varios abiertos) se le
 *      pregunta a cuál asociarla.
 *   4. La hora es la actual — la pone el SERVIDOR, no este componente.
 *
 * Regla del dueño para el choque con la agenda: si el próximo bloque está
 * libre, la consulta dura lo que dura el servicio y lo ocupa; si no, **se
 * acorta** hasta la próxima cita. Nunca se solapa y nunca se rechaza. El único
 * caso sin salida —que la próxima cita empiece en menos de 5 minutos— se avisa
 * y decide el especialista (`force`).
 */

import { useCallback, useEffect, useState } from 'react';
import { X, Zap, Loader2, AlertCircle, Search, UserPlus, Check } from 'lucide-react';
import {
  fetchDoctorOffices,
  normalizePatient,
  normalizeService,
  officesOpenAt,
  type DoctorOffice,
  type PatientLookup,
} from '@/components/appointment-flow/appointment-flow.utils';
import { showToast } from '@/components/ui/Toaster';

/**
 * ⚠️ `/api/doctor/services` devuelve DOS formas según el parámetro: sin
 * `officeId` responde snake_case (`price_usd`) y CON `officeId` responde
 * camelCase (`priceUsd`). Este modal usa la variante filtrada, así que se
 * normaliza con el helper compartido — leer solo snake_case dejaba el precio
 * en undefined y la consulta se creaba en 0 aunque el servicio costara 40.
 */
type Service = {
  id: string;
  name: string;
  price_usd: number;
  duration_minutes: number | null;
};

type PendingSession = {
  id: string;
  plan_name: string;
  session_number: number;
};

type Window = {
  nextAppointmentAt: string | null;
  availableMinutes: number | null;
  effectiveDuration: number;
  fits: boolean;
};

export interface ImmediateConsultationModalProps {
  onClose: () => void;
  /** Se llama con el id de la consulta creada para abrirla. */
  onCreated: (consultationId: string | null, appointmentId: string) => void;
}

const DEFAULT_DURATION = 30;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Caracas',
  });
}

export default function ImmediateConsultationModal({
  onClose,
  onCreated,
}: ImmediateConsultationModalProps) {
  // ── Paciente ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState<PatientLookup | null>(null);
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newPatient, setNewPatient] = useState({ full_name: '', cedula: '', phone: '' });

  // ── Consultorio y servicio ────────────────────────────────────────────
  const [offices, setOffices] = useState<DoctorOffice[]>([]);
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [needsOfficePick, setNeedsOfficePick] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSession[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [window_, setWindow] = useState<Window | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const selectedPending = pending.find((p) => p.id === pendingId) ?? null;
  // Una sesión de combo usa la duración del consultorio: su precio y plan ya
  // están decididos y el backend los toma de la fila pendiente.
  const duration = selectedPending
    ? DEFAULT_DURATION
    : (selectedService?.duration_minutes ?? DEFAULT_DURATION);

  // ── Consultorio activo según la hora ──────────────────────────────────
  useEffect(() => {
    void (async () => {
      const list = await fetchDoctorOffices();
      setOffices(list);
      const open = officesOpenAt(list, new Date());
      if (open.length === 1) {
        setOfficeId(open[0].id);
      } else {
        // Fuera de horario, o con varios abiertos a la vez: se le pregunta.
        setNeedsOfficePick(true);
        if (list.length === 1) setOfficeId(list[0].id);
      }
    })();
  }, []);

  // ── Búsqueda de pacientes (debounce) ──────────────────────────────────
  useEffect(() => {
    if (query.trim().length < 2) {
      // Diferido: limpiar en el cuerpo del efecto encadena renders.
      const clear = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(clear);
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/patients/search?q=${encodeURIComponent(query)}&limit=8`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        // normalizePatient traduce el wire: la API devuelve `fullName` y todo
        // este flujo lee `full_name`. Sin esto el nombre salía en blanco y solo
        // se veía la cédula.
        .then((json) => setResults(Array.isArray(json.data) ? json.data.map(normalizePatient) : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // ── Sesiones pendientes y servicios del consultorio ───────────────────
  useEffect(() => {
    if (!patient) return;
    fetch(`/api/doctor/pending-consultations?status=pending_scheduling`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        const all = Array.isArray(json.data) ? (json.data as PendingSession[]) : [];
        const mine = all.filter(
          (p) => (p as unknown as { patient_id?: string }).patient_id === patient.id,
        );
        setPending(mine);
        if (mine.length === 1) setPendingId(mine[0].id);
      })
      .catch(() => setPending([]));
  }, [patient]);

  useEffect(() => {
    const qs = officeId ? `?officeId=${encodeURIComponent(officeId)}` : '';
    fetch(`/api/doctor/services${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => setServices(Array.isArray(json.data) ? json.data.map(normalizeService) : []))
      .catch(() => setServices([]));
  }, [officeId]);

  // ── Ventana disponible ────────────────────────────────────────────────
  const loadWindow = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/doctor/appointments/immediate-window?duration_minutes=${duration}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { data?: Window };
      setWindow(json.data ?? null);
    } catch {
      /* no bloquea: el backend recalcula al guardar */
    }
  }, [duration]);

  useEffect(() => {
    if (!patient) return;
    // La ventana se pide en un tick aparte: el fetch resuelve después, pero el
    // arranque de la llamada no debe colgar del render del efecto.
    const t = setTimeout(() => void loadWindow(), 0);
    return () => clearTimeout(t);
  }, [patient, loadWindow]);

  async function createPatient() {
    if (!newPatient.full_name.trim() || !newPatient.cedula.trim()) {
      setError('El nombre y la cédula son obligatorios.');
      return;
    }
    setCreatingPatient(true);
    setError('');
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatient),
      });
      const json = (await res.json()) as { data?: Record<string, unknown>; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error || 'No se pudo crear el paciente.');
        return;
      }
      setPatient(normalizePatient(json.data));
      setShowCreate(false);
    } catch {
      setError('No se pudo crear el paciente.');
    } finally {
      setCreatingPatient(false);
    }
  }

  async function submit(force: boolean) {
    if (!patient) return;
    if (!pendingId && !selectedService) {
      setError('Elegí el tipo de consulta.');
      return;
    }
    // El consultorio es obligatorio en el backend. Sin este guard, confirmar sin
    // elegirlo devolvía un 400 de validación con el texto crudo de Zod.
    if (!officeId) {
      setError('Elegí el consultorio donde vas a atender.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/doctor/appointments/immediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          officeId,
          appointmentMode: 'presencial',
          planName: selectedService?.name,
          planPrice: selectedService?.price_usd,
          durationMinutes: duration,
          pendingConsultationId: pendingId,
          force: force || undefined,
        }),
      });
      const json = (await res.json()) as {
        data?: { appointmentId: string; consultationId?: string | null; effectiveDuration: number };
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        // 409 = no queda espacio antes de la próxima cita. Se avisa y decide él.
        setError(json.error || 'No se pudo registrar la consulta.');
        setSaving(false);
        return;
      }

      showToast({ type: 'success', message: 'Consulta registrada' });
      onCreated(json.data?.consultationId ?? null, json.data?.appointmentId ?? '');
    } catch {
      setError('No se pudo registrar la consulta.');
      setSaving(false);
    }
  }

  /**
   * Tres estados posibles, no dos.
   *
   * Antes la UI ramificaba solo por `fits`, y el aviso de "va a durar X min en
   * vez de Y" se pintaba con `fits && truncated` — condición IMPOSIBLE, porque
   * si la consulta entra completa entonces effectiveDuration === duration. Ese
   * texto era código muerto: con 20 minutos libres y un servicio de 30 la
   * pantalla decía "no queda espacio" y el botón mandaba force=true, creando la
   * consulta a duración COMPLETA encima de la cita siguiente — justo lo
   * contrario de lo pedido ("que la consulta se acorte hasta la próxima cita").
   *
   * El backend ya sabía acortarla (effectiveDuration = min(duración, libre),
   * con un mínimo de 5 min); solo hacía falta dejar de forzarlo.
   */
  const MIN_IMMEDIATE_MINUTES = 5;
  const available = window_?.availableMinutes ?? null;
  /** Entra completa. */
  const fits = window_?.fits ?? true;
  /** No entra completa, pero queda tiempo útil: el backend la crea acortada. */
  const canShorten = !!window_ && !fits && available != null && available >= MIN_IMMEDIATE_MINUTES;
  /** No entra ni acortada: la única salida es pisar la cita siguiente. */
  const noRoom = !!window_ && !fits && !canShorten;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Consulta inmediata</h2>
              <p className="text-xs text-slate-500">Se registra con la hora actual</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Paso 1 — Paciente */}
        {!patient ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Paciente
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                // type="search" + autocomplete apagado: Chrome veía este campo y
                // el de "Nombre y apellido" como un formulario de dirección y
                // repartía el autorrelleno entre los dos — el nombre caía en el
                // buscador y el apellido en el campo del paciente.
                type="search"
                name="deltaPatientQuery"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o cédula…"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
              />
              {searching && (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>

            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => setPatient(p)}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
              >
                <p className="text-sm font-semibold text-slate-800">{p.full_name}</p>
                <p className="text-xs text-slate-400">{p.cedula || p.phone || '—'}</p>
              </button>
            ))}

            {!showCreate ? (
              <button
                onClick={() => {
                  // Lo que ya escribió en el buscador es el nombre del paciente:
                  // se arrastra al formulario en vez de obligarlo a re-tipearlo
                  // (y evita que quede texto suelto arriba confundiendo la vista).
                  const typed = query.trim();
                  if (typed && !/^\d+$/.test(typed)) {
                    setNewPatient((prev) => ({ ...prev, full_name: prev.full_name || typed }));
                  } else if (/^\d+$/.test(typed)) {
                    setNewPatient((prev) => ({ ...prev, cedula: prev.cedula || typed }));
                  }
                  setQuery('');
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                <UserPlus className="w-3.5 h-3.5" /> Es un paciente nuevo
              </button>
            ) : (
              <div className="space-y-2 border border-slate-200 rounded-lg p-3">
                <input
                  autoFocus
                  name="deltaNewPatientName"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore
                  value={newPatient.full_name}
                  onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })}
                  placeholder="Nombre y apellido"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                />
                <div className="flex gap-2">
                  <input
                    name="deltaNewPatientCedula"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    value={newPatient.cedula}
                    onChange={(e) => setNewPatient({ ...newPatient, cedula: e.target.value })}
                    placeholder="Cédula"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                  />
                  <input
                    name="deltaNewPatientPhone"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    placeholder="Teléfono"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                  />
                </div>
                <button
                  onClick={() => void createPatient()}
                  disabled={creatingPatient}
                  className="w-full py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {creatingPatient && <Loader2 className="w-4 h-4 animate-spin" />}
                  Crear y continuar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">{patient.full_name}</p>
              <p className="text-xs text-slate-400">{patient.cedula || patient.phone || '—'}</p>
            </div>
            <button
              onClick={() => {
                setPatient(null);
                setPending([]);
                setPendingId(null);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Cambiar
            </button>
          </div>
        )}

        {patient && (
          <>
            {/* Consultorio: solo se pregunta si no se pudo inferir */}
            {needsOfficePick && offices.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  ¿A qué consultorio la asocio?
                </label>
                <p className="text-[11px] text-slate-400">
                  A esta hora no hay ninguno en horario de atención.
                </p>
                <select
                  value={officeId ?? ''}
                  onChange={(e) => setOfficeId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                >
                  <option value="">Elegí un consultorio…</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sesión pendiente de un combo — ya está pagada */}
            {pending.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Tiene sesiones pagadas sin agendar
                </label>
                {pending.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPendingId(p.id === pendingId ? null : p.id);
                      setServiceId(null);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                      pendingId === p.id
                        ? 'border-violet-400 bg-violet-50'
                        : 'border-slate-200 hover:border-violet-300'
                    }`}
                  >
                    <span className="text-sm text-slate-800">
                      {p.plan_name} · sesión {p.session_number}
                    </span>
                    {pendingId === p.id && <Check className="w-4 h-4 text-violet-600" />}
                  </button>
                ))}
              </div>
            )}

            {/* Servicio — solo los que entran en ese consultorio */}
            {!pendingId && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Tipo de consulta
                </label>
                <select
                  value={serviceId ?? ''}
                  onChange={(e) => setServiceId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                >
                  <option value="">Elegí el tipo de consulta…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.duration_minutes ?? DEFAULT_DURATION} min
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Qué va a pasar con la hora */}
            {noRoom && window_ && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {window_.nextAppointmentAt
                    ? `Tu próxima cita empieza a las ${hhmm(window_.nextAppointmentAt)} y no queda espacio para esta consulta.`
                    : 'No queda espacio para esta consulta.'}{' '}
                  Podés registrarla igual: se va a cruzar con esa cita.
                </span>
              </div>
            )}
            {canShorten && window_ && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                Va a durar <strong>{available} min</strong> en vez de {duration}
                {window_.nextAppointmentAt
                  ? `, porque a las ${hhmm(window_.nextAppointmentAt)} tenés otra cita.`
                  : '.'}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                // force SOLO cuando no hay lugar ni acortándola. Si se puede
                // acortar se envía sin force y el backend la recorta hasta la
                // próxima cita, en vez de pisarla a duración completa.
                onClick={() => void submit(noRoom)}
                disabled={saving || (!pendingId && !serviceId)}
                className="flex-1 py-2.5 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {noRoom ? 'Registrar igual' : 'Registrar y atender'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
