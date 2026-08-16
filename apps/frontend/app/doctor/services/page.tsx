'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
// MIGRATED (Etapa 1): services CRUD → NestJS /api/doctor/services
import {
  getDoctorServices,
  createDoctorService,
  updateDoctorService,
  deleteDoctorService,
  toggleDoctorService,
} from './actions';
import { useBcvRate } from '@/lib/useBcvRate';
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Save,
  X,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Tag,
  Building2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toaster';
import Link from 'next/link';
import type { DoctorService } from '@/app/doctor/services-shared';

type DoctorOffice = {
  id: string;
  name: string;
  modality: 'in_person' | 'online' | 'both';
  address?: string | null;
  /**
   * Duración del bloque de cita del consultorio, en minutos.
   *
   * ⚠️ El wire de GET /api/doctor/offices es **camelCase**: el controller
   * devuelve la entidad tal cual (`slotDuration`). Este archivo leía
   * `slot_duration` y por eso SIEMPRE caía al default de 30 — la regla de
   * compatibilidad servicio↔consultorio evaluaba 30 para todos, sin importar
   * cómo tuviera configurado el consultorio. Se aceptan las dos formas por si
   * algún consumidor viejo manda snake_case.
   */
  slotDuration?: number;
  slot_duration?: number;
  /**
   * Bloques del horario. Cada uno puede traer su propia `slotDuration`; los que
   * no, van con la del consultorio. Se usa para saber si el consultorio tiene
   * ALGÚN bloque capaz de sostener el servicio.
   */
  schedule?: Array<{ enabled?: boolean; slotDuration?: number | null }> | null;
};

/** Opciones de duración de un servicio, en minutos. */
const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90] as const;

/** Duración de bloque asumida cuando el consultorio no la informa. */
const DEFAULT_SLOT_DURATION = 30;

const inp =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white';

