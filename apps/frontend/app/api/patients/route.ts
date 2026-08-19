import 'server-only';

/**
 * app/api/patients/route.ts
 *
 * Thin-proxy → NestJS patients module.
 *
 * GET /api/patients?page=&limit=&search=  — lista paginada (PII enmascarada)
 * POST /api/patients                       — crear paciente (upsert por email/cedula)
 *
 * ETAPA 1: dev-auth headers via backendFetch.
 * ETAPA 2: reemplazar getDevUser() con Auth0 JWT de httpOnly cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';
import { resolveIdentity } from '@/lib/identity.server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const path = `/api/patients${qs ? `?${qs}` : ''}`;

  const result = await backendFetch(path, { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Body JSON inválido' } },
      { status: 400 },
    );
  }

  // `doctor_id` lo pone el SERVIDOR, a partir de la sesión.
  //
  // El DTO del backend lo exige (`z.string().uuid()`) y este handler reenviaba
  // el cuerpo tal cual: quien posteaba acá sin incluirlo —el modal de consulta
  // inmediata— recibía siempre un 400 y **nunca pudo crear un paciente**. El
  // camino de /doctor/patients no lo sufría porque su server action sí lo
  // agrega.
  //
  // Se resuelve de la sesión y NO se acepta del cuerpo, que es la regla
  // anti-IDOR del proyecto: si viniera del cliente, cualquiera podría crear
  // pacientes en la ficha de otro especialista.
  let identidad;
  try {
    identidad = await resolveIdentity();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'No autenticado', status: 401 } },
      { status: 401 },
    );
  }

  const cuerpo =
    typeof body === 'object' && body !== null
      ? { ...(body as Record<string, unknown>), doctor_id: identidad.id }
      : { doctor_id: identidad.id };

  const result = await backendFetch('/api/patients', { method: 'POST', body: cuerpo });
  if (!result.ok) {
    // 409 Conflict: el paciente ya existe — retornar el error del backend
    // que puede incluir existingId para que el caller lo use.
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
