/**
 * POST /api/telemetry/session — thin-proxy al módulo NestJS Telemetry.
 *
 * Forwards session telemetry events from the BFF to the NestJS backend.
 * Auth: role=doctor (the backend's RolesGuard enforces ownership).
 *
 * Handles both JSON fetch and navigator.sendBeacon (Blob/text body).
 * Responds 200 immediately (fire-and-forget from the client's perspective).
 *
 * Backend contract:
 *   POST /api/telemetry/session
 *   Body: { session_id: string, events: TelemetryEvent[], ended?: boolean }
 *   Response: { success, data: { session_id, appended, rejected, event_count } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface TelemetryEvent {
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
}

interface TelemetrySessionBody {
  session_id: string;
  events: TelemetryEvent[];
  ended?: boolean;
}

interface BackendTelemetryResponse {
  session_id: string;
  appended: number;
  rejected: number;
  event_count: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  // navigator.sendBeacon sends the body as text/plain (Blob); req.json() throws
  // in that case. Parse robustly: try JSON first, fallback to text + JSON.parse.
  let body: TelemetrySessionBody;
  try {
    body = (await req.json()) as TelemetrySessionBody;
  } catch {
    try {
      const text = await req.text();
      body = JSON.parse(text) as TelemetrySessionBody;
    } catch {
      // Malformed payload — respond 200 to avoid retries from sendBeacon.
      return NextResponse.json({ success: true }, { status: 200 });
    }
  }

  if (!body.session_id || !Array.isArray(body.events)) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // Fire-and-forget: forward to backend but do not block the response on it.
  // If the backend is unavailable, telemetry is silently dropped (acceptable).
  void backendPost<BackendTelemetryResponse>('/api/telemetry/session', body).catch(() => {
    // Intentionally swallowed: telemetry loss is acceptable; never surface
    // backend errors to the client or crash the BFF layer.
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
