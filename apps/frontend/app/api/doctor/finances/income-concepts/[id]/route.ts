/**
 * /api/doctor/finances/income-concepts/[id] — editar y eliminar conceptos de ingreso.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `finances`.
 *
 * Backend:
 *   PUT    /api/finances/income-concepts/:id  body { name?, isActive?, sortOrder? }
 *   DELETE /api/finances/income-concepts/:id  → 204
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut, backendDelete } from '@/lib/api-client.server';

interface IncomeConcept {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

// PUT — update an income concept by id
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const patch: { name?: string; isActive?: boolean; sortOrder?: number } = {};
  if (typeof body?.name === 'string') patch.name = body.name.trim();
  if (typeof body?.isActive === 'boolean') patch.isActive = body.isActive;
  if (typeof body?.sortOrder === 'number') patch.sortOrder = body.sortOrder;

  const result = await backendPut<IncomeConcept>(`/api/finances/income-concepts/${id}`, patch);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}

// DELETE — remove an income concept by id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await backendDelete<void>(`/api/finances/income-concepts/${id}`);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
