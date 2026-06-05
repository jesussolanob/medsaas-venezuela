import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

// GET /api/admin/doctors — List all doctors with their subscriptions (super_admin only)
// Proxied to NestJS GET /api/admin/doctors
export async function GET() {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return guard.response;

    const result = await backendGet<{
      id: string;
      fullName: string;
      email: string;
      specialty: string | null;
      subscriptionStatus: string;
      subscriptionPlan: string;
      subscriptionExpiresAt: string | null;
      activityStatus: string;
    }[]>('/api/admin/doctors?limit=1000');

    if (!result.ok) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.status || 500 });
    }

    // Normalize camelCase → snake_case + legacy fields expected by frontend consumers
    const enriched = result.value.map((d) => ({
      id: d.id,
      full_name: d.fullName,
      email: d.email,
      specialty: d.specialty,
      subscription_status: d.subscriptionStatus,
      plan: d.subscriptionPlan,
      subscription_expires_at: d.subscriptionExpiresAt,
      is_active: d.activityStatus !== 'inactive',
      // last_sign_in_at is not tracked until Auth0 (Etapa 2)
      last_sign_in_at: null,
      created_at: null,
    }));

    return NextResponse.json(enriched);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
