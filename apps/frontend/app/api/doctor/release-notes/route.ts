/**
 * GET /api/doctor/release-notes
 *
 * Thin-proxy → NestJS GET /api/doctor/release-notes
 * Returns the history of all published notes for the doctor's plan.
 * Ordered newest first, limit 50.
 * Used in Ayuda → "Novedades".
 *
 * Backend response shape: { success: true, data: ReleaseNoteItem[] }
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';
import type { ReleaseNoteItem } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendGet<ReleaseNoteItem[]>('/api/doctor/release-notes');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
