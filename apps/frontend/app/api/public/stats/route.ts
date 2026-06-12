/**
 * GET /api/public/stats  (PÚBLICO, sin auth)
 * Conteos agregados para el contador de la landing (especialistas + pacientes).
 * Thin-proxy al backend NestJS `GET /api/public/stats`. NUNCA PII — solo conteos.
 * Degrada a ceros si el backend no responde (la landing conserva su valor estático).
 */
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function GET() {
  try {
    const r = await fetch(`${BACKEND_URL}/api/public/stats`, { cache: 'no-store' });
    const j = (await r.json()) as {
      success?: boolean;
      data?: { specialists: number; patients: number };
    };
    if (!r.ok || !j?.success || !j.data) {
      return NextResponse.json({ specialists: 0, patients: 0 });
    }
    return NextResponse.json(j.data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json({ specialists: 0, patients: 0 });
  }
}
