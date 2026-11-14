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
import { listOffices } from '@/app/doctor/offices/actions';
import { completeOnboarding } from './actions';
import { redirect } from 'next/navigation';
import OnboardingForm from './OnboardingForm';
import { DeltaMark } from '@/components/dh/Logo';
import { supportWhatsAppUrl } from '@/lib/support-contact';

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

  const hasPhone = (profile?.phone ?? '').trim().length > 0;

  // Edge case: office + service both exist but onboardingCompleted was never sealed
  // (e.g. the user navigated away between step 3 and success). Seal it server-side
  // and redirect to the portal — only when phone is also set, since phone is now
  // required by the backend (422 ONBOARDING_PHONE_REQUIRED otherwise).
  let phoneRequiredMessage: string | undefined;
  if (hasActiveOffice && hasActiveService && !profile?.onboardingCompleted) {
    if (!hasPhone) {
      // Phone missing — force step 1 so the doctor fills it in.
      phoneRequiredMessage = 'Falta tu teléfono de contacto. Complétalo para activar tu cuenta.';
    } else {
      const result = await completeOnboarding();
      if (result.ok) {
        redirect('/doctor');
      } else if (result.code === 'ONBOARDING_PHONE_REQUIRED') {
        phoneRequiredMessage = 'Falta tu teléfono de contacto. Complétalo para activar tu cuenta.';
      }
      // Other errors: fall through and let the wizard handle them on submit.
    }
  }

  // Step 1 is forced when phone is missing, regardless of other profile fields.
  const initialStep: 1 | 2 | 3 =
    !hasPhone || phoneRequiredMessage ? 1 : hasActiveOffice ? 3 : profile?.specialty ? 2 : 1;

  // When the doctor already has an active office (e.g. created by "Omitir" or a
  // previous session), pass its id to the form so the step-2 component edits that
  // office instead of creating a duplicate. Without this, clicking "Atrás" from
  // step 3 on a fresh page load would try to CREATE a new office and the backend
  // would reject it with an overlap error (the default online Mon–Fri 08–17
  // schedule overlaps with any new Mon–Fri block).
  let existingOfficeId: string | null = null;
  if (hasActiveOffice) {
    try {
      const offices = await listOffices();
      const activeOffice = offices.find((o) => o.is_active);
      existingOfficeId = activeOffice?.id ?? null;
    } catch {
      // Non-fatal: if the fetch fails, the form falls back to create mode.
      // The backend's idempotency guard on skip-office prevents true duplicates.
    }
  }

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
          termsPending={initialStep > 1 && profile?.termsAccepted === false}
          initialErrorMessage={phoneRequiredMessage}
          initialOfficeId={existingOfficeId}
        />

        <a
          href={supportWhatsAppUrl(
            'Hola, estoy creando mi cuenta de especialista en Delta Salud y tengo una duda.',
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full py-3 px-5 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: '#25D366' }}
        >
          {/* WhatsApp icon — inline SVG to avoid adding a dependency */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 shrink-0"
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
