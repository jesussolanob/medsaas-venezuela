import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/doctor/exchange-rate
 *
 * Thin-proxy to GET /api/doctor/exchange-rate on the NestJS backend.
 * The backend returns:
 *   { mode:'usd_bcv'|'eur_bcv'|'custom', rate, label, customRate, customRateLabel }
 *
 * Previously: fetched BCV rates from external APIs + read Supabase profiles.
 * Now: delegated entirely to the backend which manages BCV polling + doctor preference.
 *
 * ETAPA 1 — dev-auth headers injected by backendFetch.
 */
export async function GET(_request: NextRequest) {
  const result = await backendFetch<unknown>('/api/doctor/exchange-rate', { method: 'GET' });

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: result.error.status || 502 },
    );
  }

  return NextResponse.json(result.value);
}

/**
 * PUT /api/doctor/exchange-rate
 *
 * Thin-proxy to PUT /api/doctor/exchange-rate on the NestJS backend.
 * Body: { mode, custom_rate?, custom_rate_label? }
 *
 * ETAPA 1 — dev-auth headers injected by backendFetch.
 */
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Cuerpo de solicitud inválido' } },
      { status: 400 },
    );
  }

  const result = await backendFetch<unknown>('/api/doctor/exchange-rate', {
    method: 'PUT',
    body,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: result.error.status || 502 },
    );
  }

  return NextResponse.json(result.value);
}
