/**
 * GET /api/doctor/subscription-payments/checkout-info?planKey=<>&period=<>
 *
 * BFF thin-proxy. Returns pricing data, BCV rate, bank catalog, and payment
 * instructions for the selected plan and billing period.
 * The Bs amount and BCV rate are computed server-side — the frontend never
 * calculates or sends them.
 *
 * Response shape (from backend):
 *   { planName, planKey, period, amountUsd, amountBs, bcvRate, bcvRateDate,
 *     banks: [{ code, name }], paymentInstructions }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export interface CheckoutInfoResponse {
  planName: string;
  planKey: string;
  period: string;
  amountUsd: number;
  amountBs: number;
  bcvRate: number;
  bcvRateDate: string;
  banks: { code: string; name: string }[];
  paymentInstructions: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const planKey = searchParams.get('planKey') ?? '';
  const period = searchParams.get('period') ?? '';

  if (!planKey || !period) {
    return NextResponse.json({ error: 'planKey y period son obligatorios' }, { status: 400 });
  }

  const result = await backendGet<CheckoutInfoResponse>(
    `/api/doctor/subscription-payments/checkout-info?planKey=${encodeURIComponent(planKey)}&period=${encodeURIComponent(period)}`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json(result.value);
}
