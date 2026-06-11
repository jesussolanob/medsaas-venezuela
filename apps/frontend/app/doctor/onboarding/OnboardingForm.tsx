'use client';

/**
 * OnboardingForm.tsx
 *
 * Formulario obligatorio de activación de cuenta médica.
 *
 * Campos:
 *   - Nombre completo (obligatorio)
 *   - Cédula: selector V/E + número (obligatorio)
 *   - Especialidad: combobox con buscador + opción OTRO (obligatorio)
 *   - Número MPPS (opcional)
 *   - Número de colegiado (opcional)
 *
 * Flujo: envío → server action → POST /api/doctor/registration → estado de éxito.
 */

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardCheck,
  Loader2,
  User,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  X,
  Lock,
  Stethoscope,
} from 'lucide-react';
import { submitDoctorRegistration } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Specialty {
  id: string;
  name: string;
}

interface Props {
  initialFullName?: string;
  initialCedulaPrefix?: 'V' | 'E';
  initialCedulaNumber?: string;
  initialSpecialty?: string;
  specialties: Specialty[];
}

interface FieldErrors {
  full_name?: string;
  cedula?: string;
  specialty?: string;
}

// ---------------------------------------------------------------------------
// SpecialtyCombobox
// ---------------------------------------------------------------------------

const OTRO_VALUE = '__OTRO__';

interface SpecialtyComboboxProps {
  specialties: Specialty[];
  value: string;
  customValue: string;
  onChange: (selected: string) => void;
  onCustomChange: (text: string) => void;
  error?: string;
}

