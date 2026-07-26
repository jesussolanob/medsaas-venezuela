'use client';

/**
 * SetupStepper — progreso de puesta en marcha del especialista, en el inicio.
 *
 * Reemplaza las dos tarjetas sueltas que sugerían "configura tus plantillas" y
 * "crea tu consultorio": eran avisos independientes, sin noción de progreso, y no
 * decían cuánto falta para poder atender de verdad.
 *
 * Se oculta por completo cuando los 5 pasos están listos: a partir de ahí no
 * aporta nada y el inicio queda limpio.
 */

import Link from 'next/link';
import { Check } from 'lucide-react';

export interface SetupStep {
  /** Identificador estable, usado como key. */
  id: string;
  label: string;
  /** Qué gana el especialista al completarlo (se muestra en el paso pendiente). */
  hint: string;
  href: string;
  done: boolean;
}

interface Props {
  steps: SetupStep[];
}

export function SetupStepper({ steps }: Props) {
  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;

  // Todo listo → el bloque desaparece.
  if (completed === total) return null;

  const pct = Math.round((completed / total) * 100);
  // El siguiente pendiente es el único que se muestra expandido: pedirle al
  // especialista 5 cosas a la vez es lo que hacía ignorable el aviso anterior.
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <section
      aria-labelledby="setup-stepper-title"
      className="rounded-xl border border-teal-200 bg-white p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 id="setup-stepper-title" className="text-sm font-bold text-slate-800">
          Termina de configurar tu consulta
        </h2>
        <p className="text-xs font-semibold text-teal-700">
          {completed} de {total} listos
        </p>
      </div>

      {/* Barra de progreso */}
      <div
        className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`Progreso de configuración: ${completed} de ${total} pasos`}
      >
        <div
          className="h-full rounded-full bg-teal-500 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4 space-y-1.5">
        {steps.map((step, i) => {
          const isNext = i === nextIndex;
          return (
            <li key={step.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  step.done
                    ? 'bg-teal-500 text-white'
                    : isNext
                      ? 'bg-teal-50 text-teal-700 border-2 border-teal-400'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {step.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm truncate ${
                    step.done
                      ? 'text-slate-400 line-through'
                      : isNext
                        ? 'font-semibold text-slate-800'
                        : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </p>
                {isNext && <p className="text-xs text-slate-500 mt-0.5">{step.hint}</p>}
              </div>

              {!step.done && (
                <Link
                  href={step.href}
                  className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    isNext
                      ? 'bg-teal-500 text-white hover:bg-teal-600'
                      : 'text-teal-600 hover:bg-teal-50'
                  }`}
                >
                  {isNext ? 'Continuar' : 'Ir'}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
