/**
 * GET /api/public/specialties  (PÚBLICO, sin auth)
 *
 * Proxya el catálogo de especialidades del backend (`GET /api/specialties`, que NO
 * requiere autenticación) para que lo consuman los Client Components.
 *
 * Existe porque el onboarding (Server Component) leía el catálogo con `backendGet`,
 * pero /doctor/settings es cliente y no puede usar el api-client de servidor: por eso
 * mantenía SU PROPIA lista hardcodeada de especialidades, que se desincronizó del
 * catálogo real. Una especialidad escrita a mano en el onboarding (ej. "Cirugía
 * Maxilofacial") no estaba entre las <option> y el <select> se veía VACÍO.
 */
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

interface Specialty {
  id: string;
  name: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/specialties`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ specialties: [] }, { status: 200 });
    }
    const json = (await res.json()) as { data?: Specialty[]; specialties?: Specialty[] };
    const specialties = json?.data ?? json?.specialties ?? [];
    return NextResponse.json(
      { specialties },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch {
    // Degrada a lista vacía: la UI cae a su selector de texto libre.
    return NextResponse.json({ specialties: [] }, { status: 200 });
  }
}