function SpecialtyCombobox({
  specialties,
  value,
  customValue,
  onChange,
  onCustomChange,
  error,
}: SpecialtyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isOtro = value === OTRO_VALUE;
  const displayLabel = isOtro
    ? 'Otra especialidad'
    : (specialties.find((s) => s.name === value)?.name ?? '');

  // Filter specialties by query
  const filtered =
    query.trim() === ''
      ? specialties
      : specialties.filter((s) => s.name.toLowerCase().includes(query.toLowerCase().trim()));

  // Always append OTRO at the end
  const listItems = [...filtered, { id: OTRO_VALUE, name: 'Otra especialidad' }];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function openDropdown() {
    setOpen(true);
    setQuery('');
    setActiveIndex(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectItem(name: string) {
    onChange(name);
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }

  function clearSelection() {
    onChange('');
    onCustomChange('');
    setQuery('');
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, listItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < listItems.length) {
        selectItem(
          listItems[activeIndex].id === OTRO_VALUE ? OTRO_VALUE : listItems[activeIndex].name,
        );
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setActiveIndex(-1);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLLIElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const triggerBase =
    'w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 text-left bg-white';
  const triggerNormal = triggerBase + ' border-slate-200 focus:border-teal-400';
  const triggerError = triggerBase + ' border-red-300 bg-red-50 focus:border-red-400';

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Seleccionar especialidad"
        className={error ? triggerError : triggerNormal}
      >
        <Stethoscope
          className="w-4 h-4 shrink-0"
          style={{ color: value ? 'var(--dh-turquoise)' : 'var(--dh-gray-400)' }}
        />
        <span
          className="flex-1 truncate"
          style={{ color: value ? 'var(--dh-ink)' : 'var(--dh-gray-400)' }}
        >
          {displayLabel || 'Selecciona una especialidad...'}
        </span>
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearSelection();
            }}
            aria-label="Limpiar especialidad"
            className="p-0.5 rounded hover:bg-slate-100 transition-colors shrink-0"
            style={{ color: 'var(--dh-gray-400)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown
            className="w-4 h-4 shrink-0 transition-transform duration-200"
            style={{
              color: 'var(--dh-gray-400)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-xl shadow-lg overflow-hidden"
          style={{ border: '1px solid var(--dh-gray-100)', top: '100%' }}
          role="dialog"
          aria-label="Lista de especialidades"
        >
          {/* Search input */}
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
          >
            <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--dh-gray-400)' }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Busca tu especialidad..."
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: 'var(--dh-ink)' }}
              aria-label="Buscar especialidad"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setActiveIndex(-1);
                  inputRef.current?.focus();
                }}
                aria-label="Borrar búsqueda"
                className="shrink-0"
                style={{ color: 'var(--dh-gray-400)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Especialidades"
            className="overflow-y-auto"
            style={{ maxHeight: 220 }}
          >
            {listItems.length === 0 ? (
              <li className="px-4 py-3 text-sm" style={{ color: 'var(--dh-gray-400)' }}>
                Sin resultados para &ldquo;{query}&rdquo;
              </li>
            ) : (
              listItems.map((item, idx) => {
                const isOtroItem = item.id === OTRO_VALUE;
                const isActive = idx === activeIndex;
                const isSelected = isOtroItem ? value === OTRO_VALUE : value === item.name;

                return (
                  <li key={item.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => selectItem(isOtroItem ? OTRO_VALUE : item.name)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2"
                      style={{
                        background: isActive
                          ? 'var(--dh-turquoise-50)'
                          : isSelected
                            ? 'var(--dh-turquoise-50)'
                            : 'transparent',
                        color: isSelected ? 'var(--dh-turquoise-700)' : 'var(--dh-ink)',
                        fontWeight: isSelected ? 600 : 400,
                        borderTop: isOtroItem ? '1px solid var(--dh-gray-100)' : 'none',
                      }}
                    >
                      {isOtroItem && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wide"
                          style={{ color: 'var(--dh-gray-400)' }}
                        >
                          →
                        </span>
                      )}
                      {item.name}
                      {isSelected && (
                        <CheckCircle2
                          className="w-3.5 h-3.5 ml-auto shrink-0"
                          style={{ color: 'var(--dh-turquoise)' }}
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {/* Custom input when OTRO is selected */}
      {isOtro && (
        <div className="mt-2">
          <input
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="Escribe tu especialidad..."
            className={
              'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-teal-400 bg-teal-50 focus:border-teal-500'
            }
            style={{ color: 'var(--dh-ink)' }}
            autoFocus
            autoComplete="off"
            aria-label="Especifica tu especialidad"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--dh-turquoise-700)' }}>
            Escribe el nombre de tu especialidad
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingForm
// ---------------------------------------------------------------------------

export default function OnboardingForm({
  initialFullName = '',
  initialCedulaPrefix = 'V',
  initialCedulaNumber = '',
  initialSpecialty = '',
  specialties,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(initialFullName);
  const [cedulaPrefix, setCedulaPrefix] = useState<'V' | 'E'>(initialCedulaPrefix);
  const [cedulaNumber, setCedulaNumber] = useState(initialCedulaNumber);
  const [specialty, setSpecialty] = useState<string>(() => {
    if (!initialSpecialty) return '';
    // Check if it's a known specialty; if not, it's custom
    const known = specialties.find((s) => s.name === initialSpecialty);
    return known ? initialSpecialty : OTRO_VALUE;
  });
  const [customSpecialty, setCustomSpecialty] = useState<string>(() => {
    if (!initialSpecialty) return '';
    const known = specialties.find((s) => s.name === initialSpecialty);
    return known ? '' : initialSpecialty;
  });
  const [mppsNumber, setMppsNumber] = useState('');
  const [colegiadoNumber, setColegiadoNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!fullName.trim()) {
      errors.full_name = 'El nombre completo es obligatorio';
    }

    if (!cedulaNumber.trim()) {
      errors.cedula = 'El número de cédula es obligatorio';
    } else if (!/^\d{6,9}$/.test(cedulaNumber.trim())) {
      errors.cedula = 'Solo dígitos, entre 6 y 9 caracteres';
    }

    const resolvedSpecialty = specialty === OTRO_VALUE ? customSpecialty.trim() : specialty;
    if (!resolvedSpecialty) {
      errors.specialty = 'La especialidad es obligatoria';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setServerError(null);

    const resolvedSpecialty = specialty === OTRO_VALUE ? customSpecialty.trim() : specialty;
    const cedulaFormatted = `${cedulaPrefix}-${cedulaNumber.trim()}`;

    startTransition(async () => {
      const result = await submitDoctorRegistration({
        full_name: fullName.trim(),
        cedula: cedulaFormatted,
        specialty: resolvedSpecialty || undefined,
        mpps_number: mppsNumber.trim() || null,
        colegiado_number: colegiadoNumber.trim() || null,
      });

      if (!result.ok) {
        setServerError(result.error ?? 'Error al enviar tu registro. Intenta nuevamente.');
        return;
      }

      setSubmitted(true);
    });
  }

  function handleGoToDashboard() {
    router.push('/doctor');
    router.refresh();
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const resolvedSpecialty = specialty === OTRO_VALUE ? customSpecialty.trim() : specialty;
  const isFormValid =
    fullName.trim().length > 0 &&
    cedulaNumber.trim().length >= 6 &&
    /^\d+$/.test(cedulaNumber.trim()) &&
    resolvedSpecialty.length > 0;

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------

  if (submitted) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 space-y-6 text-center shadow-sm">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{ background: 'var(--dh-turquoise-50)' }}
        >
          <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--dh-turquoise)' }} />
        </div>

        <div className="space-y-2">
          <h2
            className="font-bold text-xl"
            style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
          >
            Cuenta activada
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--dh-gray-600)' }}>
            Tus datos fueron recibidos. Un administrador revisará tu perfil para la verificación
            profesional. Mientras tanto, ya tienes acceso completo al portal.
          </p>
        </div>

        <div
          className="rounded-xl p-4 text-left space-y-1"
          style={{
            background: 'var(--dh-turquoise-50)',
            border: '1px solid var(--dh-turquoise-100)',
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: 'var(--dh-turquoise-700)', fontFamily: 'var(--dh-font-mono)' }}
          >
            Acceso inmediato disponible
          </p>
          <p className="text-sm" style={{ color: 'var(--dh-turquoise-700)' }}>
            La verificación es un proceso administrativo y no bloquea ninguna función del portal.
          </p>
        </div>

        <button
          onClick={handleGoToDashboard}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'var(--dh-turquoise)' }}
        >
          Ir al portal
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Shared input styles
  // ---------------------------------------------------------------------------

  const inputBase =
    'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2';
  const inputNormal = inputBase + ' border-slate-200 bg-white focus:border-teal-400 text-slate-800';
  const inputError = inputBase + ' border-red-300 bg-red-50 focus:border-red-400 text-slate-800';

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-6 sm:px-8 pt-8 pb-6"
        style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'var(--dh-turquoise-50)' }}
          >
            <ClipboardCheck className="w-5 h-5" style={{ color: 'var(--dh-turquoise)' }} />
          </div>
          <div>
            <h2
              className="font-bold text-lg leading-tight"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Activa tu cuenta
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
              Paso obligatorio para acceder al portal médico
            </p>
          </div>
        </div>

        {/* Mandatory notice */}
        <div
          className="rounded-xl p-3 flex items-start gap-2.5"
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#d97706' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
            <strong>Este paso es obligatorio.</strong> Necesitas completar tu registro profesional
            para acceder al portal. Solo tarda un minuto.
          </p>
        </div>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} noValidate className="px-6 sm:px-8 py-6 space-y-5">
        {/* Server error */}
        {serverError && (
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 bg-red-50 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <p className="text-sm text-red-600">{serverError}</p>
          </div>
        )}

        {/* Full name */}
        <div>
          <label
            htmlFor="field-full-name"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Nombre completo <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <User
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--dh-gray-400)' }}
            />
            <input
              id="field-full-name"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.full_name)
                  setFieldErrors((prev) => ({ ...prev, full_name: undefined }));
              }}
              placeholder="Ej. María González Pérez"
              className={`${fieldErrors.full_name ? inputError : inputNormal} pl-10`}
              autoComplete="name"
              aria-invalid={!!fieldErrors.full_name}
              aria-describedby={fieldErrors.full_name ? 'err-full-name' : undefined}
            />
          </div>
          {fieldErrors.full_name && (
            <p id="err-full-name" role="alert" className="text-xs text-red-500 mt-1">
              {fieldErrors.full_name}
            </p>
          )}
        </div>

        {/* Cédula — V/E selector + number */}
        <div>
          <label
            htmlFor="field-cedula-number"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Cédula de identidad <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            {/* Prefix selector */}
            <div className="relative shrink-0">
              <select
                value={cedulaPrefix}
                onChange={(e) => {
                  setCedulaPrefix(e.target.value as 'V' | 'E');
                  if (fieldErrors.cedula)
                    setFieldErrors((prev) => ({ ...prev, cedula: undefined }));
                }}
                aria-label="Tipo de cédula"
                className="h-full appearance-none pl-3.5 pr-8 py-2.5 rounded-xl text-sm font-bold outline-none transition-all border-2 border-slate-200 bg-white focus:border-teal-400 cursor-pointer"
                style={{ color: 'var(--dh-ink)', minWidth: 72 }}
              >
                <option value="V">V</option>
                <option value="E">E</option>
              </select>
              <ChevronDown
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: 'var(--dh-gray-400)' }}
              />
            </div>

            {/* Number input */}
            <div className="flex-1 relative">
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none select-none"
                style={{ color: 'var(--dh-gray-400)' }}
                aria-hidden="true"
              >
                -
              </span>
              <input
                id="field-cedula-number"
                type="text"
                inputMode="numeric"
                value={cedulaNumber}
                onChange={(e) => {
                  // Only allow digits
                  const digits = e.target.value.replace(/\D/g, '');
                  setCedulaNumber(digits);
                  if (fieldErrors.cedula)
                    setFieldErrors((prev) => ({ ...prev, cedula: undefined }));
                }}
                placeholder="12345678"
                maxLength={9}
                className={`${fieldErrors.cedula ? inputError : inputNormal} pl-7`}
                autoComplete="off"
                aria-invalid={!!fieldErrors.cedula}
                aria-describedby={fieldErrors.cedula ? 'err-cedula' : 'hint-cedula'}
              />
            </div>
          </div>

          {/* Preview */}
          {cedulaNumber && !fieldErrors.cedula && (
            <p
              id="hint-cedula"
              className="text-xs mt-1"
              style={{ color: 'var(--dh-turquoise-700)' }}
            >
              Se guardará como:{' '}
              <strong>
                {cedulaPrefix}-{cedulaNumber}
              </strong>
            </p>
          )}
          {fieldErrors.cedula && (
            <p id="err-cedula" role="alert" className="text-xs text-red-500 mt-1">
              {fieldErrors.cedula}
            </p>
          )}
        </div>

        {/* Specialty */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Especialidad médica <span className="text-red-400">*</span>
          </label>
          <SpecialtyCombobox
            specialties={specialties}
            value={specialty}
            customValue={customSpecialty}
            onChange={(val) => {
              setSpecialty(val);
              if (fieldErrors.specialty)
                setFieldErrors((prev) => ({ ...prev, specialty: undefined }));
            }}
            onCustomChange={(txt) => {
              setCustomSpecialty(txt);
              if (fieldErrors.specialty)
                setFieldErrors((prev) => ({ ...prev, specialty: undefined }));
            }}
            error={fieldErrors.specialty}
          />
          {fieldErrors.specialty && (
            <p role="alert" className="text-xs text-red-500 mt-1">
              {fieldErrors.specialty}
            </p>
          )}
        </div>

        {/* MPPS — optional */}
        <div>
          <label
            htmlFor="field-mpps"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Número MPPS{' '}
            <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              (opcional)
            </span>
          </label>
          <input
            id="field-mpps"
            type="text"
            value={mppsNumber}
            onChange={(e) => setMppsNumber(e.target.value)}
            placeholder="Ej. MPPS-12345"
            className={inputNormal}
            autoComplete="off"
          />
        </div>

        {/* Colegiado — optional */}
        <div>
          <label
            htmlFor="field-colegiado"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Número de colegiado{' '}
            <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              (opcional)
            </span>
          </label>
          <input
            id="field-colegiado"
            type="text"
            value={colegiadoNumber}
            onChange={(e) => setColegiadoNumber(e.target.value)}
            placeholder="Ej. CVM-56789"
            className={inputNormal}
            autoComplete="off"
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending || !isFormValid}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--dh-turquoise)' }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Activar cuenta y continuar
              </>
            )}
          </button>
          <p className="text-center text-xs mt-2" style={{ color: 'var(--dh-gray-400)' }}>
            Los campos marcados con <span className="text-red-400">*</span> son obligatorios
          </p>
        </div>
      </form>
    </div>
  );
}
