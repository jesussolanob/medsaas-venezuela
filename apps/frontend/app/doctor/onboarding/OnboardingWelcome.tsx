'use client';

/**
 * OnboardingWelcome — lámina de bienvenida, antes del paso 1.
 *
 * El wizard arrancaba directo en un formulario de datos personales, sin decir
 * qué venía después ni cuánto iba a tomar. Esta pantalla existe para responder
 * las tres preguntas que se hace alguien que entra por primera vez: qué es
 * esto, qué me van a pedir, y cuánto me va a llevar.
 *
 * Solo aparece cuando el especialista arranca de cero. Si vuelve a entrar con
 * el consultorio ya creado, el wizard lo deja en el paso que corresponde y esta
 * lámina no se muestra — dar la bienvenida a alguien que ya está a mitad de
 * camino se lee como que se perdió el avance.
 */

import { Building2, Stethoscope, UserRound, ArrowRight } from 'lucide-react';

const STEPS = [
  {
    icon: UserRound,
    title: 'Tus datos',
    body: 'Nombre, cédula y especialidad. Es lo que verán tus pacientes al agendar.',
  },
  {
    icon: Building2,
    title: 'Tu consultorio',
    body: 'Dónde atiendes y en qué horarios. Puedes dividir el día en varios bloques.',
  },
  {
    icon: Stethoscope,
    title: 'Tu primer servicio',
    body: 'Qué ofreces y a qué precio. Después podrás agregar más servicios.',
  },
] as const;

interface Props {
  /** Nombre del especialista, si ya lo tenemos del registro. */
  fullName?: string;
  onStart: () => void;
}

export default function OnboardingWelcome({ fullName, onStart }: Props) {
  // Solo el primer nombre: "Bienvenido, José Ramón Villalobos" suena a carta
  // formal; "Bienvenido, José" suena a que lo estábamos esperando.
  const firstName = fullName?.trim().split(/\s+/)[0] ?? '';

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      data-testid="onboarding-welcome"
    >
      <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
        <h1
          className="font-bold text-2xl leading-tight"
          style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
        >
          {firstName ? `Bienvenido, ${firstName}` : 'Bienvenido a Delta Salud'}
        </h1>
        <p
          className="text-sm mt-2 max-w-md mx-auto leading-relaxed"
          style={{ color: 'var(--dh-gray-500)' }}
        >
          Vamos a dejar tu consulta lista para recibir pacientes. Son tres pasos y toma unos pocos
          minutos.
        </p>
      </div>

      <ol className="px-6 sm:px-8 pb-2 flex flex-col gap-3">
        {STEPS.map(({ icon: Icon, title, body }, idx) => (
          <li
            key={title}
            className="flex items-start gap-3.5 rounded-xl p-3.5"
            style={{ background: 'var(--dh-gray-50)' }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--dh-turquoise-50)' }}
              aria-hidden="true"
            >
              <Icon className="w-4.5 h-4.5" style={{ color: 'var(--dh-turquoise)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
                <span className="tabular-nums" style={{ color: 'var(--dh-turquoise-700)' }}>
                  {idx + 1}.
                </span>{' '}
                {title}
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--dh-gray-500)' }}>
                {body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="px-6 sm:px-8 py-6">
        <button
          type="button"
          onClick={onStart}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90"
          style={{ background: 'var(--dh-turquoise)' }}
        >
          Comenzar
          <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-[11px] text-center mt-3" style={{ color: 'var(--dh-gray-400)' }}>
          Puedes cambiar todo esto más adelante desde Configuración.
        </p>
      </div>
    </div>
  );
}
