/**
 * POST /api/doctor/ai
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * AI/Gemini integration requires the NestJS AI module (rate limiting via backend
 * ai_request_log, prompt building, Gemini API key management). Implementing this
 * entirely on the backend is deferred to Etapa 2.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 *
 * Plan gating: requiere feature `ai_assistant`. super_admin bypasa el gating.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { hasPlanFeature } from '@/lib/plan-gate.server';

export async function POST(): Promise<NextResponse> {
  const guard = await requireRole(['doctor', 'super_admin']);
  if (!guard.ok) return guard.response;

  // super_admin bypasa el gating de plan.
  if (guard.profile.role !== 'super_admin') {
    const allowed = await hasPlanFeature('ai_assistant');
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Tu plan no incluye el Asistente IA',
          code: 'PLAN_FEATURE_REQUIRED',
        },
        { status: 403 },
      );
    }
  }

  // TODO: gatear summarize_report por ai_reports cuando se implemente el módulo /ai real.
  return NextResponse.json(
    { error: 'IA disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
