import 'server-only';

/**
 * GET /api/doctor/subscription
 *
 * Thin-proxy → NestJS GET /api/doctor/subscription
 *
 * The backend returns a SubscriptionPanelOutput object directly (no envelope)
 * matching the SubscriptionData shape consumed by the frontend SubscriptionPanel
 * component. The BFF forwards it as-is so the panel can call setData(j) when r.ok.
 *
 * ETAPA 1: dev-auth headers via backendFetch.
 *
 * DEFERRED (remain 501 in separate BFF routes until future tasks implement them):
 *   POST /api/doctor/subscription/checkout  — submit payment comprobante
 *   POST /api/doctor/subscription/receipt   — upload receipt image
 */

import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const result = await backendFetch('/api/doctor/subscription', { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error?.message ?? 'Error al obtener la suscripción', code: 'BACKEND_ERROR' },
      { status: result.error?.status ?? 500 },
    );
  }
  // Return the panel data directly — SubscriptionPanel consumes it with setData(j)
  return NextResponse.json(result.value);
}
