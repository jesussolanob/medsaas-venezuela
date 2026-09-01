import 'server-only';

/**
 * app/api/doctor/consultations/[id]/approve-payment/route.ts
 *
 * Thin-proxy → NestJS PATCH /api/consultations/:id/approve-payment
 *
 * Body forwarded: { extras: Array<{ description: string; amount_usd: number }>, method?: string }
 *
 * The backend replaces extra_items for the consultation and persists:
 *   consultations.amount = base_amount + Σ(extras.amount_usd)
 *   consultations.payment_status = 'approved'
 *
 * Returns: { success: true, data: <updated consultation> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPatch } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { extras, product_extras, method } = body as {
    extras?: Array<{ description: string; amount_usd: number }>;
    product_extras?: Array<{ product_id: string; quantity: number }>;
    method?: string;
  };

  const backendBody: Record<string, unknown> = {
    extras: Array.isArray(extras) ? extras : [],
    product_extras: Array.isArray(product_extras) ? product_extras : [],
  };
  if (method) backendBody.method = method;

  const result = await backendPatch<Record<string, unknown>>(
    `/api/consultations/${id}/approve-payment`,
    backendBody,
  );

  if (!result.ok) {
    log.error('[approve-payment PATCH] backend error', {
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
