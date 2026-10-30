/**
 * POST /api/doctor/release-notes/seen
 *
 * Thin-proxy → NestJS POST /api/doctor/release-notes/seen
 * Sets profiles.release_notes_seen_at = now() (server time).
 * Called when the doctor closes the "Novedades" modal with "Entendido".
 *
 * Backend response shape: { success: true, data: { seenAt: string } }
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendPost<{ seenAt: string }>('/api/doctor/release-notes/seen', {});
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
