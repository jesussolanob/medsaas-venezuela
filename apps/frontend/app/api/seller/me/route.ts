/**
 * GET /api/seller/me — el vendedor autenticado y su código.
 *
 * Existe porque el código es la mitad del mecanismo de atribución: le pedimos
 * al vendedor que lo comparta, así que tiene que poder leerlo. Devuelve solo
 * lo necesario para mostrarlo y compartirlo.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface SellerMe {
  sellerCode: string | null;
  fullName: string;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<SellerMe>('/api/seller/me');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
