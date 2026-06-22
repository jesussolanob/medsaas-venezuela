/**
 * POST /api/help/chat
 *
 * Thin-proxy → NestJS POST /api/help/chat.
 *
 * Asistente de ayuda con IA (Gemini). El backend selecciona el MANUAL según el
 * rol del usuario autenticado (super_admin / doctor / patient) y responde SOLO
 * sobre el uso de la aplicación. No se persiste historial: el cliente envía toda
 * la conversación en cada llamada para mantener el contexto en la misma sesión.
 *
 * El frontend consume `data.reply`.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireRole(['doctor', 'super_admin', 'patient']);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendPost<{ reply: string }>('/api/help/chat', body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ reply: result.value?.reply ?? '' });
}
