/**
 * POST /api/admin/invoices — crea una factura para un doctor.
 * body: { doctorId, amount, currency?, description? }
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing` (invoices). El backend genera el
 * número FAC-YYYYMMDD-XXXX y persiste. RBAC (super_admin) lo enforce el backend.
 *
 * GAP backend (Fase 5/mejora): no devuelve el join de `profiles` → doctor_name/email
 * salen como 'Unknown'. Diferido Fase 5: PDF de factura, envío por email.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

interface BackendInvoice {
  id: string;
  doctorId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export async function POST(req: NextRequest) {
  const { doctorId, amount, currency, description } = await req.json();

  if (!doctorId || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const result = await backendPost<BackendInvoice>('/api/admin/invoices', {
    doctor_id: doctorId,
    amount,
    currency: currency || 'USD',
    description: description || 'Pago de suscripción médica',
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const inv = result.value;
  const transformedInvoice = {
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    doctor_id: inv.doctorId,
    doctor_name: 'Unknown', // GAP: backend no joinea profiles
    doctor_email: 'unknown@example.com',
    amount: inv.amount,
    currency: inv.currency,
    description: inv.description,
    status: inv.status,
    issued_at: inv.issuedAt,
    sent_at: null,
    paid_at: inv.paidAt,
  };

  return NextResponse.json({ invoice: transformedInvoice });
}
