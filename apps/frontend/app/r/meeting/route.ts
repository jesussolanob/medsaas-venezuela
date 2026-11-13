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
 *   If the specialist is not signed in, the auth middleware on /doctor sends him to
 *   login. The modal does not depend on the query param: the backend shows it
 *   because an `email:meeting_invite_*` prompt exists for him (spec F); the param
 *   only gives it priority over release notes when it survives the round trip.
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

/** Maximum token length accepted. Tokens are compact JWTs or HMAC hex strings. */
const MAX_TOKEN_LEN = 512;

/** The constant destination after tracking; never interpolated from user input. */
const DESTINATION = '/doctor?from=meeting_invite';

export const dynamic = 'force-dynamic';

/** Upper bound for the tracking call: the redirect must never wait longer. */
const TRACKING_TIMEOUT_MS = 2000;

/**
 * Public origin for the redirect. Inside Cloud Run `req.url` resolves to
 * 0.0.0.0:8080, so APP_BASE_URL (set at runtime by the deploy) comes first —
 * same priority as the Google OAuth routes.
 */
function publicOrigin(req: NextRequest): string {
  const configured = (process.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  return /^https?:\/\//i.test(configured) ? configured : req.nextUrl.origin;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t = req.nextUrl.searchParams.get('t') ?? '';

  // Click tracking is AWAITED (bounded by a timeout): on Cloud Run the CPU is
  // throttled once the response is sent, so a fire-and-forget fetch may never
  // run. Errors are ignored — the backend answers 204 even for bad tokens and
  // the redirect must always happen.
  if (t.length > 0 && t.length <= MAX_TOKEN_LEN) {
    try {
      await fetch(`${BACKEND_URL}/api/public/retention/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t }),
        signal: AbortSignal.timeout(TRACKING_TIMEOUT_MS),
      });
    } catch {
      // Best-effort tracking: a timeout or network error must not block the visitor.
    }
  }

  return NextResponse.redirect(new URL(DESTINATION, publicOrigin(req)), 302);
}
