/**
 * GET /api/admin/export-subscriptions — CSV de doctores con su snapshot de suscripción.
 *
 * ETAPA 1 — la capa de datos viene del backend NestJS (admin doctors list, basado en
 * profiles). El CSV es pura serialización en esta capa. RBAC (super_admin) lo enforce
 * el backend al reenviar el rol. Sin Supabase.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

interface DoctorRow {
  id: string;
  fullName: string;
  email: string;
  specialty: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: string | null;
}

function csvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export async function GET() {
  const result = await backendGet<DoctorRow[]>('/api/admin/doctors?limit=100');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const rows = Array.isArray(result.value) ? result.value : [];
  const csv = [
    ['id', 'full_name', 'email', 'specialty', 'plan', 'status', 'expires_at'].join(','),
    ...rows.map((d) =>
      [
        d.id,
        d.fullName,
        d.email,
        d.specialty ?? '',
        d.subscriptionPlan ?? 'trial',
        d.subscriptionStatus ?? 'active',
        d.subscriptionExpiresAt ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=doctors-${Date.now()}.csv`,
    },
  });
}
