/**
 * POST /api/doctor/ai
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * AI/Gemini integration requires the NestJS AI module (rate limiting via backend
 * ai_request_log, prompt building, Gemini API key management). Implementing this
 * entirely on the backend is deferred to Etapa 2.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'IA disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
