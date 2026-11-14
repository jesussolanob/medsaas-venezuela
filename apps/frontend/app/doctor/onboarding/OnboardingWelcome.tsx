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
import { supportWhatsAppUrl } from '@/lib/support-contact';

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

        <a
          href={supportWhatsAppUrl(
            'Hola, estoy creando mi cuenta de especialista en Delta Salud y tengo una duda.',
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2.5 w-full py-2.5 px-5 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: '#25D366' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 shrink-0"
            aria-hidden="true"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          ¿Dudas? Habla con un asesor por WhatsApp
        </a>
      </div>
    </div>
  );
}
