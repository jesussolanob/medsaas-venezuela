/**
 * /api/doctor/notifications/read-all — POST marca todas las notificaciones
 * del doctor autenticado como leídas.
 *
 * ADR-022: route handler (no Server Action).
 * Idempotente: si todas están leídas devuelve { count: 0 }.
 *
 * Proxies to: POST /api/doctor/notifications/read-all (backend)
 */
import { NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

interface ReadAllResponse {
  count: number;
}

export async function POST(): Promise<NextResponse> {
  const result = await backendPost<ReadAllResponse>('/doctor/notifications/read-all', {});

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
