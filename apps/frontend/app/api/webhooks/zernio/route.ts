/**
 * POST /api/webhooks/zernio
 *
 * Public thin-proxy → NestJS POST /api/webhooks/zernio
 *
 * WHY THIS EXISTS:
 *   The NestJS backend on Cloud Run is NOT publicly accessible (IAM-protected).
 *   Zernio cannot call it directly and gets a 403 from Google before reaching Nest.
 *   This Next.js route is on the public frontend (deltasalud.app / staging.deltasalud.app)
 *   which IS publicly reachable, so we proxy the payload byte-identical to the backend.
 *
 * SECURITY:
 *   - Signature verification is in the NestJS controller (HMAC-SHA256 of the raw body
 *     using ZERNIO_WEBHOOK_SECRET). The signature header is forwarded unchanged.
 *   - This proxy does NOT add any auth headers — the backend controller has no
 *     @UseGuards() on the webhook endpoint (signature IS the authentication).
 *   - Reading the raw body as text() ensures no JSON re-serialization, which would
 *     change the byte sequence and break the HMAC check.
 *
 * PII policy:
 *   - This route logs nothing — no body, no headers, no metadata.
 *   - Any logging happens inside the backend controller and use case.
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body as text to avoid any JSON re-serialization that would
  // break the HMAC-SHA256 signature check in the NestJS controller.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  // Forward byte-identical to the backend, passing through the Zernio signature.
  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/webhooks/zernio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the Zernio HMAC signature — the backend verifies it against the raw body.
        ...(req.headers.get('x-zernio-signature')
          ? { 'x-zernio-signature': req.headers.get('x-zernio-signature')! }
          : {}),
      },
      body: rawBody,
    });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
  }

  // Mirror the backend's status code. The body is always { success: true } on 200,
  // or an error envelope. Zernio retries on non-2xx responses.
  const responseBody = await backendRes.text();
  return new NextResponse(responseBody, {
    status: backendRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
