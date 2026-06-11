/**
 * /doctor/onboarding — Registro profesional obligatorio del médico.
 *
 * Server Component: carga el perfil actual (pre-rellena nombre, cédula y
 * especialidad) y la lista de especialidades disponibles para el combobox.
 *
 * Esta página se muestra a pantalla completa (sin sidebar) gracias al
 * layout.tsx propio de esta carpeta.
 */

import { getDoctorProfile } from '@/app/doctor/actions';
import { backendGet } from '@/lib/api-client.server';
import OnboardingForm from './OnboardingForm';
import { Activity } from 'lucide-react';

export const metadata = {
  title: 'Activa tu cuenta — Delta Medical CRM',
};

interface Specialty {
  id: string;
  name: string;
}

async function fetchSpecialties(): Promise<Specialty[]> {
  // GET /api/specialties is public — still uses backendGet for consistency.
  const result = await backendGet<Specialty[]>('/api/specialties');
  if (!result.ok) return [];
  return Array.isArray(result.value) ? result.value : [];
}

export default async function DoctorOnboardingPage() {
  const [profile, specialties] = await Promise.all([getDoctorProfile(), fetchSpecialties()]);

  // Parse cedula prefix/number from stored value (e.g. "V-12345678")
  let initialCedulaPrefix: 'V' | 'E' = 'V';
  let initialCedulaNumber = '';

  const rawCedula = profile?.cedula ?? '';
  if (rawCedula) {
    const match = rawCedula.match(/^([VEve])-?(\d+)$/);
    if (match) {
      initialCedulaPrefix = (match[1].toUpperCase() as 'V' | 'E') ?? 'V';
      initialCedulaNumber = match[2];
    } else {
      // Fallback: store raw in the number field
      initialCedulaNumber = rawCedula;
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
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
        <OnboardingForm
          initialFullName={profile?.full_name ?? ''}
          initialCedulaPrefix={initialCedulaPrefix}
          initialCedulaNumber={initialCedulaNumber}
          initialSpecialty={profile?.specialty ?? ''}
          specialties={specialties}
        />

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
