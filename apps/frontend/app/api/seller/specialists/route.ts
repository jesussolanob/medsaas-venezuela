/**
 * /api/seller/specialists — thin-proxy al módulo `sellers` del backend.
 *
 * GET  → los especialistas que registró el vendedor autenticado.
 * POST → alta de un especialista desde el portal del vendedor.
 *
 * El backend fija `sold_by` con la sesión y el plan en el de prueba: NO se
 * mandan desde acá ni aunque el cliente los ponga. Un vendedor no elige plan
 * (decisión del dueño), y eso se resuelve quitando la decisión, no filtrando
 * el formulario.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface SellerSpecialistRow {
  id: string;
  fullName: string;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  /** Última vez que entró. null = nunca entró desde que se registró. */
  lastSignInAt?: string | null;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<SellerSpecialistRow[]>('/api/seller/specialists');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    specialty?: string;
    cedula?: string;
    phone?: string;
  };

  if (!body.fullName?.trim() || !body.email?.trim()) {
    return NextResponse.json(
      { error: 'El nombre y el correo son obligatorios', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendPost<SellerSpecialistRow>('/api/seller/specialists', {
    full_name: body.fullName.trim(),
    email: body.email.trim(),
    ...(body.specialty?.trim() ? { specialty: body.specialty.trim() } : {}),
    ...(body.cedula?.trim() ? { cedula: body.cedula.trim() } : {}),
    ...(body.phone?.trim() ? { phone: body.phone.trim() } : {}),
  });

  if (!result.ok) {
    // 409 = ya existe una cuenta con ese correo.
    if (result.error.status === 409) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con ese correo.', code: 'email_conflict' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
