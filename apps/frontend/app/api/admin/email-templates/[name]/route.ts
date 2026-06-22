/**
 * /api/admin/email-templates/[name] — detalle y actualización de una plantilla (super_admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `email-templates`.
 *   GET → `GET /api/admin/email-templates/:name` — plantilla completa con html y text.
 *   PUT → `PUT /api/admin/email-templates/:name` — actualización parcial de subject/html/text/is_active.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';

export interface EmailTemplateDetailDto {
  name: string;
  subject: string;
  html: string;
  text: string | null;
  description: string;
  isActive: boolean;
  updatedAt: string;
}

function fail(error: { message: string; status: number }) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { name } = await params;
  if (!name) {
    return NextResponse.json({ error: 'Nombre de plantilla requerido' }, { status: 400 });
  }

  const result = await backendGet<EmailTemplateDetailDto>(
    `/api/admin/email-templates/${encodeURIComponent(name)}`,
  );
  if (!result.ok) return fail(result.error);

  return NextResponse.json({ success: true, data: result.value });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { name } = await params;
  if (!name) {
    return NextResponse.json({ error: 'Nombre de plantilla requerido' }, { status: 400 });
  }

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  const update: Record<string, unknown> = {};

  if (typeof obj.subject === 'string') {
    const trimmed = obj.subject.trim();
    if (trimmed.length < 1 || trimmed.length > 300) {
      return NextResponse.json(
        { error: 'El subject debe tener entre 1 y 300 caracteres' },
        { status: 400 },
      );
    }
    update.subject = trimmed;
  }

  if (typeof obj.html === 'string') {
    if (obj.html.trim().length < 1) {
      return NextResponse.json(
        { error: 'El contenido HTML no puede estar vacío' },
        { status: 400 },
      );
    }
    update.html = obj.html;
  }

  if ('text' in obj) {
    update.text = typeof obj.text === 'string' ? obj.text : null;
  }

  if (typeof obj.is_active === 'boolean') {
    update.is_active = obj.is_active;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Ningún campo editable provisto' }, { status: 400 });
  }

  const result = await backendPut<EmailTemplateDetailDto>(
    `/api/admin/email-templates/${encodeURIComponent(name)}`,
    update,
  );
  if (!result.ok) return fail(result.error);

  return NextResponse.json({ success: true, data: result.value });
}
