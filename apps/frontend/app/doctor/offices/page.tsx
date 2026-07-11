'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listOffices,
  createOffice,
  updateOffice,
  deleteOffice,
  toggleOffice,
  type OfficeModality,
} from './actions';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Clock,
  Save,
  X,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Video,
  Users,
  AlertCircle,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toaster';
import PhoneInput from '@/components/shared/PhoneInput';

type Office = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  is_active: boolean;
  schedule: DaySchedule[];
  slot_duration: number;
  buffer_minutes: number;
  modality: OfficeModality;
};

const MODALITY_LABELS: Record<OfficeModality, string> = {
  in_person: 'Presencial',
  online: 'Online',
  both: 'Presencial y Online',
};

const MODALITY_BADGE: Record<OfficeModality, string> = {
  in_person: 'bg-slate-100 text-slate-600 border-slate-200',
  online: 'bg-blue-50 text-blue-600 border-blue-200',
  both: 'bg-teal-50 text-teal-700 border-teal-200',
};

type DaySchedule = {
  day: number; // 0=Lun ... 6=Dom
  enabled: boolean;
  start: string; // HH:MM
  end: string; // HH:MM
};

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Un bloque de horario por día de la semana (lun-vie activo por defecto). */
const DEFAULT_SCHEDULE: DaySchedule[] = DAYS.map((_, i) => ({
  day: i,
  enabled: i < 5,
  start: '08:00',
  end: '17:00',
}));

const inp =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white';

// ---------------------------------------------------------------------------
// Helpers de tiempo
// ---------------------------------------------------------------------------

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Dada la hora de fin del último bloque de un día, sugiere el inicio del
 * siguiente (2 horas después, máx. 18:00).
 */
