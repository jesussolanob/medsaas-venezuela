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

  const result = await backendGet<unknown[]>(`/api/admin/subscriptions?${params.toString()}`);
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.status || 500 });
  }

  return NextResponse.json({ doctors: result.value });
}
