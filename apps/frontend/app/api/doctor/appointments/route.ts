/**
 * app/api/doctor/appointments/route.ts
 *
 * ETAPA 2 — DELETE not implemented.
 * The DELETE handler requires a coordinating backend endpoint that handles:
 *   1. Cascade delete of consultations + EHR + prescriptions
 *   2. Package session restore (restore_package_session RPC)
 *   3. Google Calendar event deletion (OAuth2 refresh token flow)
 *
 * None of these are available as a single backend endpoint in Etapa 1.
 * Deferred to the NestJS integrations module (Etapa 2).
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'Eliminación de citas disponible próximamente',
      code: 'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
}
