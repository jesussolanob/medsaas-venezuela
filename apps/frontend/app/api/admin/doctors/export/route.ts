/**
 * GET /api/admin/doctors/export — descarga CSV de especialistas (admin).
 *
 * Thin-proxy al backend NestJS `GET /api/admin/doctors/export` (super_admin).
 * El backend devuelve CSV crudo (no envelope), así que aquí reenviamos el cuerpo
 * con los headers de descarga. Auth vía resolveIdentity (mismo patrón que el BFF).
 */
import { NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/identity.server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function GET() {
  const user = await resolveIdentity();
  const r = await fetch(`${BACKEND_URL}/api/admin/doctors/export`, {
    headers: {
      'x-dev-user-id': user.id,
      'x-dev-user-role': user.role,
    },
    cache: 'no-store',
  });

  if (!r.ok) {
    return NextResponse.json(
      { error: 'No se pudo exportar la lista de especialistas' },
      { status: r.status },
    );
  }

  // Pass the bytes through untouched: r.text() decodes UTF-8 and drops the BOM
  // the backend prepends, and without it Excel shows "TelÃ©fono" instead of "Teléfono".
  const csv = await r.arrayBuffer();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="especialistas.csv"',
    },
  });
}
