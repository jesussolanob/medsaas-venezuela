import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut, type AppError } from '@/lib/api-client.server';

function fail(error: AppError) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function GET() {
  const result = await backendGet<unknown>('/api/admin/role-capabilities');
  if (!result.ok) return fail(result.error);
  return NextResponse.json(result.value);
}

export async function PUT(req: NextRequest) {
  const body: unknown = await req.json();
  // Minimal shape guard before forwarding (the backend ValidationPipe is the source
  // of truth, but this bounds obviously-malformed payloads at the edge).
  const parsed = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;
  if (!parsed.role || !parsed.module_key || !parsed.action || typeof parsed.allowed !== 'boolean') {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }
  const result = await backendPut<unknown>('/api/admin/role-capabilities', parsed);
  if (!result.ok) return fail(result.error);
  return NextResponse.json(result.value);
}
