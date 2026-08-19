/**
 * POST /api/admin/mark-invoice-paid — marca una factura como pagada.
 * body: { invoiceId }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing` (invoices). markPaid es
 * idempotente en el backend. RBAC (super_admin) lo enforce el backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const { invoiceId } = await req.json();

  if (!invoiceId) {
    return NextResponse.json({ error: 'Falta el id de la factura' }, { status: 400 });
  }

  const result = await backendPut<unknown>(`/api/admin/invoices/${invoiceId}/paid`, {});

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, invoice: result.value });
}
