'use client';

/**
 * OnboardingStepOffice — Paso 2 del wizard de onboarding.
 *
 * Permite crear el primer consultorio del especialista.
 * Campos obligatorios: nombre, dirección, ciudad, ≥1 día habilitado.
 * Campos opcionales: teléfono, URL del mapa.
 * Horario: VARIOS bloques por día (Lun–Dom), igual que en /doctor/offices —
 * un especialista que atiende mañana y tarde necesita partir el día, y hasta
 * ahora este paso solo admitía un bloque, así que el horario que armaba acá no
 * era el mismo que podía armar después desde Consultorios.
 * Slot y buffer: selectores simples.
 */

import { useState, useTransition, useMemo } from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Clock,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
} from 'lucide-react';
import {
  DAYS,
  DAYS_SHORT,
  DEFAULT_SCHEDULE,
  timeToMinutes,
  findOverlaps,
  addBlock,
  removeBlock,
  updateBlock,
  toggleDay,
  type DaySchedule,
  type OverlapError,
} from '@/lib/schedule-utils';
import { createOfficeForOnboarding } from './actions';
import { updateOffice } from '@/app/doctor/offices/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OfficeModality = 'in_person' | 'online' | 'both';

interface Props {
  onBack: () => void;
  /**
   * Se llama con el id del consultorio y la duración de sus bloques. El paso
   * siguiente necesita el slot para no dejar crear una consulta más larga que
   * el bloque del consultorio recién creado.
   */
  onSuccess: (officeId: string, slotDuration: number) => void;
  /** If the user already created an office in a previous attempt, pass the id
   *  so we UPDATE instead of creating a duplicate. */
  existingOfficeId?: string | null;
}

interface FieldErrors {
  name?: string;
  address?: string;
  city?: string;
  schedule?: string;
}

const MODALITY_OPTIONS: { value: OfficeModality; label: string }[] = [
  { value: 'in_person', label: 'Presencial' },
  { value: 'online', label: 'Online' },
  { value: 'both', label: 'Presencial y Online' },
];

