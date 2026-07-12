'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  ChevronDown,
  Search,
  Stethoscope,
} from 'lucide-react';
import { createDoctor, type CreateDoctorInput, type DoctorPlan } from './actions';
import CedulaInput from '@/components/shared/CedulaInput';
import PhoneInput from '@/components/shared/PhoneInput';

const ESPECIALIDADES = [
  'Cardiología',
  'Dermatología',
  'Endocrinología',
  'Gastroenterología',
  'Ginecología y Obstetricia',
  'Medicina General',
  'Medicina Interna',
  'Nefrología',
  'Neurología',
  'Nutrición',
  'Odontología',
  'Oftalmología',
  'Ortopedia y Traumatología',
  'Otorrinolaringología',
  'Pediatría',
  'Psicología',
  'Psiquiatría',
  'Reumatología',
  'Fisioterapia',
  'Urología',
];

// Valor centinela para indicar "Otra especialidad" en el combobox.
const OTRO_VALUE = '__OTRO__';

const PLAN_OPTIONS: Array<{ value: DoctorPlan; label: string; description: string }> = [
  {
    value: 'free_trial',
    label: 'Free Trial',
    description: 'Prueba gratuita (30 días)',
  },
  {
    value: 'delta_free',
    label: 'Delta Free',
    description: 'Plan gratuito permanente',
  },
  {
    value: 'delta_base',
    label: 'Delta Base',
    description: 'Plan base con funciones esenciales',
  },
  {
    value: 'delta_plus',
    label: 'Delta Plus',
    description: 'Plan completo con todas las funciones',
  },
];

type FormState = CreateDoctorInput & { confirmPassword: string };

const defaultForm: FormState = {
  full_name: '',
  cedula: '',
  email: '',
  password: '',
  confirmPassword: '',
  specialty: '',
  phone: '',
  plan: 'free_trial',
};

type FormErrors = Partial<Record<keyof FormState, string>>;

// ---------------------------------------------------------------------------
// SpecialtySelect — combobox con buscador + opción "Otra" editable.
// Patrón idéntico al de OnboardingForm/SpecialtyCombobox.
// ---------------------------------------------------------------------------

interface SpecialtySelectProps {
  value: string; // puede ser nombre de especialidad, OTRO_VALUE, o ''
  customValue: string; // texto libre cuando value === OTRO_VALUE
  onChange: (selected: string) => void;
  onCustomChange: (text: string) => void;
  error?: string;
}

