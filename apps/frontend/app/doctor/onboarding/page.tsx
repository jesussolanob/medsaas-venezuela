/**
 * /doctor/onboarding — Registro profesional del médico (Fase 2).
 *
 * Server Component: carga el perfil actual para pre-rellenar nombre y cédula.
 * Si el doctor ya completó el registro, redirige al dashboard.
 */

import { getDoctorProfile } from '@/app/doctor/actions';
import OnboardingForm from './OnboardingForm';
import { Activity } from 'lucide-react';

export const metadata = {
  title: 'Completa tu registro — Delta Medical CRM',
};

export default async function DoctorOnboardingPage() {
  const profile = await getDoctorProfile();

  const initialFullName = profile?.full_name ?? '';
  const initialCedula = profile?.cedula ?? '';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--dh-bone, #F5F4F0)' }}
    >
      <div className="w-full max-w-lg space-y-6">
        {/* Logo header */}
        <div className="flex items-center gap-3 justify-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
          >
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p
              className="font-extrabold text-lg leading-none"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Delta<span style={{ color: 'var(--dh-turquoise)' }}>.</span>
            </p>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: 'var(--dh-turquoise-700)', fontFamily: 'var(--dh-font-mono)' }}
            >
              Medical CRM
            </p>
          </div>
        </div>

        {/* Form */}
        <OnboardingForm initialFullName={initialFullName} initialCedula={initialCedula} />

        <p className="text-center text-xs" style={{ color: 'var(--dh-gray-400)' }}>
          ¿Tienes alguna duda?{' '}
          <a
            href="mailto:soporte@delta-medical.app"
            className="font-semibold hover:underline"
            style={{ color: 'var(--dh-turquoise-700)' }}
          >
            Contáctanos
          </a>
        </p>
      </div>
    </div>
  );
}