function suggestNextStart(lastEnd: string): string {
  const mins = Math.min(timeToMinutes(lastEnd) + 120, 18 * 60);
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function suggestNextEnd(nextStart: string): string {
  const mins = Math.min(timeToMinutes(nextStart) + 240, 22 * 60);
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// ---------------------------------------------------------------------------
// Validación de solapamiento intra-día
// ---------------------------------------------------------------------------

type OverlapError = {
  /** Índice en el array plano `schedule` del primer bloque en conflicto. */
  a: number;
  /** Índice en el array plano `schedule` del segundo bloque en conflicto. */
  b: number;
};

function findOverlaps(schedule: DaySchedule[]): OverlapError[] {
  const errors: OverlapError[] = [];
  const enabledByDay = new Map<number, { idx: number; start: number; end: number }[]>();

  schedule.forEach((block, idx) => {
    if (!block.enabled) return;
    const startMin = timeToMinutes(block.start);
    const endMin = timeToMinutes(block.end);
    if (startMin >= endMin) return; // inválido, no checkear solapamiento aquí
    const existing = enabledByDay.get(block.day) ?? [];
    for (const other of existing) {
      if (startMin < other.end && endMin > other.start) {
        errors.push({ a: other.idx, b: idx });
      }
    }
    existing.push({ idx, start: startMin, end: endMin });
    enabledByDay.set(block.day, existing);
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Helpers de resumen para la tarjeta
// ---------------------------------------------------------------------------

type DaySummary = { day: number; blocks: { start: string; end: string }[] };

function summarizeSchedule(schedule: DaySchedule[]): DaySummary[] {
  const map = new Map<number, { start: string; end: string }[]>();
  schedule
    .filter((d) => d.enabled)
    .forEach((d) => {
      const existing = map.get(d.day) ?? [];
      existing.push({ start: d.start, end: d.end });
      map.set(d.day, existing);
    });

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([day, blocks]) => ({ day, blocks }));
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function OfficesPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Office | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [modality, setModality] = useState<OfficeModality>('in_person');

  // ---------------------------------------------------------------------------
  // Validación reactiva de solapamientos
  // ---------------------------------------------------------------------------
  const overlaps = useMemo(() => findOverlaps(schedule), [schedule]);
  const overlappingIndexes = useMemo(
    () => new Set(overlaps.flatMap((e) => [e.a, e.b])),
    [overlaps],
  );
  const hasOverlaps = overlaps.length > 0;

  // ---------------------------------------------------------------------------
  // Validación de bloques inválidos (start >= end)
  // ---------------------------------------------------------------------------
  const invalidIndexes = useMemo(
    () =>
      new Set(
        schedule
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.enabled && timeToMinutes(b.start) >= timeToMinutes(b.end))
          .map(({ i }) => i),
      ),
    [schedule],
  );
  const hasInvalidBlocks = invalidIndexes.size > 0;

  const canSave = !hasOverlaps && !hasInvalidBlocks;

  const fetchOffices = useCallback(async () => {
    const data = await listOffices();
    setOffices(
      data.map((o) => ({
        ...o,
        schedule: o.schedule?.length ? o.schedule : DEFAULT_SCHEDULE,
        slot_duration: o.slot_duration || 30,
        buffer_minutes: o.buffer_minutes || 10,
        modality: o.modality ?? 'in_person',
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  // ---------------------------------------------------------------------------
  // Abrir / cerrar formulario
  // ---------------------------------------------------------------------------

  function openNew() {
    setEditing(null);
    setName('');
    setAddress('');
    setCity('');
    setPhone('');
    setSchedule(DEFAULT_SCHEDULE.map((d) => ({ ...d })));
    setSlotDuration(30);
    setBufferMinutes(10);
    setModality('in_person');
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(office: Office) {
    setEditing(office);
    setName(office.name);
    setAddress(office.address);
    setCity(office.city);
    setPhone(office.phone);
    setSchedule(office.schedule.map((d) => ({ ...d })));
    setSlotDuration(office.slot_duration);
    setBufferMinutes(office.buffer_minutes);
    setModality(office.modality);
    setSaveError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setSaveError(null);
  }

  // ---------------------------------------------------------------------------
  // Operaciones sobre bloques (inmutables)
  // ---------------------------------------------------------------------------

  /** Activa/desactiva un día completo. Activa = agrega un bloque inicial si no hay ninguno. */
  function toggleDay(dayNum: number) {
    const blocksForDay = schedule.filter((b) => b.day === dayNum);
    const isEnabled = blocksForDay.some((b) => b.enabled);

    if (isEnabled) {
      // Desactivar: marcar todos los bloques de ese día como disabled
      setSchedule((prev) => prev.map((b) => (b.day === dayNum ? { ...b, enabled: false } : b)));
    } else {
      // Activar: si hay bloques disabled, reactivarlos; si no hay ninguno, agregar uno
      if (blocksForDay.length > 0) {
        setSchedule((prev) => prev.map((b) => (b.day === dayNum ? { ...b, enabled: true } : b)));
      } else {
        setSchedule((prev) => [
          ...prev,
          { day: dayNum, enabled: true, start: '08:00', end: '17:00' },
        ]);
      }
    }
  }

  /** Actualiza un campo de un bloque puntual por su índice en el array plano. */
  function updateBlock(blockIndex: number, field: 'start' | 'end', value: string) {
    setSchedule((prev) => prev.map((b, i) => (i === blockIndex ? { ...b, [field]: value } : b)));
  }

  /** Elimina un bloque por su índice. Si era el único del día, deja el día sin bloques. */
  function removeBlock(blockIndex: number) {
    setSchedule((prev) => prev.filter((_, i) => i !== blockIndex));
  }

  /** Agrega un bloque nuevo al final de los bloques existentes de un día. */
  function addBlock(dayNum: number) {
    const blocksForDay = schedule.filter((b) => b.day === dayNum && b.enabled);
    let start = '08:00';
    let end = '12:00';

    if (blocksForDay.length > 0) {
      const lastEnd = blocksForDay[blocksForDay.length - 1]?.end ?? '12:00';
      start = suggestNextStart(lastEnd);
      end = suggestNextEnd(start);
    }

    setSchedule((prev) => [...prev, { day: dayNum, enabled: true, start, end }]);
  }

  // ---------------------------------------------------------------------------
  // Guardar
  // ---------------------------------------------------------------------------

  async function handleSave() {
    setSaveError(null);

    if (!name.trim() || !address.trim() || !city.trim()) {
      setSaveError('Nombre, dirección y ciudad son obligatorios.');
      return;
    }
    if (!canSave) {
      setSaveError('Corrige los bloques de horario antes de guardar.');
      return;
    }

    // Validate that there is at least one enabled block.
    const hasEnabledBlock = schedule.some((b) => b.enabled);
    if (!hasEnabledBlock) {
      setSaveError('Debes tener al menos un bloque de horario habilitado.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        phone: phone.trim(),
        schedule,
        slot_duration: slotDuration,
        buffer_minutes: bufferMinutes,
        modality,
      };

      let result;
      if (editing) {
        result = await updateOffice(editing.id, payload);
      } else {
        result = await createOffice(payload);
      }

      if (!result.ok) {
        // Show the backend error message (in Spanish) inside the modal.
        // The backend already returns translated messages for conflict errors.
        setSaveError(result.error ?? 'Ocurrió un error al guardar.');
        return;
      }

      closeForm();
      fetchOffices();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Eliminar / toggle
  // ---------------------------------------------------------------------------

  function handleDelete(id: string) {
    setConfirmDelete(id);
  }

  async function performDelete(id: string) {
    setDeleting(id);
    await deleteOffice(id);
    setDeleting(null);
    setConfirmDelete(null);
    fetchOffices();
  }

  async function toggleActive(office: Office) {
    await toggleOffice(office.id);
    fetchOffices();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
        title="Eliminar consultorio"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={!!deleting}
        onConfirm={() => confirmDelete && performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Consultorios</h2>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona tus sedes y horarios de atención</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo consultorio
        </button>
      </div>

      {/* Office list */}
      {offices.length === 0 && !showForm ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No tienes consultorios registrados</p>
          <p className="text-xs text-slate-400 mt-1">
            Agrega tu primer consultorio para vincular horarios
          </p>
          <button
            onClick={openNew}
            className="mt-4 text-sm font-semibold text-teal-600 hover:text-teal-700"
          >
            + Agregar consultorio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {offices.map((office) => {
            const summary = summarizeSchedule(office.schedule);
            return (
              <div
                key={office.id}
                className={`bg-white border rounded-xl p-5 transition-all ${office.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{office.name}</h3>
                      {office.is_active ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                          Activo
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">
                          Inactivo
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${MODALITY_BADGE[office.modality]}`}
                      >
                        {office.modality === 'in_person' && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 inline" />
                            {MODALITY_LABELS[office.modality]}
                          </span>
                        )}
                        {office.modality === 'online' && (
                          <span className="flex items-center gap-1">
                            <Video className="w-2.5 h-2.5 inline" />
                            {MODALITY_LABELS[office.modality]}
                          </span>
                        )}
                        {office.modality === 'both' && (
                          <span className="flex items-center gap-1">
                            <Users className="w-2.5 h-2.5 inline" />
                            {MODALITY_LABELS[office.modality]}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                      <MapPin className="w-3 h-3" />
                      {office.address}, {office.city}
                    </div>
                    {office.phone && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                        <Phone className="w-3 h-3" />
                        {office.phone}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(office)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title={office.is_active ? 'Desactivar' : 'Activar'}
                    >
                      {office.is_active ? (
                        <ToggleRight className="w-5 h-5 text-teal-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(office)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(office.id)}
                      disabled={deleting === office.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      {deleting === office.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Slot config summary */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 mb-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>
                      <strong>{office.slot_duration} min</strong> por consulta
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>
                      <strong>{office.buffer_minutes} min</strong> entre consultas
                    </span>
                  </div>
                </div>

                {/* Schedule summary — agrupado por día */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">Horarios</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.length === 0 && (
                      <span className="text-[10px] text-slate-400">Sin horarios configurados</span>
                    )}
                    {summary.map(({ day, blocks }) => (
                      <span
                        key={day}
                        className="text-[10px] font-medium bg-teal-50 text-teal-700 px-2 py-1 rounded-md border border-teal-100"
                      >
                        {DAYS_SHORT[day]} {blocks.map((b) => `${b.start}–${b.end}`).join(', ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal — backdrop click intentionally disabled; close via Cancelar or X button */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Editar consultorio' : 'Nuevo consultorio'}
              </h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* In-modal error banner (replaces toast for save errors) */}
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Nombre del consultorio <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Consultorio Principal"
                  className={inp}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Dirección <span className="text-red-400">*</span>
                </label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Francisco de Miranda, Torre..."
                  className={inp}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Ciudad <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Caracas"
                    className={inp}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Teléfono
                  </label>
                  <PhoneInput value={phone} onChange={setPhone} placeholder="4121234567" />
                </div>
              </div>

              {/* Slot config */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Duración de consulta (min)
                  </label>
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className={inp}
                  >
                    {[15, 20, 30, 40, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} minutos
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Tiempo entre consultas (min)
                  </label>
                  <select
                    value={bufferMinutes}
                    onChange={(e) => setBufferMinutes(Number(e.target.value))}
                    className={inp}
                  >
                    {[0, 5, 10, 15, 20, 30].map((m) => (
                      <option key={m} value={m}>
                        {m} minutos
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modality */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Modalidad de atención
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        value: 'in_person',
                        label: 'Presencial',
                        Icon: MapPin,
                        desc: 'Solo en consultorio',
                      },
                      { value: 'online', label: 'Online', Icon: Video, desc: 'Solo videollamada' },
                      { value: 'both', label: 'Ambas', Icon: Users, desc: 'Presencial y online' },
                    ] as const
                  ).map(({ value, label, Icon, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setModality(value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                        modality === value
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-slate-200 bg-white hover:border-teal-300'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${modality === value ? 'text-teal-600' : 'text-slate-400'}`}
                      />
                      <span
                        className={`text-xs font-semibold ${modality === value ? 'text-teal-700' : 'text-slate-600'}`}
                      >
                        {label}
                      </span>
                      <span className="text-[10px] text-slate-400 leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ----------------------------------------------------------------
                  Horarios por día — múltiples bloques
              ---------------------------------------------------------------- */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-3">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Horarios de atención
                </label>

                {/* Alerta global de solapamiento */}
                {hasOverlaps && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-3">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">
                      Hay bloques de horario que se solapan en el mismo día. Corrige los conflictos
                      para poder guardar.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {DAYS.map((dayName, dayNum) => {
                    const dayBlocks = schedule
                      .map((b, globalIdx) => ({ block: b, globalIdx }))
                      .filter(({ block }) => block.day === dayNum);

                    const isDayActive = dayBlocks.some((e) => e.block.enabled);

                    return (
                      <div
                        key={dayNum}
                        className={`rounded-xl border transition-all ${
                          isDayActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        {/* Cabecera del día */}
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleDay(dayNum)}
                            aria-label={`${isDayActive ? 'Desactivar' : 'Activar'} ${dayName}`}
                            aria-pressed={isDayActive}
                            className="shrink-0 p-0.5 rounded-md hover:bg-slate-100 transition-colors"
                          >
                            {isDayActive ? (
                              <ToggleRight className="w-5 h-5 text-teal-500" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-slate-300" />
                            )}
                          </button>
                          <span
                            className={`text-xs font-semibold w-16 ${isDayActive ? 'text-slate-700' : 'text-slate-400'}`}
                          >
                            {DAYS_SHORT[dayNum]}
                          </span>
                          {!isDayActive && (
                            <span className="text-xs text-slate-400 italic">No disponible</span>
                          )}
                        </div>

                        {/* Bloques del día (solo si activo) */}
                        {isDayActive && (
                          <div className="px-3 pb-3 space-y-2">
                            {dayBlocks.length === 0 && (
                              <p className="text-xs text-slate-400 italic py-1">
                                Sin bloques. Agrega uno abajo.
                              </p>
                            )}

                            {dayBlocks.map(({ block, globalIdx }) => {
                              if (!block.enabled) return null;

                              const isOverlap = overlappingIndexes.has(globalIdx);
                              const isInvalid = invalidIndexes.has(globalIdx);
                              const hasError = isOverlap || isInvalid;

                              return (
                                <div key={globalIdx} className="space-y-1">
                                  <div
                                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                                      hasError
                                        ? 'border-red-300 bg-red-50'
                                        : 'border-slate-100 bg-slate-50'
                                    }`}
                                  >
                                    {/* Input inicio */}
                                    <input
                                      type="time"
                                      value={block.start}
                                      onChange={(e) =>
                                        updateBlock(globalIdx, 'start', e.target.value)
                                      }
                                      aria-label={`Hora de inicio — ${dayName} bloque ${globalIdx + 1}`}
                                      className={`flex-1 min-w-0 text-base sm:text-sm px-3 py-1.5 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 ${
                                        hasError
                                          ? 'border-red-300 bg-white text-red-700 focus:border-red-400 focus:ring-red-100'
                                          : 'border-slate-200 bg-white text-slate-800 hover:border-teal-400 focus:border-teal-500 focus:ring-teal-200'
                                      }`}
                                    />
                                    <span className="text-xs text-slate-400 shrink-0">–</span>
                                    {/* Input fin */}
                                    <input
                                      type="time"
                                      value={block.end}
                                      onChange={(e) =>
                                        updateBlock(globalIdx, 'end', e.target.value)
                                      }
                                      aria-label={`Hora de fin — ${dayName} bloque ${globalIdx + 1}`}
                                      className={`flex-1 min-w-0 text-base sm:text-sm px-3 py-1.5 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 ${
                                        hasError
                                          ? 'border-red-300 bg-white text-red-700 focus:border-red-400 focus:ring-red-100'
                                          : 'border-slate-200 bg-white text-slate-800 hover:border-teal-400 focus:border-teal-500 focus:ring-teal-200'
                                      }`}
                                    />
                                    {/* Quitar bloque */}
                                    <button
                                      type="button"
                                      onClick={() => removeBlock(globalIdx)}
                                      aria-label={`Quitar bloque de ${dayName}`}
                                      className="shrink-0 p-1 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {isInvalid && !isOverlap && (
                                    <p className="text-[10px] text-red-500 pl-1">
                                      La hora de fin debe ser posterior a la de inicio.
                                    </p>
                                  )}
                                  {isOverlap && (
                                    <p className="text-[10px] text-red-500 pl-1">
                                      Este bloque se solapa con otro del mismo día.
                                    </p>
                                  )}
                                </div>
                              );
                            })}

                            {/* Botón agregar bloque */}
                            <button
                              type="button"
                              onClick={() => addBlock(dayNum)}
                              className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors mt-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Agregar bloque
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                disabled={saving || !canSave}
                title={!canSave ? 'Corrige los bloques de horario antes de guardar' : undefined}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editing ? 'Guardar cambios' : 'Crear consultorio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
