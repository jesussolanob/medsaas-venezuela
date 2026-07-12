import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet, backendPost } from '@/lib/api-client.server';

// GET /api/admin/doctors — List all doctors with their subscriptions (super_admin only)
// Proxied to NestJS GET /api/admin/doctors
export async function GET() {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return guard.response;

    const result = await backendGet<
      {
        id: string;
        fullName: string;
        email: string;
        specialty: string | null;
        subscriptionStatus: string;
        subscriptionPlan: string;
        subscriptionExpiresAt: string | null;
        activityStatus: string;
        /** Real last login timestamp from profiles.last_sign_in_at (null until Fase 4). */
        lastSignInAt: string | null;
        /** Doctor identity document — PII, admin-only context. */
        cedula: string | null;
      }[]
    >('/api/admin/doctors?limit=1000');

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message },
        { status: result.error.status || 500 },
      );
    }

    // Normalize camelCase → snake_case + legacy fields expected by frontend consumers.
    // lastSignInAt and cedula are now real values from the backend (no longer stubbed).
    const enriched = result.value.map((d) => ({
      id: d.id,
      full_name: d.fullName,
      email: d.email,
      specialty: d.specialty,
      subscription_status: d.subscriptionStatus,
      plan: d.subscriptionPlan,
      subscription_expires_at: d.subscriptionExpiresAt,
      is_active: d.activityStatus !== 'inactive',
      last_sign_in_at: d.lastSignInAt ?? null,
      cedula: d.cedula ?? null,
      created_at: null,
    }));

    return NextResponse.json(enriched);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/doctors — crea un nuevo médico desde el panel de admin.
 *
 * Proxied to NestJS POST /api/admin/doctors (super_admin only).
 *
 * Body esperado:
 *   {
 *     full_name:  string           (requerido)
 *     email:      string           (requerido, debe ser único)
 *     specialty?: string | null
 *     cedula?:    string | null    (formato canónico: "V-12345678")
 *     phone?:     string | null
 *     plan?:      'free_trial' | 'delta_free' | 'delta_base' | 'delta_plus'
 *                 Default: 'free_trial' (prueba de 30 días)
 *   }
 *
 * Returns 201 with { success: true, data: { id, fullName, email, plan, ... } }
 * Returns 409 when the email is already registered.
 * Returns 400 for validation errors (invalid plan key, missing required fields, etc.).
 */
export async function POST(req: Request) {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return guard.response;

    const body = await req.json();

    const result = await backendPost<unknown>('/api/admin/doctors', body);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message },
        { status: result.error.status || 500 },
      );
    }

    return NextResponse.json(result.value, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
