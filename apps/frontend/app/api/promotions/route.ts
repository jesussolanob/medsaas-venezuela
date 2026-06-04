/**
 * GET /api/promotions — público: lista promociones activas.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `promotions` (endpoint público, sin auth).
 * El backend filtra is_active y ends_at futuro, y omite campos sensibles.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export async function GET() {
  const result = await backendGet<unknown[]>('/api/promotions');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(Array.isArray(result.value) ? result.value : []);
}
