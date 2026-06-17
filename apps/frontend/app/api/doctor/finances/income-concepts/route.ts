/**
 * /api/doctor/finances/income-concepts — gestión de conceptos de ingreso.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `finances`.
 *
 * Backend:
 *   GET    /api/finances/income-concepts         → [{ id, name, isActive, sortOrder }]
 *   POST   /api/finances/income-concepts         body { name }
 *   PUT    /api/finances/income-concepts/:id     body { name?, isActive?, sortOrder? }
 *   DELETE /api/finances/income-concepts/:id     → 204
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';

export interface IncomeConcept {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

// GET — list income concepts for the authenticated doctor
export async function GET() {
  const result = await backendGet<IncomeConcept[]>('/api/finances/income-concepts');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  const data = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ success: true, data });
}

// POST — create a new income concept
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name } = body ?? {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Nombre del concepto requerido' }, { status: 400 });
  }

  const result = await backendPost<IncomeConcept>('/api/finances/income-concepts', {
    name: name.trim(),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
