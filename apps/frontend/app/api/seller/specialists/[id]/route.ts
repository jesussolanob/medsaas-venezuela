/**
 * GET /api/seller/specialists/:id — ficha completa de un especialista.
 *
 * Thin-proxy a `GET /api/seller/specialists/:id` del backend, que ya existía con
 * su guarda anti-IDOR (responde 422 si el especialista no es de ese vendedor)
 * pero era **inalcanzable**: nunca se creó esta ruta del BFF, así que el portal
 * no podía pedir el detalle. Mismo patrón que la ruta de alta de vendedor.
 *
 * Devuelve datos de contacto e identidad del ESPECIALISTA (no de pacientes).
 * El vendedor es personal de Delta y los necesita para hacer seguimiento —
 * pero NADA de esto se loguea.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Forma exacta por el wire: el backend serializa en camelCase. */
export interface SellerSpecialistDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cedula: string | null;
  isActive: boolean;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: 'id requerido' }, { status: 400 });
  }

  const result = await backendGet<SellerSpecialistDetail>(
    `/api/seller/specialists/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    // Sin cuerpo en el log: trae nombre, correo, teléfono y cédula.
    log.error('[seller/specialists/:id] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
