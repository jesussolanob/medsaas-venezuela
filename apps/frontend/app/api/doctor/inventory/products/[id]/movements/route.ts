import 'server-only';

/**
 * app/api/doctor/inventory/products/[id]/movements/route.ts
 *
 * Thin-proxy → NestJS inventory controller.
 *
 * GET  /api/doctor/inventory/products/:id/movements
 * POST /api/doctor/inventory/products/:id/movements  (manual: purchase | adjustment | loss)
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendFetch<unknown>(`/api/doctor/inventory/products/${id}/movements`, {
    method: 'GET',
  });

  if (!result.ok) {
    log.error('[inventory/products/:id/movements GET] backend error', {
      id,
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendFetch<unknown>(`/api/doctor/inventory/products/${id}/movements`, {
    method: 'POST',
    body,
  });

  if (!result.ok) {
    log.error('[inventory/products/:id/movements POST] backend error', {
      id,
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
