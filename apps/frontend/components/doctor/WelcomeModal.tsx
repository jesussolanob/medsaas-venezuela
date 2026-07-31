'use client';

/**
 * WelcomeModal — tour breve de los módulos, al entrar al panel del especialista.
 *
 * Se muestra SIEMPRE hasta que el especialista marque "No volver a mostrar";
 * ese check se persiste en el perfil (profiles.welcome_dismissed_at), no en
 * localStorage, para que la decisión lo acompañe entre dispositivos.
 *
 * El contenido depende del PLAN: solo se explican los módulos que el plan del
 * especialista habilita. Prometerle Finanzas o IA a quien está en Delta Free
 * sería enseñarle una puerta cerrada.
 */

import { useState } from 'react';
import {
  X,
  CalendarDays,
  Users,
  Stethoscope,
  Wallet,
  FileText,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { planUnlocks, type PlanFeatures } from '@/lib/plan-features';

interface ModuleBlurb {
  /** Clave de feature del plan. undefined = visible en todos los planes. */
  featureKey?: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const MODULES: ModuleBlurb[] = [
  {
    icon: CalendarDays,
    title: 'Agenda',
    description: 'Tus citas del día y del mes. Confirma, reagenda o cancela desde el calendario.',
    featureKey: 'agenda',
  },
  {
    icon: Users,
    title: 'Pacientes',
    description: 'La ficha de cada paciente: datos, antecedentes, documentos e historial.',
    featureKey: 'patients',
  },
  {
    icon: Stethoscope,
    title: 'Consultas',
    description: 'Donde registras la atención: motivo, diagnóstico, récipes e informes.',
    featureKey: 'consultations',
  },
  {
    icon: Wallet,
    title: 'Finanzas',
    description: 'Lo que cobraste, lo que está por ingresar y tus gastos del mes.',
    featureKey: 'finances',
  },
  {
    icon: FileText,
    title: 'Plantillas',
    description: 'Tu logo y tu firma en récipes, informes y constancias.',
    featureKey: 'settings',
  },
  {
    icon: Sparkles,
    title: 'Asistente de IA',
    description: 'Transcribe la consulta y resume la historia del paciente por ti.',
    featureKey: 'ai_assistant',
  },
];

interface Props {
  planFeatures: PlanFeatures | null;
  /** Persiste la decisión. Solo se llama si el especialista marcó el check. */
  onDismissForever: () => Promise<void> | void;
  onClose: () => void;
}

export function WelcomeModal({ planFeatures, onDismissForever, onClose }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [closing, setClosing] = useState(false);

  const modules = MODULES.filter((m) => planUnlocks(planFeatures, m.featureKey));

  async function handleClose() {
    setClosing(true);
    try {
      if (dontShowAgain) await onDismissForever();
    } finally {
      // Aunque falle el guardado se cierra: el modal no puede dejar atrapado al
      // especialista. Como mucho reaparece en el proximo ingreso.
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 id="welcome-title" className="text-lg font-bold text-slate-900">
              Te damos la bienvenida a Delta Salud
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Un recorrido de un minuto por lo que puedes hacer aquí.
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="px-6 space-y-3">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.title} className="flex gap-3">
                <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{m.description}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Puntero al asistente: es la salida para cualquier duda posterior. */}
        <div className="mx-6 mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4 flex gap-3">
          <span className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4" />
          </span>
          <p className="text-xs text-slate-600 leading-relaxed">
            ¿Dudas en cualquier momento? Pulsa el icono de <strong>ayuda</strong> arriba a la
            derecha y pregúntale al asistente: te responde sobre cualquier parte del sistema.
          </p>
        </div>

        <div className="p-6 pt-5 flex items-center justify-between gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-400"
            />
            No volver a mostrar
          </label>
          <button
            onClick={handleClose}
            disabled={closing}
            className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {closing ? 'Guardando…' : 'Empezar'}
          </button>
        </div>
      </div>
    </div>
  );
}
