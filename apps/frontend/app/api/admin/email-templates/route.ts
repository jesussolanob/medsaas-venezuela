/**
 * /api/admin/email-templates — listado de plantillas de correo (super_admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `email-templates`.
 *   GET → `GET /api/admin/email-templates` — lista todas las plantillas (resumen, sin html/text).
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';

export interface EmailTemplateSummaryDto {
  name: string;
  subject: string;
  description: string;
  isActive: boolean;
  updatedAt: string;
}

function fail(error: { message: string; status: number }) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<EmailTemplateSummaryDto[]>('/api/admin/email-templates');
  if (!result.ok) return fail(result.error);

  const rows = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ success: true, data: rows });
}
