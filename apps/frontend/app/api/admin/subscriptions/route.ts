/**
 * GET /api/admin/subscriptions
 * Lista de doctores con su estado de suscripción.
 * Proxied to NestJS GET /api/admin/subscriptions
 *
 * Query params (todos opcionales):
 *   ?filter=expiring | expired | trial | active | suspended
 *   ?search=<email o nombre>
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter');

  // Map legacy filter values to NestJS query params
  const params = new URLSearchParams();
  if (filter === 'active') params.set('status', 'active');
  else if (filter === 'suspended') params.set('status', 'suspended');
  else if (filter === 'trial') params.set('status', 'trial');
  // 'expired' and 'expiring' are not yet mapped in the NestJS backend (in-memory fields);
  // pass through without filter — frontend can filter client-side if needed.

  params.set('limit', '200');

  const result = await backendGet<BackendSubscription[]>(
    `/api/admin/subscriptions?${params.toString()}`,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status || 500 });
  }

  // El backend devuelve camelCase; la UI espera snake_case + campos derivados.
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;
  const doctors = result.value.map((s) => {
    const end = s.currentPeriodEnd ? new Date(s.currentPeriodEnd).getTime() : null;
    const daysRemaining = end !== null ? Math.ceil((end - now) / MS_PER_DAY) : 0;
    const isExpired = end !== null ? end < now : false;
    return {
      doctor_id: s.doctorId,
      doctor_name: s.doctorName,
      doctor_email: s.doctorEmail,
      specialty: null,
      plan: s.plan ?? null,
      status: s.status ?? null,
      current_period_end: s.currentPeriodEnd ?? null,
      days_remaining: daysRemaining,
      is_expired: isExpired,
      expiring_soon: !isExpired && daysRemaining <= 7,
      is_in_trial: s.status === 'trial',
    };
  });

  return NextResponse.json({ doctors });
}

interface BackendSubscription {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  plan: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
}
