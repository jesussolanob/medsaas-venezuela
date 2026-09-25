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
  const search = searchParams.get('search')?.trim();

  // Map legacy filter values to NestJS query params
  const params = new URLSearchParams();
  if (filter === 'active') params.set('status', 'active');
  else if (filter === 'suspended') params.set('status', 'suspended');
  // Profiles store 'trialing', not 'trial': asking for 'trial' returned nothing.
  else if (filter === 'trial') params.set('status', 'trialing');
  // 'expired' and 'expiring' depend on derived fields: filtered below.

  // The search used to be read by the page and dropped here, so the list never
  // filtered. The backend does the matching (name or email, accent-insensitive).
  if (search) params.set('search', search);

  // Backend caps at 100 per page.
  params.set('limit', '100');

  const result = await backendGet<BackendSubscription[]>(
    `/api/admin/subscriptions?${params.toString()}`,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
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
      is_in_trial: s.status === 'trial' || s.status === 'trialing',
    };
  });

  const visible =
    filter === 'expired'
      ? doctors.filter((d) => d.is_expired)
      : filter === 'expiring'
        ? doctors.filter((d) => d.expiring_soon)
        : doctors;

  return NextResponse.json({ doctors: visible });
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
