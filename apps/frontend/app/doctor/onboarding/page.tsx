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
import { completeOnboarding } from './actions';
import { redirect } from 'next/navigation';
import OnboardingForm from './OnboardingForm';
import { DeltaMark } from '@/components/dh/Logo';

// Soporte por WhatsApp — mismo número que usa la pantalla de planes.
const WHATSAPP_SOPORTE = '584221033582';
const WHATSAPP_MENSAJE = encodeURIComponent(
  'Hola, estoy creando mi cuenta de especialista en Delta Salud y tengo una duda.',
);

export const metadata = {
  title: 'Activa tu cuenta — Delta Salud',
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

  // Parse cedula prefix/number from stored value (e.g. "V-12345678", "P-AB123456")
  let initialCedulaPrefix: 'V' | 'E' | 'P' = 'V';
  let initialCedulaNumber = '';

  const rawCedula = profile?.cedula ?? '';
  if (rawCedula) {
    // Match V/E (digits only) or P (alphanumeric)
    const matchVE = rawCedula.match(/^([VEve])-?(\d+)$/);
    const matchP = rawCedula.match(/^[Pp]-?([A-Za-z0-9]+)$/);
    if (matchVE) {
      initialCedulaPrefix = (matchVE[1].toUpperCase() as 'V' | 'E') ?? 'V';
      initialCedulaNumber = matchVE[2];
    } else if (matchP) {
      initialCedulaPrefix = 'P';
      initialCedulaNumber = matchP[1].toUpperCase();
    } else {
      // Fallback: store raw in the number field
      initialCedulaNumber = rawCedula;
    }
  }

  // Determine which wizard step to start on based on profile state.
  // hasActiveOffice/hasActiveService are new fields from the backend (WP-F).
  // Fallback: if specialty filled → start at step 2, else step 1.
  const hasActiveOffice = profile?.hasActiveOffice ?? false;
  const hasActiveService = profile?.hasActiveService ?? false;

  // Edge case: office + service both exist but onboardingCompleted was never sealed
  // (e.g. the user navigated away between step 3 and success). Seal it server-side
  // and redirect to the portal — no wizard UI needed.
  if (hasActiveOffice && hasActiveService && !profile?.onboardingCompleted) {
    await completeOnboarding();
    redirect('/doctor');
  }

  const initialStep: 1 | 2 | 3 = hasActiveOffice ? 3 : profile?.specialty ? 2 : 1;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo header — isotipo oficial del brand kit. Antes había un icono
            genérico de lucide dentro de un cuadro con gradiente, que no es el
            logo de Delta. */}
        <div className="flex items-center gap-3 justify-center">
          <DeltaMark size={40} />
          <div className="text-left">
            {/* Solo "Delta Salud" — la bajada "Medical CRM" se quitó a pedido del dueño. */}
            <p
              className="font-extrabold text-lg leading-none"
              style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
            >
              Delta <span style={{ color: 'var(--dh-turquoise)' }}>Salud</span>
            </p>
          </div>
        </div>

        {/* Form */}
        <OnboardingForm
          initialFullName={profile?.fullName ?? ''}
          initialCedulaPrefix={initialCedulaPrefix}
          initialCedulaNumber={initialCedulaNumber}
          initialSpecialty={profile?.specialty ?? ''}
          initialPhone={profile?.phone ?? ''}
          specialties={specialties}
          initialStep={initialStep}
        />

        <p className="text-center text-xs" style={{ color: 'var(--dh-gray-400)' }}>
          ¿Tienes alguna duda?{' '}
          <a
            href={`https://wa.me/${WHATSAPP_SOPORTE}?text=${WHATSAPP_MENSAJE}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline"
            style={{ color: 'var(--dh-turquoise-700)' }}
          >
            Escríbenos por WhatsApp
          </a>
        </p>
      </div>
    </div>
  );
}
