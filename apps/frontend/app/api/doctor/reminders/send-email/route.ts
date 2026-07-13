import 'server-only';

/**
 * POST /api/doctor/reminders/send-email
 *
 * Thin-proxy hacia el backend:
 *   POST /api/doctor/reminders/send-email
 *   Body: { appointment_id?: string, consultation_id?: string }
 *   Al menos uno de los dos IDs es requerido.
 *
 * Respuesta backend exitosa: { success: true, data: { sent: true } }
 * Errores backend:
 *   404 → cita/consulta no encontrada
 *   422 → paciente sin correo registrado (message en español)
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

interface SendEmailBody {
  appointment_id?: string;
  consultation_id?: string;
}

interface SendEmailResult {
  sent: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SendEmailBody;
  try {
    body = (await req.json()) as SendEmailBody;
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { appointment_id, consultation_id } = body ?? {};

  if (!appointment_id && !consultation_id) {
    return NextResponse.json(
      { error: 'Se requiere appointment_id o consultation_id' },
      { status: 400 },
    );
  }

  const payload: SendEmailBody = {};
  if (appointment_id) payload.appointment_id = appointment_id;
  if (consultation_id) payload.consultation_id = consultation_id;

  const result = await backendPost<SendEmailResult>('/api/doctor/reminders/send-email', payload);

  if (!result.ok) {
    log.error('[doctor/reminders/send-email POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
