import 'server-only';

/**
 * app/api/doctor/availability-blocks/route.ts
 *
 * Thin-proxy → NestJS availability-blocks module (Fase 5).
 *
 * GET  /api/doctor/availability-blocks?from=ISO&to=ISO
 *   → { success: true, data: AvailabilityBlock[] }
 *
 * POST /api/doctor/availability-blocks
 *   body: { starts_at: ISO8601, ends_at: ISO8601, reason?: string }
 *   → { success: true, data: AvailabilityBlock }
 *
 * doctorId siempre se resuelve del usuario autenticado en el backend (anti-IDOR).
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface AvailabilityBlock {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);

  const path = `/api/doctor/availability-blocks${qs.size > 0 ? `?${qs.toString()}` : ''}`;
  const result = await backendGet<AvailabilityBlock[]>(path);

  if (!result.ok) {
    log.error('[availability-blocks GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}

interface CreateBlockBody {
  starts_at: string;
  ends_at: string;
  reason?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateBlockBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (!body.starts_at || !body.ends_at) {
    return NextResponse.json({ error: 'starts_at y ends_at son requeridos' }, { status: 400 });
  }

  const result = await backendPost<AvailabilityBlock>('/api/doctor/availability-blocks', {
    starts_at: body.starts_at,
    ends_at: body.ends_at,
    reason: body.reason ?? null,
  });

  if (!result.ok) {
    log.error('[availability-blocks POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
