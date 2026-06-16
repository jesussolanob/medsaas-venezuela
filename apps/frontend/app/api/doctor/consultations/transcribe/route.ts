/**
 * POST /api/doctor/consultations/transcribe
 *
 * BFF multipart proxy — SERVER ONLY.
 *
 * Reenvía el audio de la consulta al módulo NestJS de transcripción
 * (POST /api/ai/transcribe). El backend hace TODO: valida el plan del doctor
 * (gating fail-closed de `ai_transcription`), sanitiza los bloques, llama a
 * Gemini con la API key (que vive SOLO en el backend) y audita en ai_request_log.
 *
 * Este handler ya NO llama a Gemini ni conoce la GEMINI_API_KEY: solo proxea.
 *
 * Request (multipart/form-data):
 *   audio            (required) File  — audio de la consulta
 *   available_blocks (optional) string JSON — [{ key, label }]
 *   language         (optional) string — 'es-VE' | 'es-ES' | 'en-US' | 'pt-BR'
 *
 * Response (contrato que espera ConsultationRecorder):
 *   { ok: true,  transcript: string, suggestions: { block_key, content }[] }
 *   { ok: false, error: string, code?: string }
 *
 * Identidad: resuelta por requireRole() (dev cookies o sesión Auth0). En prod,
 * el interceptor global de instrumentation.ts añade el token IAM + x-auth0-token
 * a los fetch dirigidos al backend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

interface BackendTranscribeData {
  transcript: string;
  suggestions: { block_key: string; content: string }[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth básica + identidad. El gating real de plan (fail-closed) lo hace el backend.
  const guard = await requireRole(['doctor', 'super_admin']);
  if (!guard.ok) return guard.response;

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Cuerpo inválido (multipart esperado)' },
      { status: 400 },
    );
  }

  const audio = incoming.get('audio');
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'Campo "audio" requerido' }, { status: 400 });
  }

  // Reconstruir el FormData para reenviar (preserva el nombre del archivo si existe).
  const outgoing = new FormData();
  outgoing.append('audio', audio, audio instanceof File ? audio.name : 'recording.webm');
  const availableBlocks = incoming.get('available_blocks');
  if (typeof availableBlocks === 'string') outgoing.append('available_blocks', availableBlocks);
  const language = incoming.get('language');
  if (typeof language === 'string') outgoing.append('language', language);

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/ai/transcribe`, {
      method: 'POST',
      headers: {
        // Dev mode: el backend usa estos headers. Prod (auth0): el interceptor
        // global añade x-auth0-token + token IAM; estos quedan inertes.
        'x-dev-user-id': guard.user.id,
        'x-dev-user-role': guard.profile.role,
        // NO setear Content-Type — fetch añade el boundary multipart correcto.
      },
      body: outgoing,
    });
  } catch (networkErr: unknown) {
    const message = networkErr instanceof Error ? networkErr.message : 'Error de red';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // El backend responde con el envelope estándar { success, data } | { success:false, code, message }.
  let json: { success?: boolean; data?: BackendTranscribeData; code?: string; message?: string };
  try {
    json = (await backendRes.json()) as typeof json;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Respuesta inválida del servicio de transcripción' },
      { status: 502 },
    );
  }

  if (!backendRes.ok || !json.success || !json.data) {
    return NextResponse.json(
      { ok: false, error: json.message ?? 'Error de transcripción', code: json.code },
      { status: backendRes.status || 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    transcript: json.data.transcript,
    suggestions: json.data.suggestions ?? [],
  });
}
