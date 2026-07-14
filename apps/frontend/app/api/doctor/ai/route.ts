/**
 * POST /api/doctor/ai
 *
 * Thin-proxy → NestJS POST /api/ai/text.
 *
 * Reactiva las 3 funciones de IA de texto (era Supabase):
 *   - improve_block     → mejora la redacción de un bloque (gating `ai_assistant`)
 *   - summarize_report  → resume el informe completo (gating `ai_reports`)
 *   - patient_history   → resumen ejecutivo del historial (gating `ai_assistant`)
 *
 * El gating por plan + super_admin bypass se aplica EN EL BACKEND (resuelve el plan
 * efectivo). Aquí solo validamos rol y reenviamos. El frontend consume `data.result`.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireRole(['doctor', 'super_admin']);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  // El backend devuelve `{ result }` para las acciones de texto y `{ medications }`
  // para parse_prescription. Reenviamos AMBOS para no perder los medicamentos.
  const result = await backendPost<{ result?: string; medications?: unknown[] }>(
    '/api/ai/text',
    body,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  // callAI lee `data.result`; parseTextIntoRecipe/Dictar receta leen `data.medications`.
  return NextResponse.json({
    result: result.value?.result ?? '',
    medications: Array.isArray(result.value?.medications) ? result.value.medications : [],
  });
}
