/**
 * /api/doctor/consultation-blocks/[blockKey]/label
 *
 * Thin proxy to PATCH /api/doctor/consultation-blocks/:blockKey/label on the
 * NestJS backend. Persists a custom label for a single block belonging to the
 * authenticated doctor (doctorId derived server-side from the auth token).
 *
 * Body: { custom_label: string | null }
 *   string (trimmed, max 80) → set custom label
 *   null                     → restore catalog default label
 *
 * Error codes forwarded from backend:
 *   INVALID_BLOCK_KEY (400) — blockKey not in catalog
 *   LOCKED_BLOCK_KEY  (400) — blockKey is a system-locked block
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPatch } from '@/lib/api-client.server';

interface LabelResponse {
  blockKey: string;
  customLabel: string | null;
  /** Effective label shown to users: customLabel when set, else catalog default. */
  label: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ blockKey: string }> },
): Promise<NextResponse> {
  const { blockKey } = await params;

  // Guard: blockKey must be a valid block-key format before forwarding.
  if (!/^[a-z_]+$/.test(blockKey)) {
    return NextResponse.json({ error: 'blockKey inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  const result = await backendPatch<LabelResponse>(
    `/api/doctor/consultation-blocks/${encodeURIComponent(blockKey)}/label`,
    { custom_label: body?.custom_label ?? null },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(result.value);
}
