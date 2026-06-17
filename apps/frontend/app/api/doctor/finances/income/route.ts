/**
 * /api/doctor/finances/income — registrar ingreso manual (extraordinario).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `finances`.
 *
 * Backend:
 *   POST /api/finances/income  body { amount, currency?, description, conceptId?, date? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

interface IncomeTransaction {
  id: string;
  type: 'income';
  amount: number;
  currency: string;
  description: string;
  conceptId: string | null;
  date: string;
  createdAt: string;
}

// POST — record a manual extraordinary income entry
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, description } = body ?? {};

  if (!amount || !description) {
    return NextResponse.json({ error: 'Campos requeridos: amount, description' }, { status: 400 });
  }

  const payload: {
    amount: number;
    currency: string;
    description: string;
    conceptId?: string;
    date?: string;
  } = {
    amount: Number(amount),
    currency: body.currency || 'USD',
    description: String(description).trim(),
  };

  if (body.conceptId) payload.conceptId = String(body.conceptId);
  if (body.date) payload.date = String(body.date);

  const result = await backendPost<IncomeTransaction>('/api/finances/income', payload);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
