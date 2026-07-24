/**
 * GET /api/legal/privacy
 *
 * Thin-proxy al backend `GET /api/legal/privacy` (público, sin auth).
 * Devuelve { success: true, data: { contentHtml, version, updatedAt } }.
 * Si el backend falla, degrada silencioso con valores vacíos para que la UI
 * (modal / página) siempre tenga un shape válido y no rompa.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

interface LegalData {
  contentHtml: string;
  version: string;
  updatedAt: string;
}

const EMPTY: LegalData = {
  contentHtml: '',
  version: '',
  updatedAt: '',
};

export async function GET(): Promise<NextResponse> {
  try {
    const r = await fetch(`${BACKEND_URL}/api/legal/privacy`, {
      cache: 'no-store',
    });

    const json = (await r.json()) as {
      success?: boolean;
      data?: Partial<LegalData>;
    };

    if (!r.ok || !json?.success || !json.data) {
      return NextResponse.json({ success: true, data: EMPTY });
    }

    const data: LegalData = {
      contentHtml: json.data.contentHtml ?? '',
      version: json.data.version ?? '',
      updatedAt: json.data.updatedAt ?? '',
    };

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: true, data: EMPTY });
  }
}
