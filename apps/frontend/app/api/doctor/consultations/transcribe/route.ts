/**
 * POST /api/doctor/consultations/transcribe
 *
 * Recibe un audio (FormData con campo 'audio'), lo transcribe con Gemini 2.5 Flash
 * y opcionalmente lo asigna a un bloque clínico específico.
 *
 * Inspirado en las "minutas" automáticas de Google Meet/Calendar:
 * el doctor graba la consulta en vivo y el sistema le devuelve el texto
 * transcrito + (opcional) sugerencia de cómo distribuirlo en los bloques.
 *
 * Setup:
 *   - GEMINI_API_KEY en Vercel env vars (compartida con /api/doctor/ai)
 *   - Soporta audio/webm, audio/mp4, audio/mpeg, audio/wav, audio/m4a
 *   - Limite del payload: 20 MB inline (≈ 30-40 min en webm comprimido)
 *
 * Response:
 *   { ok: true, transcript: string, suggestion?: { block_key: string; content: string }[] }
 *   { ok: false, error: string }
 *
 * FASE 5/6: pendiente backend — Gemini AI transcription not yet implemented in
 * NestJS. This handler calls the Gemini API directly (no Supabase dependency).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { reportError } from '@/lib/report-error';

// 2026-05-02: el modelo flash con audio es 2.5-flash. lite no soporta audio aún.
const GEMINI_MODEL = process.env.GEMINI_AUDIO_MODEL || 'gemini-2.5-flash';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIMES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
]);

export async function POST(req: NextRequest) {
  const guard = await requireRole(['doctor', 'super_admin']);
  if (!guard.ok) return guard.response;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY no configurada' },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'FormData inválido' }, { status: 400 });
  }

  const audio = formData.get('audio') as File | null;
  if (!audio) {
    return NextResponse.json({ ok: false, error: 'Campo "audio" requerido' }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Audio demasiado grande (max ${MAX_BYTES / 1024 / 1024} MB). Graba en sesiones más cortas.`,
      },
      { status: 413 },
    );
  }

  // Normalizar mime type — algunos browsers mandan codecs=opus extra
  const rawMime = audio.type || 'audio/webm';
  const mime = rawMime.split(';')[0].trim();
  if (!ALLOWED_MIMES.has(rawMime) && !ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { ok: false, error: `Formato no soportado: ${rawMime}` },
      { status: 415 },
    );
  }

  // Convertir a base64
  const buffer = Buffer.from(await audio.arrayBuffer());
  const base64 = buffer.toString('base64');

  // Lista de bloques disponibles (opcional)
  const availableBlocksRaw = formData.get('available_blocks') as string | null;
  let availableBlocks: { key: string; label: string }[] = [];
  try {
    if (availableBlocksRaw) {
      const parsed = JSON.parse(availableBlocksRaw);
      if (Array.isArray(parsed)) availableBlocks = parsed.slice(0, 20);
    }
  } catch {
    /* ignore */
  }

  const language = (formData.get('language') as string | null) || 'es-VE';

  const blocksHint =
    availableBlocks.length > 0
      ? `\n\nLos bloques disponibles en la plantilla del doctor son:\n${availableBlocks
          .map((b) => `  • "${b.key}" → ${b.label}`)
          .join('\n')}\n\nDespués de la transcripción, sugiere cómo distribuir el contenido entre estos bloques. Devuelve un JSON al final del mensaje con la siguiente estructura EXACTA:\n\`\`\`json\n{ "suggestions": [ { "block_key": "chief_complaint", "content": "..." }, ... ] }\n\`\`\``
      : '';

  const prompt = `Eres un asistente médico profesional. Vas a recibir el AUDIO de una consulta médica grabada por un especialista en Venezuela.

Tu trabajo:
1. Transcribir el audio palabra por palabra en español (Venezuela), preservando el contexto clínico.
2. Limpiar muletillas obvias ("eh", "umm", "este") pero NO inventar contenido que no esté en el audio.
3. Si hay términos médicos que no entiendes claramente, transcríbelos fonéticamente y agrega "[?]".
4. Identificar quién habla cuando sea claro (DOCTOR: / PACIENTE:) si hay diálogo.${blocksHint}

Idioma del audio: ${language}.

Devuelve PRIMERO la transcripción completa en texto plano (sin markdown). Si te pidieron sugerencias de bloques, después de la transcripción devuelve el bloque JSON marcado con \`\`\`json y \`\`\`.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      reportError('api/transcribe', 'POST:gemini', new Error(`Gemini ${res.status}`), { status: res.status, excerpt: errText.slice(0, 200) });
      return NextResponse.json(
        { ok: false, error: `Error del servicio de transcripción (${res.status})` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const fullText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!fullText) {
      return NextResponse.json(
        { ok: false, error: 'Gemini retornó respuesta vacía' },
        { status: 500 },
      );
    }

    let suggestions: { block_key: string; content: string }[] = [];
    let transcript = fullText;
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      transcript = fullText.replace(jsonMatch[0], '').trim();
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed?.suggestions)) {
          suggestions = parsed.suggestions
            .filter(
              (s: unknown): s is { block_key: string; content: string } =>
                s !== null &&
                typeof s === 'object' &&
                typeof (s as Record<string, unknown>).block_key === 'string' &&
                typeof (s as Record<string, unknown>).content === 'string',
            )
            .map((s: { block_key: string; content: string }) => ({
              block_key: s.block_key,
              content: s.content,
            }));
        }
      } catch (e) {
        console.warn('[transcribe] no pude parsear JSON de sugerencias:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      transcript,
      suggestions,
      meta: {
        bytes: audio.size,
        mime,
        model: GEMINI_MODEL,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error de red al transcribir';
    reportError('api/transcribe', 'POST', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