// ─── Fetches the list of offices from the BFF thin-proxy ─────────────────────
async function fetchOffices(): Promise<DoctorOffice[]> {
  try {
    const res = await fetch('/api/doctor/offices', { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    // BFF returns { success: true, data: [...] }
    return Array.isArray(json.data) ? (json.data as DoctorOffice[]) : [];
  } catch {
    return [];
  }
}

export default function ServicesPage() {
  const { rate: bcvRate, toBs, format, currencyCode } = useBcvRate();
  const [items, setItems] = useState<DoctorService[]>([]);
  const [offices, setOffices] = useState<DoctorOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DoctorService | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'plan' | 'service'>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  // AUDIT FIX 2026-04-28 (C-10): branded ConfirmDialog en lugar de confirm() nativo.
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; kind: 'service' } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [sessionsCount, setSessionsCount] = useState('1');
  const [validityDays, setValidityDays] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'plan' | 'service'>('plan');
  const [showInBooking, setShowInBooking] = useState(true);
  /** null = general (todos los consultorios); uuid = consultorio específico */
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    const data = await getDoctorServices();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Cargar servicios y consultorios en paralelo
    Promise.all([fetchServices(), fetchOffices().then(setOffices)]);
  }, [fetchServices]);

  function openNew(itemType: 'plan' | 'service' = 'plan') {
    setEditing(null);
    setName('');
    setPriceUsd('');
    setDurationMinutes('30');
    setSessionsCount('1');
    setValidityDays('');
    setDescription('');
    setType(itemType);
    setShowInBooking(true);
    setSelectedOfficeId(null);
    setShowForm(true);
  }

  function openEdit(item: DoctorService) {
    setEditing(item);
    setName(item.name);
    setPriceUsd(item.price_usd.toString());
    setDurationMinutes(item.duration_minutes.toString());
    setSessionsCount(item.sessions_count.toString());
    setValidityDays(item.validity_days != null ? item.validity_days.toString() : '');
    setDescription(item.description);
    setType(item.type);
    setShowInBooking(item.show_in_booking);
    setSelectedOfficeId(item.office_id ?? null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  // ---------------------------------------------------------------------------
  // Compatibilidad servicio ↔ consultorio
  //
  // La cita se agenda sobre un bloque del horario, así que un servicio de 45 min
  // no entra en un bloque que atiende de 30 en 30: pisaría la cita siguiente.
  //
  // Cada bloque puede tener su propia duración, así que alcanza con que UNO la
  // sostenga: un consultorio con la mañana de 45' y la tarde de 20' sí admite un
  // servicio de 45'. Los bloques sin duración propia usan la del consultorio.
  //
  // Un servicio "General" aparece en todos los consultorios, así que tiene que
  // entrar en todos.
  // ---------------------------------------------------------------------------

  const durationMins = parseInt(durationMinutes) || DEFAULT_SLOT_DURATION;

  /** Duración del bloque de un consultorio, con default explícito. */
  const slotOf = (o: DoctorOffice) => o.slotDuration ?? o.slot_duration ?? DEFAULT_SLOT_DURATION;

  /** Duración más larga que el consultorio puede sostener en alguno de sus bloques. */
  const maxSlotOf = (o: DoctorOffice) => {
    const bloques = (o.schedule ?? []).filter((b) => b?.enabled !== false);
    if (bloques.length === 0) return slotOf(o);
    return Math.max(...bloques.map((b) => b.slotDuration ?? slotOf(o)));
  };

  const officeFits = (o: DoctorOffice) => maxSlotOf(o) >= durationMins;

  /** Consultorios donde el servicio, con la duración elegida, NO entra. */
  const incompatibleOffices = useMemo(
    () => offices.filter((o) => !officeFits(o)),
    // `durationMins` entra vía officeFits; se declara para que el memo se recalcule.
    [offices, durationMins],
  );

  /** "General" solo es válido si el servicio entra en TODOS los consultorios. */
  const generalIsValid = incompatibleOffices.length === 0;

  const selectedOffice = offices.find((o) => o.id === selectedOfficeId) ?? null;
  const selectedOfficeFits = selectedOffice ? officeFits(selectedOffice) : generalIsValid;

  async function handleSave() {
    if (!name.trim() || !priceUsd) {
      showToast({ type: 'error', message: 'Nombre y precio son obligatorios' });
      return;
    }

    // Guarda de último momento: la UI ya deshabilita las opciones que no
    // entran, pero la duración se puede cambiar DESPUÉS de elegir consultorio.
    if (!selectedOfficeFits) {
      showToast({
        type: 'error',
        message: selectedOffice
          ? `"${selectedOffice.name}" atiende en bloques de ${slotOf(selectedOffice)} min y este servicio dura ${durationMins}. Elige otro consultorio o reduce la duración.`
          : `Para dejarlo en "General" el servicio debe entrar en todos los consultorios, y ${incompatibleOffices.length === 1 ? 'uno atiende' : `${incompatibleOffices.length} atienden`} en bloques más cortos que ${durationMins} min.`,
      });
      return;
    }

    setSaving(true);
    const parsedSessions = parseInt(sessionsCount) || 1;
    const parsedValidity = validityDays.trim() !== '' ? parseInt(validityDays) : null;
    const payload = {
      name: name.trim(),
      price_usd: parseFloat(priceUsd) || 0,
      duration_minutes: parseInt(durationMinutes) || 30,
      sessions_count: parsedSessions,
      // validity_days only applies to multi-session plans; clear if sessions == 1
      validity_days: parsedSessions > 1 ? (parsedValidity ?? null) : null,
      description: description.trim() || null,
      type,
      show_in_booking: showInBooking,
      office_id: selectedOfficeId ?? null,
    };

    let result;
    if (editing) {
      result = await updateDoctorService(editing.id, payload);
    } else {
      result = await createDoctorService(payload);
    }

    if (!result.success) {
      showToast({ type: 'error', message: result.error ?? 'Error al guardar el servicio' });
    } else {
      showToast({ type: 'success', message: editing ? 'Servicio actualizado' : 'Servicio creado' });
    }

    setSaving(false);
    closeForm();
    fetchServices();
  }

  function handleDelete(id: string) {
    setConfirmDelete({ id, kind: 'service' });
  }

  async function performDeleteService(id: string) {
    try {
      await deleteDoctorService(id);
      showToast({ type: 'success', message: 'Servicio eliminado' });
    } catch {
      showToast({ type: 'error', message: 'Error al eliminar el servicio' });
    }
    setConfirmDelete(null);
    fetchServices();
  }

  async function toggleBooking(item: DoctorService) {
    await toggleDoctorService(item.id, 'show_in_booking', !item.show_in_booking);
    showToast({
      type: 'success',
      message: item.show_in_booking
        ? 'Servicio ocultado del booking'
        : 'Servicio habilitado en el booking',
    });
    fetchServices();
  }

  async function toggleActive(item: DoctorService) {
    await toggleDoctorService(item.id, 'is_active', !item.is_active);
    showToast({
      type: 'success',
      message: item.is_active ? 'Servicio desactivado' : 'Servicio activado',
    });
    fetchServices();
  }

  // Helper: resolve office name for a given office_id
  function officeName(officeId: string | null): string {
    if (!officeId) return 'General';
    return offices.find((o) => o.id === officeId)?.name ?? 'General';
  }

  const noOffices = !loading && offices.length === 0;

  const filtered = items.filter((i) => {
    const matchType = filter === 'all' || i.type === filter;
    const matchOffice =
      officeFilter === 'all' ||
      (officeFilter === 'general' ? !i.office_id : i.office_id === officeFilter);
    return matchType && matchOffice;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar servicio"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => {
          if (!confirmDelete) return;
          performDeleteService(confirmDelete.id);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="font-semibold tracking-tight"
            style={{
              fontFamily: 'var(--dh-font-display)',
              fontSize: 'clamp(22px, 3.2vw, 32px)',
              color: 'var(--dh-ink)',
            }}
          >
            Servicios y Planes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-600)' }}>
            Configura lo que ofreces en tu consulta y link de booking
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => openNew('plan')}
            disabled={noOffices}
            title={
              noOffices ? 'Primero debés agregar un consultorio para poder crear planes' : undefined
            }
            className={`flex items-center gap-2 text-[13px] font-bold px-5 py-2.5 rounded-full transition-all ${
              noOffices
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'text-white hover:-translate-y-px'
            }`}
            style={noOffices ? undefined : { background: 'var(--dh-turquoise)' }}
            onMouseEnter={(e) => {
              if (!noOffices) e.currentTarget.style.background = 'var(--dh-turquoise-700)';
            }}
            onMouseLeave={(e) => {
              if (!noOffices) e.currentTarget.style.background = 'var(--dh-turquoise)';
            }}
          >
            <Plus className="w-4 h-4" /> Plan de consulta
          </button>
          <button
            onClick={() => openNew('service')}
            disabled={noOffices}
            title={
              noOffices
                ? 'Primero debés agregar un consultorio para poder crear servicios'
                : undefined
            }
            className={`flex items-center gap-2 text-[13px] font-bold px-5 py-2.5 rounded-full transition-all ${
              noOffices
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : ''
            }`}
            style={
              noOffices
                ? undefined
                : {
                    border: '1.5px solid var(--dh-turquoise-100)',
                    color: 'var(--dh-turquoise-700)',
                    background: 'white',
                  }
            }
            onMouseEnter={(e) => {
              if (!noOffices) e.currentTarget.style.background = 'var(--dh-turquoise-50)';
            }}
            onMouseLeave={(e) => {
              if (!noOffices) e.currentTarget.style.background = 'white';
            }}
          >
            <Plus className="w-4 h-4" /> Servicio extra
          </button>
        </div>
      </div>

      {/* Aviso: sin consultorios no se pueden crear planes */}
      {noOffices && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Necesitás crear al menos un consultorio antes de agregar planes
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Los planes se asocian a un consultorio. Una vez que agregues uno, podrás crear tus
              planes y servicios.
            </p>
          </div>
          <Link
            href="/doctor/offices"
            className="shrink-0 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-lg transition-colors"
          >
            Agregar consultorio
          </Link>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
        {/* Type filter */}
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5 w-fit">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'plan', label: 'Planes' },
            { key: 'service', label: 'Servicios' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as 'all' | 'plan' | 'service')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Office filter — solo si hay consultorios */}
        {offices.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={officeFilter}
              onChange={(e) => setOfficeFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white text-slate-700"
              aria-label="Filtrar por consultorio"
            >
              <option value="all">Todos los consultorios</option>
              <option value="general">General</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No tienes servicios configurados</p>
          <p className="text-xs text-slate-400 mt-1">
            Agrega planes de consulta o servicios extras
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const officeLabel = officeName(item.office_id);
            const isGeneral = !item.office_id;
            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl p-5 transition-all ${item.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Tipo badge */}
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          item.type === 'plan'
                            ? 'bg-teal-50 text-teal-600 border border-teal-200'
                            : 'bg-purple-50 text-purple-600 border border-purple-200'
                        }`}
                      >
                        {item.type === 'plan' ? 'Plan' : 'Servicio'}
                      </span>
                      {/* Consultorio badge */}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isGeneral
                            ? 'bg-slate-100 text-slate-500 border border-slate-200'
                            : 'bg-blue-50 text-blue-600 border border-blue-200'
                        }`}
                        title={
                          isGeneral
                            ? 'Disponible en todos los consultorios'
                            : `Asignado a: ${officeLabel}`
                        }
                      >
                        <Building2 className="w-2.5 h-2.5" />
                        {officeLabel}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-2">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-teal-600">
                      {format(item.price_usd)}
                    </span>
                    <span className="text-xs text-slate-400">{currencyCode}</span>
                    {item.sessions_count > 1 && (
                      <span className="text-xs text-slate-500 ml-1">
                        × {item.sessions_count} ={' '}
                        <span className="font-semibold text-slate-700">
                          {format(item.price_usd * item.sessions_count)}
                        </span>
                      </span>
                    )}
                  </div>
                  {bcvRate && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.sessions_count > 1
                        ? `Total: ${toBs(item.price_usd * item.sessions_count)}`
                        : toBs(item.price_usd)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                  {item.sessions_count > 1 && (
                    <div className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {item.sessions_count} sesiones — $
                      {(item.price_usd * item.sessions_count).toFixed(2)} total
                    </div>
                  )}
                  {item.sessions_count > 1 && item.validity_days != null && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <span>Validez: {item.validity_days}d</span>
                    </div>
                  )}
                </div>

                {/* Booking toggle */}
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100 mb-3">
                  <div className="flex items-center gap-2">
                    {item.show_in_booking ? (
                      <Eye className="w-3.5 h-3.5 text-teal-500" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span className="text-xs font-medium text-slate-600">Visible en booking</span>
                  </div>
                  <button
                    onClick={() => toggleBooking(item)}
                    aria-label="Alternar visibilidad en booking"
                  >
                    {item.show_in_booking ? (
                      <ToggleRight className="w-5 h-5 text-teal-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-300" />
                    )}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => toggleActive(item)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      item.is_active
                        ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-slate-400 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {item.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Editar servicio"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label="Eliminar servicio"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal — backdrop click intentionally disabled; close via Cancelar or X button */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Editar' : 'Nuevo'} {type === 'plan' ? 'plan de consulta' : 'servicio'}
              </h3>
              <button
                onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'plan', label: 'Plan de consulta', desc: 'Consulta' },
                    { value: 'service', label: 'Servicio extra', desc: 'Limpieza, examen, etc.' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value as 'plan' | 'service')}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        type === opt.value
                          ? 'border-teal-400 bg-teal-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p
                        className={`text-xs font-bold ${type === opt.value ? 'text-teal-700' : 'text-slate-700'}`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Office selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Consultorio
                  </span>
                </label>
                {offices.length === 0 ? (
                  <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    No tienes consultorios configurados —{' '}
                    <a href="/doctor/offices" className="text-teal-600 font-semibold underline">
                      Agregar consultorio
                    </a>
                  </div>
                ) : (
                  <select
                    value={selectedOfficeId ?? ''}
                    onChange={(e) => setSelectedOfficeId(e.target.value || null)}
                    className={inp}
                    aria-label="Seleccionar consultorio"
                  >
                    <option value="" disabled={!generalIsValid}>
                      General (todos los consultorios)
                      {!generalIsValid && ' — no entra en todos'}
                    </option>
                    {offices.map((o) => {
                      const fits = officeFits(o);
                      return (
                        <option key={o.id} value={o.id} disabled={!fits}>
                          {o.name}
                          {!fits && ` — bloques de ${slotOf(o)} min`}
                        </option>
                      );
                    })}
                  </select>
                )}
                {selectedOfficeFits ? (
                  <p className="text-[10px] text-slate-400 mt-1">
                    &quot;General&quot; aparece en todos los consultorios. Elige uno para
                    restringirlo a ese espacio.
                  </p>
                ) : (
                  <p className="text-[10px] text-red-500 mt-1">
                    {selectedOffice
                      ? `Este servicio dura ${durationMins} min y "${selectedOffice.name}" atiende en bloques de ${slotOf(selectedOffice)} min.`
                      : `Para dejarlo en "General" tiene que entrar en todos los consultorios: ${incompatibleOffices
                          .map((o) => `${o.name} (${slotOf(o)} min)`)
                          .join(', ')}.`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Nombre <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={type === 'plan' ? 'Consulta general' : 'Limpieza dental'}
                  className={inp}
                />
              </div>

              {/* Duración. Se había quitado el 12-07 porque la cita se agenda con el
                  bloque del consultorio; vuelve porque el especialista necesita
                  registrar cuánto dura realmente cada servicio. No cambia cómo se
                  generan los turnos: condiciona a qué consultorio se puede asociar
                  (ver `officeFits`). */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Duración
                  </span>
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className={inp}
                  aria-label="Duración del servicio"
                >
                  {DURATION_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v} min
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Solo puede asociarse a consultorios cuyos bloques sean de al menos esta duración.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Precio {currencyCode} unitario <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(e.target.value)}
                    placeholder="30.00"
                    className={inp + ' pl-9'}
                  />
                </div>
              </div>

              {type === 'plan' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Sesiones incluidas
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={sessionsCount}
                    onChange={(e) => setSessionsCount(e.target.value)}
                    placeholder="1"
                    className={inp}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Si es un paquete, pon el número de sesiones que incluye
                  </p>
                  {(() => {
                    const p = parseFloat(priceUsd) || 0;
                    const s = parseInt(sessionsCount) || 1;
                    if (s > 1 && p > 0) {
                      const total = p * s;
                      return (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-100">
                          <p className="text-xs font-semibold text-teal-700">
                            Total del paquete: {format(total)}{' '}
                            <span className="font-normal text-teal-600">
                              (= {format(p)} {currencyCode} × {s} sesiones)
                            </span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Validez — solo visible cuando sessions > 1 */}
                  {(parseInt(sessionsCount) || 1) > 1 && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Validez (días)
                        <span className="ml-1 text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={validityDays}
                        onChange={(e) => setValidityDays(e.target.value)}
                        placeholder="Ej. 90"
                        className={inp}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Días que tiene el paciente para agendar todas las consultas del paquete.
                        Deja vacío si no tiene fecha de vencimiento.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe brevemente el servicio..."
                  rows={2}
                  className={inp + ' resize-none'}
                />
              </div>

              {/* Booking visibility */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Mostrar en link de booking</p>
                  <p className="text-[10px] text-slate-400">
                    Los pacientes podrán seleccionarlo al agendar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInBooking(!showInBooking)}
                  aria-label="Alternar visibilidad en booking"
                >
                  {showInBooking ? (
                    <ToggleRight className="w-6 h-6 text-teal-500" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-300" />
                  )}
                </button>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 rounded-b-2xl">
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!editing && noOffices)}
                title={
                  !editing && noOffices
                    ? 'Necesitás un consultorio para crear este plan'
                    : undefined
                }
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editing ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
