/**
 * /api/doctor/finances/transactions/[id] — editar una transacción financiera.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `finances`.
 *
 * Backend:
 *   PUT /api/finances/transactions/:id
 *       body { description?, amount?, currency?, transactionDate?, conceptId? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';

interface TransactionItem {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  conceptId: string | null;
  date: string;
  createdAt: string;
}

// PUT — update a financial transaction by id
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const patch: {
    description?: string;
    amount?: number;
    currency?: string;
    transactionDate?: string;
    conceptId?: string | null;
  } = {};

  if (typeof body?.description === 'string') patch.description = body.description.trim();
  if (typeof body?.amount === 'number') patch.amount = body.amount;
  if (typeof body?.currency === 'string') patch.currency = body.currency;
  if (typeof body?.transactionDate === 'string') patch.transactionDate = body.transactionDate;
  if ('conceptId' in body) patch.conceptId = body.conceptId ?? null;

  const result = await backendPut<TransactionItem>(`/api/finances/transactions/${id}`, patch);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
