/**
 * GET /api/legal/terms
 *
 * Thin-proxy al backend `GET /api/legal/terms` (público, sin auth).
 * Devuelve { success: true, data: { contentHtml, version, updatedAt } }.
 * Si el backend falla, degrada silencioso con valores vacíos para que la UI
 * siempre tenga un shape válido y no rompa el formulario/modal.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

interface TermsData {
  contentHtml: string;
  version: string;
  updatedAt: string;
}

const EMPTY_TERMS: TermsData = {
  contentHtml: '',
  version: '',
  updatedAt: '',
};

export async function GET(): Promise<NextResponse> {
  try {
    const r = await fetch(`${BACKEND_URL}/api/legal/terms`, {
      cache: 'no-store',
    });

    const json = (await r.json()) as {
      success?: boolean;
      data?: Partial<TermsData>;
    };

    if (!r.ok || !json?.success || !json.data) {
      return NextResponse.json({ success: true, data: EMPTY_TERMS });
    }

    const data: TermsData = {
      contentHtml: json.data.contentHtml ?? '',
      version: json.data.version ?? '',
      updatedAt: json.data.updatedAt ?? '',
    };

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: true, data: EMPTY_TERMS });
  }
}
