/**
 * GET /r/meeting?t=<token>
 *
 * Public invitation-click tracking handler (Phase 4 — retention plan).
 *
 * Flow:
 *   1. Read the `t` query param (HMAC token from the email).
 *   2. Fire-and-forget: POST /api/public/retention/click { t } to the backend.
 *      Failures are silently ignored — the redirect must ALWAYS happen.
 *   3. Redirect (302) to /doctor?from=meeting_invite.
 *
 * Security:
 *   - No authentication required (public route; not in the proxy.ts matcher).
 *   - Destination is a constant path — not an open redirect.
 *   - Token max length guard (512 chars) prevents oversized payloads.
 *   - The token itself is opaque; HMAC verification happens in the backend use case.
 *
 * Login round-trip:
 *   If the specialist is not authenticated, proxy.ts will intercept /doctor and
 *   redirect them to /login?next=/doctor?from=meeting_invite (query string preserved
 *   by the updated handleDevMode). After login the browser is sent back to
 *   /doctor?from=meeting_invite, which triggers the meeting modal (spec F).
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

/** Maximum token length accepted. Tokens are compact JWTs or HMAC hex strings. */
const MAX_TOKEN_LEN = 512;

/** The constant destination after tracking; never interpolated from user input. */
const DESTINATION = '/doctor?from=meeting_invite';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = req.nextUrl.searchParams.get('t') ?? '';

  // Fire-and-forget click tracking — backend always returns 204 (even for bad tokens).
  // We never block or reveal errors to the visitor; the important thing is the redirect.
  if (t.length > 0 && t.length <= MAX_TOKEN_LEN) {
    void fetch(`${BACKEND_URL}/api/public/retention/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t }),
      // No dev-auth headers: this is a truly anonymous public endpoint.
    }).catch(() => {
      // Intentionally swallowed — click tracking is best-effort.
    });
  }

  return NextResponse.redirect(new URL(DESTINATION, req.url), 302);
}
