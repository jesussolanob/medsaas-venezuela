/**
 * app/api/admin/packages/route.ts — STUB (sin Supabase)
 *
 * Módulo package_templates: no tiene backend NestJS todavía.
 *
 * Estado actual:
 *   GET  → devuelve [] (lista vacía)
 *   POST, PATCH, DELETE → 501 Not Implemented
 *
 * FASE futura (Etapa 2): implementar en NestJS:
 *   GET    /api/admin/package-templates
 *   POST   /api/admin/package-templates
 *   PATCH  /api/admin/package-templates/:id
 *   DELETE /api/admin/package-templates/:id
 * y conectar este thin-proxy con backendGet/backendPost de @/lib/api-client.server.
 *
 * Nota: la tabla package_templates en Supabase sigue existiendo; la migración
 * al backend se hará cuando el módulo se active en el MVP.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';

// GET /api/admin/packages — lista vacía hasta que exista el backend
export async function GET() {
  const guard = await requireRole(['super_admin', 'doctor']);
  if (!guard.ok) return guard.response;
  return NextResponse.json({ data: [] });
}

// POST /api/admin/packages — 501 pendiente backend
export async function POST() {
  const guard = await requireRole(['super_admin', 'doctor']);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { error: 'Creación de plantillas de paquete disponible en Etapa 2 (pendiente backend NestJS)' },
    { status: 501 },
  );
}

// PATCH /api/admin/packages — 501 pendiente backend
export async function PATCH() {
  const guard = await requireRole(['super_admin', 'doctor']);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { error: 'Actualización de plantillas de paquete disponible en Etapa 2 (pendiente backend NestJS)' },
    { status: 501 },
  );
}

// DELETE /api/admin/packages — 501 pendiente backend
export async function DELETE() {
  const guard = await requireRole(['super_admin', 'doctor']);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { error: 'Eliminación de plantillas de paquete disponible en Etapa 2 (pendiente backend NestJS)' },
    { status: 501 },
  );
}
