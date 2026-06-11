'use client';

/**
 * OnboardingForm.tsx
 *
 * Formulario de registro profesional del médico (Fase 2).
 * Se muestra tras el primer login Auth0 cuando el doctor aún no ha completado
 * sus datos de identidad (nombre completo, cédula, MPPS, colegiado).
 *
 * Campos:
 *   - Nombre completo (obligatorio)
 *   - Cédula venezolana (obligatorio)
 *   - Número MPPS (opcional)
 *   - Número de colegiado (opcional)
 *
 * Flujo: envío → server action → POST /api/doctor/registration → estado de éxito.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardCheck,
  Loader2,
  User,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { submitDoctorRegistration } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  full_name: string;
  cedula: string;
  mpps_number: string;
  colegiado_number: string;
}

interface Props {
  /** Pre-filled full name from Auth0 profile, if available. */
  initialFullName?: string;
  /** Pre-filled cedula if the doctor had a partial profile. */
  initialCedula?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingForm({ initialFullName = '', initialCedula = '' }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState<FormState>({
    full_name: initialFullName,
    cedula: initialCedula,
    mpps_number: '',
    colegiado_number: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.full_name.trim()) {
      errors.full_name = 'El nombre completo es obligatorio';
    }
    if (!form.cedula.trim()) {
      errors.cedula = 'La cédula es obligatoria';
    } else if (!/^[VEve]-?\d{6,8}$/.test(form.cedula.trim().replace(/\s/g, ''))) {
      errors.cedula = 'Formato inválido — usa V-12345678 o E-12345678';
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

    startTransition(async () => {
      const result = await submitDoctorRegistration({
        full_name: form.full_name.trim(),
        cedula: form.cedula.trim(),
        mpps_number: form.mpps_number.trim() || null,
        colegiado_number: form.colegiado_number.trim() || null,
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
            Registro enviado
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--dh-gray-600)' }}>
            Tus datos fueron recibidos correctamente. Un administrador de Delta los revisará para
            verificar tu identidad profesional.
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
            Tu acceso ya está disponible
          </p>
          <p className="text-sm" style={{ color: 'var(--dh-turquoise-700)' }}>
            Puedes usar Delta Medical CRM mientras se procesa tu verificación. La verificación es un
            proceso administrativo y no bloquea ninguna función.
          </p>
        </div>

        <button
          onClick={handleGoToDashboard}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'var(--dh-turquoise)' }}
        >
          Ir al dashboard
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  const inputBase =
    'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2';
  const inputNormal = inputBase + ' border-slate-200 bg-white focus:border-teal-400 text-slate-800';
  const inputError = inputBase + ' border-red-300 bg-red-50 focus:border-red-400 text-slate-800';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b" style={{ borderColor: 'var(--dh-gray-100)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--dh-turquoise-50)' }}
          >
            <ClipboardCheck className="w-5 h-5" style={{ color: 'var(--dh-turquoise)' }} />
          </div>
          <div>
            <h2
              className="font-bold text-lg leading-tight"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Registro profesional
            </h2>
            <p className="text-xs" style={{ color: 'var(--dh-gray-400)' }}>
              Completa tus datos de identidad médica
            </p>
          </div>
        </div>

        <div
          className="mt-4 rounded-xl p-3 flex items-start gap-2.5"
          style={{
            background: 'var(--dh-turquoise-50)',
            border: '1px solid var(--dh-turquoise-100)',
          }}
        >
          <ShieldCheck
            className="w-4 h-4 shrink-0 mt-0.5"
            style={{ color: 'var(--dh-turquoise)' }}
          />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--dh-turquoise-700)' }}>
            Tu acceso al sistema ya está activo. Esta información es para verificación
            administrativa — no limita ninguna función mientras está en revisión.
          </p>
        </div>
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
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
              type="text"
              value={form.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
              placeholder="Ej. María González Pérez"
              className={`${fieldErrors.full_name ? inputError : inputNormal} pl-10`}
              autoComplete="name"
              aria-invalid={!!fieldErrors.full_name}
              aria-describedby={fieldErrors.full_name ? 'err-full-name' : undefined}
            />
          </div>
          {fieldErrors.full_name && (
            <p id="err-full-name" className="text-xs text-red-500 mt-1">
              {fieldErrors.full_name}
            </p>
          )}
        </div>

        {/* Cedula */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Cédula venezolana <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.cedula}
            onChange={(e) => setField('cedula', e.target.value)}
            placeholder="Ej. V-12345678"
            className={fieldErrors.cedula ? inputError : inputNormal}
            autoComplete="off"
            aria-invalid={!!fieldErrors.cedula}
            aria-describedby={fieldErrors.cedula ? 'err-cedula' : 'hint-cedula'}
          />
          {fieldErrors.cedula ? (
            <p id="err-cedula" className="text-xs text-red-500 mt-1">
              {fieldErrors.cedula}
            </p>
          ) : (
            <p id="hint-cedula" className="text-xs mt-1" style={{ color: 'var(--dh-gray-400)' }}>
              Incluye el prefijo V o E (ej. V-12345678)
            </p>
          )}
        </div>

        {/* MPPS — optional */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Número MPPS{' '}
            <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              (opcional)
            </span>
          </label>
          <input
            type="text"
            value={form.mpps_number}
            onChange={(e) => setField('mpps_number', e.target.value)}
            placeholder="Ej. MPPS-12345"
            className={inputNormal}
            autoComplete="off"
          />
        </div>

        {/* Colegiado — optional */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Número de colegiado{' '}
            <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              (opcional)
            </span>
          </label>
          <input
            type="text"
            value={form.colegiado_number}
            onChange={(e) => setField('colegiado_number', e.target.value)}
            placeholder="Ej. CVM-56789"
            className={inputNormal}
            autoComplete="off"
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--dh-turquoise)' }}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando registro...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Enviar registro
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
