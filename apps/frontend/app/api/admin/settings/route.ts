/**
 * /api/admin/settings — ajustes de plataforma (clave/valor genéricos).
 *
 * GET  → proxy a GET /api/admin/settings del backend (secretos ya filtrados).
 *         Respuesta del backend: { success: true, data: AppSetting[] }
 *         AppSetting = { key: string, value: string, updatedAt: string }
 *
 * PUT  → proxy a PUT /api/admin/settings del backend.
 *         Body: { key: string (max 200), value: string | number }
 *
 * Solo super_admin. Thin-proxy: RBAC en el BFF + reenvío al backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet, backendPut } from '@/lib/api-client.server';

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<AppSetting[]>('/api/admin/settings');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body debe ser un objeto JSON' }, { status: 400 });
  }

  const { key, value } = body as Record<string, unknown>;

  if (typeof key !== 'string' || key.trim().length === 0) {
    return NextResponse.json(
      { error: 'El campo "key" es requerido y debe ser texto' },
      { status: 400 },
    );
  }

  if (key.length > 200) {
    return NextResponse.json(
      { error: 'La clave no puede superar los 200 caracteres' },
      { status: 400 },
    );
  }

  if (value === undefined || value === null) {
    return NextResponse.json({ error: 'El campo "value" es requerido' }, { status: 400 });
  }

  const result = await backendPut<AppSetting>('/api/admin/settings', { key, value });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