function SpecialtySelect({
  value,
  customValue,
  onChange,
  onCustomChange,
  error,
}: SpecialtySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isOtro = value === OTRO_VALUE;
  const displayLabel = isOtro
    ? 'Otra especialidad'
    : (ESPECIALIDADES.find((s) => s === value) ?? '');

  const filtered =
    query.trim() === ''
      ? ESPECIALIDADES
      : ESPECIALIDADES.filter((s) => s.toLowerCase().includes(query.toLowerCase().trim()));

  const listItems = [
    ...filtered.map((name) => ({ id: name, name })),
    { id: OTRO_VALUE, name: 'Otra especialidad' },
  ];

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

  function selectItem(id: string) {
    onChange(id);
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
        selectItem(listItems[activeIndex].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLLIElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const triggerBase =
    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium outline-none transition-colors border text-left bg-white';
  const triggerNormal = triggerBase + ' border-slate-200 focus:border-teal-500';
  const triggerError = triggerBase + ' border-red-300 bg-red-50 focus:border-red-400';

  return (
    <div ref={containerRef} className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open ? setOpen(false) : openDropdown();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Seleccionar especialidad"
        className={`cursor-pointer ${error ? triggerError : triggerNormal}`}
      >
        <Stethoscope className="w-4 h-4 shrink-0 text-slate-400" />
        <span className={`flex-1 truncate ${value ? 'text-slate-700' : 'text-slate-400'}`}>
          {displayLabel || 'Seleccionar...'}
        </span>
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearSelection();
            }}
            aria-label="Limpiar especialidad"
            className="p-0.5 rounded hover:bg-slate-100 transition-colors shrink-0 text-slate-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <ChevronDown
            className="w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        )}
      </div>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-lg overflow-hidden"
          style={{ border: '1px solid #e2e8f0', top: '100%' }}
          role="dialog"
          aria-label="Lista de especialidades"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-4 h-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Busca una especialidad..."
              className="flex-1 text-sm outline-none bg-transparent text-slate-800"
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
                className="shrink-0 text-slate-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <ul ref={listRef} role="listbox" className="max-h-48 overflow-y-auto">
            {listItems.map((item, idx) => (
              <li
                key={item.id}
                role="option"
                aria-selected={value === item.id}
                onClick={() => selectItem(item.id)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                  idx === activeIndex
                    ? 'bg-teal-50 text-teal-700'
                    : value === item.id
                      ? 'bg-teal-50/50 text-teal-700'
                      : 'hover:bg-slate-50 text-slate-700'
                } ${item.id === OTRO_VALUE ? 'border-t border-slate-100 italic' : ''}`}
              >
                {item.id === OTRO_VALUE && (
                  <Stethoscope className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                )}
                {item.name}
              </li>
            ))}
            {listItems.length === 1 /* solo "Otra" */ && (
              <li className="px-3 py-3 text-xs text-center text-slate-400">
                Sin resultados para &quot;{query}&quot;
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Input libre cuando el usuario seleccionó "Otra" */}
      {isOtro && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="Escribe la especialidad..."
          className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        />
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function NewDoctorModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(defaultForm);
  // specialtyCustom: texto libre cuando el usuario elige "Otra" en el combobox.
  const [specialtyCustom, setSpecialtyCustom] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleOpen() {
    setOpen(true);
    setForm(defaultForm);
    setSpecialtyCustom('');
    setErrors({});
    setServerError(null);
    setSuccess(false);
    setShowPassword(false);
    setShowConfirm(false);
  }

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    if (success) router.refresh();
  }

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  // Resuelve el valor de especialidad que se enviará al backend.
  // Si el usuario eligió OTRO_VALUE, se usa el texto libre (specialtyCustom).
  function resolvedSpecialty(): string {
    if (form.specialty === OTRO_VALUE) return specialtyCustom.trim();
    return form.specialty;
  }

  function validate(): boolean {
    const e: FormErrors = {};

    if (!form.full_name.trim()) e.full_name = 'El nombre es obligatorio';

    // CedulaInput emite el canónico 'V-12345678' / '' cuando vacío.
    if (!form.cedula.trim()) {
      e.cedula = 'La cédula es obligatoria';
    } else if (!/^[VEPvep]-\d{6,10}$|^[Pp]-[A-Za-z0-9]{5,20}$/.test(form.cedula.trim())) {
      e.cedula = 'Formato de cédula inválido';
    }

    if (!form.email.trim()) {
      e.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Email inválido';
    }

    if (!form.password) {
      e.password = 'La contraseña es obligatoria';
    } else if (form.password.length < 8) {
      e.password = 'Mínimo 8 caracteres';
    }

    if (!form.confirmPassword) {
      e.confirmPassword = 'Confirma la contraseña';
    } else if (form.password !== form.confirmPassword) {
      e.confirmPassword = 'Las contraseñas no coinciden';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setServerError(null);

    startTransition(async () => {
      // Construir el input con la especialidad ya resuelta (texto libre si era "Otra").
      const { confirmPassword, ...rest } = form;
      const input: CreateDoctorInput = {
        ...rest,
        specialty: resolvedSpecialty(),
      };
      void confirmPassword;
      const result = await createDoctor(input);
      if (result.success) {
        setSuccess(true);
      } else {
        setServerError(result.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nuevo médico
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nuevo médico</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Completa los datos para crear la cuenta
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={isPending}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto">
              {success ? (
                <SuccessView
                  doctorName={form.full_name}
                  email={form.email}
                  plan={form.plan}
                  onClose={handleClose}
                />
              ) : (
                <form id="new-doctor-form" onSubmit={handleSubmit} className="space-y-4">
                  {serverError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                      {serverError}
                    </div>
                  )}

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Datos personales
                    </legend>

                    <Field label="Nombre completo" required error={errors.full_name}>
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={(e) => handleChange('full_name', e.target.value)}
                        placeholder="Ej. Dr. Carlos Ramírez"
                        className={inputClass(!!errors.full_name)}
                      />
                    </Field>

                    {/* Cédula — CedulaInput maneja su propio mensaje de error;
                        no pasamos error a Field para evitar duplicado. */}
                    <Field label="Cédula de Identidad" required>
                      <CedulaInput
                        value={form.cedula}
                        onChange={(canonical) => handleChange('cedula', canonical)}
                        error={errors.cedula}
                        required
                        placeholder="12345678"
                      />
                    </Field>

                    <Field label="Email" required error={errors.email}>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="doctor@ejemplo.com"
                        className={inputClass(!!errors.email)}
                      />
                    </Field>

                    {/* Especialidad — SpecialtySelect maneja su propio mensaje de error */}
                    <Field label="Especialidad">
                      <SpecialtySelect
                        value={form.specialty}
                        customValue={specialtyCustom}
                        onChange={(selected) => {
                          handleChange('specialty', selected);
                          if (selected !== OTRO_VALUE) setSpecialtyCustom('');
                        }}
                        onCustomChange={setSpecialtyCustom}
                        error={errors.specialty}
                      />
                    </Field>

                    {/* Teléfono — PhoneInput maneja su propio mensaje de error */}
                    <Field label="Teléfono">
                      <PhoneInput
                        value={form.phone}
                        onChange={(canonical) => handleChange('phone', canonical)}
                        error={errors.phone}
                        placeholder="4141234567"
                      />
                    </Field>
                  </fieldset>

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Contraseña de acceso
                    </legend>

                    <Field label="Contraseña" required error={errors.password}>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => handleChange('password', e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          className={inputClass(!!errors.password) + ' pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </Field>

                    <Field label="Confirmar contraseña" required error={errors.confirmPassword}>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={form.confirmPassword}
                          onChange={(e) => handleChange('confirmPassword', e.target.value)}
                          placeholder="Repite la contraseña"
                          className={inputClass(!!errors.confirmPassword) + ' pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showConfirm ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </Field>
                  </fieldset>

                  <fieldset className="space-y-3">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Plan de suscripción
                    </legend>
                    <div className="grid grid-cols-1 gap-2">
                      {PLAN_OPTIONS.map((option) => {
                        const selected = form.plan === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                              selected
                                ? 'border-teal-500 bg-teal-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="plan"
                              value={option.value}
                              checked={selected}
                              onChange={() => handleChange('plan', option.value)}
                              className="accent-teal-500 shrink-0"
                            />
                            <div className="min-w-0">
                              <p
                                className={`text-sm font-semibold ${selected ? 'text-teal-800' : 'text-slate-700'}`}
                              >
                                {option.label}
                              </p>
                              <p
                                className={`text-xs mt-0.5 ${selected ? 'text-teal-600' : 'text-slate-400'}`}
                              >
                                {option.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </form>
              )}
            </div>

            {!success && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 shrink-0 bg-white">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="new-doctor-form"
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creando cuenta...
                    </>
                  ) : (
                    'Crear médico'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 text-sm rounded-lg border transition-colors outline-none
    focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500
    ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`;
}

const PLAN_LABELS_DISPLAY: Record<DoctorPlan, string> = {
  free_trial: 'Free Trial (30 días)',
  delta_free: 'Delta Free',
  delta_base: 'Delta Base',
  delta_plus: 'Delta Plus',
};

function SuccessView({
  doctorName,
  email,
  plan,
  onClose,
}: {
  doctorName: string;
  email: string;
  plan: DoctorPlan;
  onClose: () => void;
}) {
  const planLabel = PLAN_LABELS_DISPLAY[plan] ?? plan;
  const planColor = 'text-teal-600 bg-teal-50';

  return (
    <div className="flex flex-col items-center text-center gap-5 py-2">
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900">¡Médico creado exitosamente!</h3>
        <p className="text-sm text-slate-500">
          La cuenta de <span className="font-medium text-slate-700">{doctorName}</span> está lista
          para usar.
        </p>
      </div>
      <div className="w-full bg-slate-50 rounded-xl border border-slate-200 p-4 text-left space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resumen</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-slate-400">Nombre</span>
          <span className="font-medium text-slate-700 text-right truncate">{doctorName}</span>
          <span className="text-slate-400">Email</span>
          <span className="font-medium text-slate-700 text-right truncate">{email}</span>
          <span className="text-slate-400">Plan</span>
          <span className="text-right">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planColor}`}>
              {planLabel}
            </span>
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-400 px-2">
        Ya puede iniciar sesión con el email y la contraseña que definiste.
      </p>
      <button
        onClick={onClose}
        className="w-full px-4 py-2.5 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors"
      >
        Listo
      </button>
    </div>
  );
}
