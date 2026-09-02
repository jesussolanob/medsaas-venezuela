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
import { backendGet, backendPatch } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Forma exacta por el wire: el backend serializa en camelCase. */
export interface SellerSpecialistDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  cedula: string | null;
  sellerNotes: string | null;
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

/**
 * PATCH /api/seller/specialists/:id — el vendedor carga teléfono y notas.
 *
 * Solo reenvía esos dos campos. Un `plan` o un `role` que llegue en el cuerpo
 * NO viaja al backend (que además lo rechazaría por `.strict()`).
 *
 * SECURITY: el cuerpo trae PII — nunca se loguea.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: 'id requerido' }, { status: 400 });
  }

  let body: { phone?: string | null; seller_notes?: string | null };
  try {
    body = (await req.json()) as { phone?: string | null; seller_notes?: string | null };
  } catch {
    return NextResponse.json(
      { success: false, error: 'Cuerpo de la solicitud inválido' },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {};
  if (body.phone !== undefined) payload.phone = body.phone;
  if (body.seller_notes !== undefined) payload.seller_notes = body.seller_notes;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { success: false, error: 'Mandá al menos un campo para actualizar.' },
      { status: 400 },
    );
  }

  const result = await backendPatch<SellerSpecialistDetail>(
    `/api/seller/specialists/${encodeURIComponent(id)}`,
    payload,
  );

  if (!result.ok) {
    log.error('[seller/specialists/:id PATCH] backend error', {
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
