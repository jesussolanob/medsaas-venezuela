import 'server-only';

/**
 * app/api/doctor/inventory/products/[id]/route.ts
 *
 * Thin-proxy → NestJS inventory controller.
 *
 * GET    /api/doctor/inventory/products/:id
 * PUT    /api/doctor/inventory/products/:id
 * DELETE /api/doctor/inventory/products/:id  (soft-delete / deactivate)
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendFetch<unknown>(`/api/doctor/inventory/products/${id}`, {
    method: 'GET',
  });

  if (!result.ok) {
    log.error('[inventory/products/:id GET] backend error', {
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

export async function PUT(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendFetch<unknown>(`/api/doctor/inventory/products/${id}`, {
    method: 'PUT',
    body,
  });

  if (!result.ok) {
    log.error('[inventory/products/:id PUT] backend error', {
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

export async function DELETE(_req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendFetch<unknown>(`/api/doctor/inventory/products/${id}`, {
    method: 'DELETE',
  });

  if (!result.ok) {
    log.error('[inventory/products/:id DELETE] backend error', {
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
