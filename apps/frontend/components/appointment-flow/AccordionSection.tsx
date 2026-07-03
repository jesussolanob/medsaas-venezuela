'use client';

import { Check } from 'lucide-react';

/**
 * AccordionSection — usado por NewAppointmentFlow para cada paso del wizard.
 *
 * Estados visuales:
 *   isOpen  → teal ring (paso activo)
 *   isPast  → emerald ring + checkmark (paso completado, se puede volver atrás)
 *   isFuture → gris opaco, botón deshabilitado
 */
export default function AccordionSection({
  step,
  currentStep,
  title,
  icon: Icon,
  summary,
  completed,
  onOpen,
  children,
}: {
  step: number;
  currentStep: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary?: string;
  completed: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  const isOpen = currentStep === step;
  const isPast = completed && !isOpen;
  const isFuture = !completed && !isOpen;

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all ${
        isOpen
          ? 'shadow-md bg-white ring-2 ring-teal-400'
          : isPast
            ? 'bg-white ring-1 ring-emerald-200'
            : 'bg-slate-50 ring-1 ring-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={isPast || isOpen ? onOpen : undefined}
        disabled={isFuture}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
          isPast
            ? 'cursor-pointer hover:bg-emerald-50/50'
            : isFuture
              ? 'cursor-default opacity-50'
              : ''
        }`}
      >
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isPast ? 'bg-emerald-500' : isOpen ? 'bg-teal-500' : 'bg-slate-200'
          }`}
        >
          {isPast ? (
            <Check className="w-4 h-4 text-white" />
          ) : (
            <Icon className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-slate-400'}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold ${
              isPast ? 'text-emerald-700' : isOpen ? 'text-slate-900' : 'text-slate-400'
            }`}
          >
            {step}. {title}
          </p>
          {summary && (isPast || isOpen) && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {isPast && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
      </button>
      {isOpen && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}