const inp =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-slate-200 bg-white focus:border-teal-400 text-slate-800';
const inpErr =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-red-300 bg-red-50 focus:border-red-400 text-slate-800';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingStepOffice({ onBack, onSuccess, existingOfficeId }: Props) {
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [modality, setModality] = useState<OfficeModality>('in_person');
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(10);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const overlaps = useMemo<OverlapError[]>(() => findOverlaps(schedule), [schedule]);
  const overlappingIndexes = useMemo(
    () => new Set(overlaps.flatMap((e) => [e.a, e.b])),
    [overlaps],
  );
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

  const hasScheduleError = overlaps.length > 0 || invalidIndexes.size > 0;
  const hasEnabledDay = schedule.some((d) => d.enabled);

  // Operaciones sobre bloques — funciones puras compartidas con /doctor/offices,
  // para que las dos pantallas no vuelvan a divergir.
  const handleToggleDay = (dayNum: number) => setSchedule((prev) => toggleDay(prev, dayNum));
  const handleAddBlock = (dayNum: number) => setSchedule((prev) => addBlock(prev, dayNum));
  const handleRemoveBlock = (idx: number) => setSchedule((prev) => removeBlock(prev, idx));
  const handleUpdateBlock = (idx: number, field: 'start' | 'end', value: string) =>
    setSchedule((prev) => updateBlock(prev, idx, field, value));

  /** Bloques de un día con su índice en el array plano (el que usan las validaciones). */
  function blocksOfDay(dayNum: number): { block: DaySchedule; globalIdx: number }[] {
    return schedule
      .map((block, globalIdx) => ({ block, globalIdx }))
      .filter(({ block }) => block.day === dayNum);
  }

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = 'El nombre del consultorio es obligatorio';
    if (!address.trim()) errors.address = 'La dirección es obligatoria';
    if (!city.trim()) errors.city = 'La ciudad es obligatoria';
    if (!hasEnabledDay) errors.schedule = 'Habilita al menos un día de atención';
    else if (hasScheduleError) {
      errors.schedule =
        overlaps.length > 0
          ? 'Hay horarios solapados en el mismo día'
          : 'La hora de fin debe ser posterior a la de inicio';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setServerError(null);

    const officeInput = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim(),
      map_url: mapUrl.trim() || undefined,
      schedule,
      slot_duration: slotDuration,
      buffer_minutes: bufferMinutes,
      modality,
    };

    startTransition(async () => {
      if (existingOfficeId) {
        // Office was already created in a previous attempt — update it.
        const result = await updateOffice(existingOfficeId, officeInput);
        if (!result.ok) {
          setServerError(result.error ?? 'Error al actualizar el consultorio. Intenta nuevamente.');
          return;
        }
        onSuccess(existingOfficeId, slotDuration);
      } else {
        // First attempt — create a new office.
        const result = await createOfficeForOnboarding(officeInput);
        if (!result.ok || !result.id) {
          setServerError(result.error ?? 'Error al crear el consultorio. Intenta nuevamente.');
          return;
        }
        onSuccess(result.id, slotDuration);
      }
    });
  }

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      data-testid="onboarding-step-office"
    >
      {/* Header */}
      <div
        className="px-6 sm:px-8 pt-6 pb-4"
        style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'var(--dh-turquoise-50)' }}
          >
            <Building2 className="w-5 h-5" style={{ color: 'var(--dh-turquoise)' }} />
          </div>
          <div>
            <h2
              className="font-bold text-lg leading-tight"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Tu primer consultorio
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
              Los pacientes verán esta información al agendar una cita
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="px-6 sm:px-8 py-6 space-y-5">
        {serverError && (
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-50 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <p className="text-sm text-red-600">{serverError}</p>
          </div>
        )}

        {/* Nombre */}
        <div>
          <label
            htmlFor="oo-name"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Nombre del consultorio <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Building2
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--dh-gray-400)' }}
            />
            <input
              id="oo-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder="Ej. Consultorio Principal"
              className={`${fieldErrors.name ? inpErr : inp} pl-10`}
              aria-invalid={!!fieldErrors.name}
            />
          </div>
          {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
        </div>

        {/* Dirección */}
        <div>
          <label
            htmlFor="oo-address"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Dirección <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <MapPin
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--dh-gray-400)' }}
            />
            <input
              id="oo-address"
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (fieldErrors.address) setFieldErrors((p) => ({ ...p, address: undefined }));
              }}
              placeholder="Ej. Av. Francisco de Miranda, Chacao"
              className={`${fieldErrors.address ? inpErr : inp} pl-10`}
              aria-invalid={!!fieldErrors.address}
            />
          </div>
          {fieldErrors.address && (
            <p className="text-xs text-red-500 mt-1">{fieldErrors.address}</p>
          )}
        </div>

        {/* Ciudad + Teléfono */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="oo-city"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--dh-gray-700)' }}
            >
              Ciudad <span className="text-red-400">*</span>
            </label>
            <input
              id="oo-city"
              type="text"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (fieldErrors.city) setFieldErrors((p) => ({ ...p, city: undefined }));
              }}
              placeholder="Ej. Caracas"
              className={fieldErrors.city ? inpErr : inp}
              aria-invalid={!!fieldErrors.city}
            />
            {fieldErrors.city && <p className="text-xs text-red-500 mt-1">{fieldErrors.city}</p>}
          </div>
          <div>
            <label
              htmlFor="oo-phone"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--dh-gray-700)' }}
            >
              Teléfono{' '}
              <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
                (opcional)
              </span>
            </label>
            <div className="relative">
              <Phone
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--dh-gray-400)' }}
              />
              <input
                id="oo-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0212-1234567"
                className={`${inp} pl-10`}
              />
            </div>
          </div>
        </div>

        {/* URL del mapa */}
        <div>
          <label
            htmlFor="oo-map"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            URL del mapa{' '}
            <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              (opcional)
            </span>
          </label>
          <div className="relative">
            <MapPin
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--dh-gray-400)' }}
            />
            <input
              id="oo-map"
              type="url"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              className={`${inp} pl-10`}
            />
          </div>
        </div>

        {/* Modalidad */}
        <div>
          <span
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Modalidad de atención
          </span>
          <div className="flex gap-2 flex-wrap">
            {MODALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setModality(opt.value)}
                className={`px-3 py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                  modality === opt.value
                    ? 'border-teal-400 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Horario */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-xs font-semibold" style={{ color: 'var(--dh-gray-700)' }}>
              Horario de atención <span className="text-red-400">*</span>
            </span>
            <Clock className="w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {DAYS.map((dayName, dayNum) => {
              const dayBlocks = blocksOfDay(dayNum);
              const isDayActive = dayBlocks.some(({ block }) => block.enabled);

              return (
                <div key={dayNum} className={isDayActive ? 'bg-white' : 'bg-white opacity-60'}>
                  {/* Cabecera del día */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleDay(dayNum)}
                      className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${
                        isDayActive ? 'bg-teal-500' : 'bg-slate-200'
                      }`}
                      aria-label={`${isDayActive ? 'Deshabilitar' : 'Habilitar'} ${dayName}`}
                      aria-pressed={isDayActive}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          isDayActive ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>

                    <span
                      className="w-8 text-xs font-semibold shrink-0"
                      style={{ color: isDayActive ? 'var(--dh-ink)' : 'var(--dh-gray-400)' }}
                    >
                      {DAYS_SHORT[dayNum]}
                    </span>

                    {!isDayActive && (
                      <span className="flex-1 text-xs" style={{ color: 'var(--dh-gray-400)' }}>
                        No disponible
                      </span>
                    )}
                  </div>

                  {/* Bloques del día */}
                  {isDayActive && (
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      {dayBlocks.map(({ block, globalIdx }) => {
                        if (!block.enabled) return null;

                        const isOverlap = overlappingIndexes.has(globalIdx);
                        const isInvalid = invalidIndexes.has(globalIdx);
                        const hasError = isOverlap || isInvalid;
                        const onlyBlock =
                          dayBlocks.filter(({ block: b }) => b.enabled).length === 1;

                        return (
                          <div key={globalIdx} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={block.start}
                                onChange={(e) =>
                                  handleUpdateBlock(globalIdx, 'start', e.target.value)
                                }
                                className={`flex-1 min-w-0 px-2 py-1 text-sm rounded-lg border outline-none transition-all ${
                                  hasError
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-slate-200 focus:border-teal-400'
                                }`}
                                aria-label={`Inicio — ${dayName}, bloque ${globalIdx + 1}`}
                              />
                              <span className="text-xs text-slate-400 shrink-0">–</span>
                              <input
                                type="time"
                                value={block.end}
                                onChange={(e) =>
                                  handleUpdateBlock(globalIdx, 'end', e.target.value)
                                }
                                className={`flex-1 min-w-0 px-2 py-1 text-sm rounded-lg border outline-none transition-all ${
                                  hasError
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-slate-200 focus:border-teal-400'
                                }`}
                                aria-label={`Fin — ${dayName}, bloque ${globalIdx + 1}`}
                              />
                              {/* Quitar: se oculta si es el único bloque del día —
                                  para eso está el toggle, y así no queda un día
                                  activo sin ningún horario. */}
                              {!onlyBlock && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBlock(globalIdx)}
                                  aria-label={`Quitar bloque de ${dayName}`}
                                  className="shrink-0 p-1 rounded-md text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
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

                      <button
                        type="button"
                        onClick={() => handleAddBlock(dayNum)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors w-fit"
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
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--dh-gray-400)' }}>
            Puedes dividir el día — por ejemplo, 8:00–12:00 y 14:00–18:00.
          </p>
          {fieldErrors.schedule && (
            <p className="text-xs text-red-500 mt-1">{fieldErrors.schedule}</p>
          )}
        </div>

        {/* Duración y tiempo entre citas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="oo-slot"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--dh-gray-700)' }}
            >
              Duración de cita
            </label>
            <select
              id="oo-slot"
              value={slotDuration}
              onChange={(e) => setSlotDuration(Number(e.target.value))}
              className={inp}
            >
              {[15, 20, 30, 45, 60, 90].map((v) => (
                <option key={v} value={v}>
                  {v} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="oo-buffer"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--dh-gray-700)' }}
            >
              Tiempo entre citas
            </label>
            <select
              id="oo-buffer"
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
              className={inp}
            >
              {[0, 5, 10, 15, 20, 30].map((v) => (
                <option key={v} value={v}>
                  {v} min
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-colors"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Atrás
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--dh-turquoise)' }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Continuar
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
