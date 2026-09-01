import 'server-only';

/**
 * app/api/doctor/inventory/products/route.ts
 *
 * Thin-proxy → NestJS inventory controller.
 *
 * GET  /api/doctor/inventory/products?search=&active=&page=&limit=
 * POST /api/doctor/inventory/products
 *
 * The backend resolves doctorId from the auth headers (anti-IDOR).
 * photo_path is converted to a signed URL by the backend on reads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { search } = req.nextUrl;
  const result = await backendFetch<unknown>(`/api/doctor/inventory/products${search}`, {
    method: 'GET',
  });

  if (!result.ok) {
    log.error('[inventory/products GET] backend error', {
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendFetch<unknown>('/api/doctor/inventory/products', {
    method: 'POST',
    body,
  });

  if (!result.ok) {
    log.error('[inventory/products POST] backend error', {
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
