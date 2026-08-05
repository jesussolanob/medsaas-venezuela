'use client';

/**
 * OnboardingStepService — Paso 3 del wizard de onboarding.
 *
 * Permite crear el primer servicio/tarifa del especialista.
 * Campos obligatorios: nombre y precio en USD.
 * Campos opcionales: duración, descripción.
 * Al guardar llama `completeOnboarding()` para marcar el onboarding como terminado.
 */

import { useState, useTransition } from 'react';
import {
  Stethoscope,
  DollarSign,
  Clock,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { createDoctorService } from '@/app/doctor/services/actions';
import { completeOnboarding } from './actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  officeId: string | null;
  onBack: () => void;
  onSuccess: () => void;
}

interface FieldErrors {
  name?: string;
  price_usd?: string;
}

const inp =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-slate-200 bg-white focus:border-teal-400 text-slate-800';
const inpErr =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none transition-all border-2 border-red-300 bg-red-50 focus:border-red-400 text-slate-800';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingStepService({ officeId, onBack, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [durationMins, setDurationMins] = useState(30);
  const [description, setDescription] = useState('');

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = 'El nombre del servicio es obligatorio';
    const price = parseFloat(priceUsd);
    if (!priceUsd.trim() || isNaN(price) || price < 0) {
      errors.price_usd = 'Ingresa un precio válido en USD (puede ser 0)';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setServerError(null);

    startTransition(async () => {
      // 1. Create the service
      const serviceResult = await createDoctorService({
        name: name.trim(),
        price_usd: parseFloat(priceUsd),
        duration_minutes: durationMins,
        sessions_count: 1,
        description: description.trim() || null,
        type: 'service',
        show_in_booking: true,
        office_id: officeId ?? null,
      });

      if (!serviceResult.success) {
        setServerError(serviceResult.error ?? 'Error al crear el servicio. Intenta nuevamente.');
        return;
      }

      // 2. Mark onboarding complete — 422 means backend validation failed (no office/service)
      //    which shouldn't happen here, but show the error if it does.
      const completeResult = await completeOnboarding();
      if (!completeResult.ok) {
        setServerError(
          completeResult.error ??
            'El servicio fue creado pero no pudimos confirmar la configuración. Contacta a soporte.',
        );
        return;
      }

      onSuccess();
    });
  }

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      data-testid="onboarding-step-service"
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
            <Stethoscope className="w-5 h-5" style={{ color: 'var(--dh-turquoise)' }} />
          </div>
          <div>
            <h2
              className="font-bold text-lg leading-tight"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Tu primer servicio
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
              Define el servicio que ofrecerás — podrás añadir más desde la configuración
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
            htmlFor="os-name"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Nombre del servicio <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Stethoscope
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--dh-gray-400)' }}
            />
            <input
              id="os-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
              }}
              placeholder="Ej. Consulta general"
              className={`${fieldErrors.name ? inpErr : inp} pl-10`}
              aria-invalid={!!fieldErrors.name}
            />
          </div>
          {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
        </div>

        {/* Precio + Duración */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="os-price"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--dh-gray-700)' }}
            >
              Precio (USD) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <DollarSign
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--dh-gray-400)' }}
              />
              <input
                id="os-price"
                type="number"
                min="0"
                step="0.01"
                value={priceUsd}
                onChange={(e) => {
                  setPriceUsd(e.target.value);
                  if (fieldErrors.price_usd)
                    setFieldErrors((p) => ({ ...p, price_usd: undefined }));
                }}
                placeholder="0.00"
                className={`${fieldErrors.price_usd ? inpErr : inp} pl-10`}
                aria-invalid={!!fieldErrors.price_usd}
              />
            </div>
            {fieldErrors.price_usd && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.price_usd}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="os-duration"
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--dh-gray-700)' }}
            >
              Duración
            </label>
            <div className="relative">
              <Clock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--dh-gray-400)' }}
              />
              <select
                id="os-duration"
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className={`${inp} pl-10`}
              >
                {[15, 20, 30, 45, 60, 90].map((v) => (
                  <option key={v} value={v}>
                    {v} min
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label
            htmlFor="os-description"
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--dh-gray-700)' }}
          >
            Descripción{' '}
            <span className="font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              (opcional)
            </span>
          </label>
          <textarea
            id="os-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe brevemente qué incluye este servicio..."
            rows={3}
            className={`${inp} resize-none`}
          />
        </div>

        {/* Acciones */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40"
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
                <CheckCircle2 className="w-4 h-4" />
                Finalizar configuración
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
