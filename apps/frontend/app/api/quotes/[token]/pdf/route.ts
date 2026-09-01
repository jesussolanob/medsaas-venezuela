/**
 * GET /api/quotes/[token]/pdf
 *
 * Server-side PDF generation for a public quote.
 * No auth required — uses the public quotes backend endpoint.
 *
 * IMPORTANT: @react-pdf/renderer does NOT reliably embed remote URLs server-side.
 * Logo and signature images must be pre-fetched as base64 data URIs using
 * imageUrlToDataUri() before being passed to QuotePdf.
 */

import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendPublicQuoteItem {
  id: string;
  kind: 'service' | 'product';
  name: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  amountUsd: number;
  sortOrder: number;
}

interface BackendPublicQuote {
  quoteNumber: string;
  status: string;
  validUntil: string | null;
  notes: string;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  bcvRate: number | null;
  totalBs: number | null;
  sentAt: string | null;
  /** Recipient name stored at send time. null if not provided. */
  recipient_name: string | null;
  items: BackendPublicQuoteItem[];
  doctor: {
    fullName: string;
    professionalTitle: string | null;
    specialty: string | null;
    logoUrl?: string | null;
    signatureUrl?: string | null;
  };
  templateConfig: {
    headerText: string | null;
    footerText: string | null;
    primaryColor: string | null;
    fontFamily: string | null;
    showLogo: boolean;
    showSignature: boolean;
    logoUrl: string | null;
    signatureUrl: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Image helper (same pattern as /api/documents/[token]/pdf/route.ts)
// ---------------------------------------------------------------------------

const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function imageUrlToDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_IMAGE_BYTES) return null;
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // 1. Fetch quote from public backend endpoint
  let quoteData: BackendPublicQuote;
  try {
    const res = await fetch(`${BACKEND_URL}/api/quotes/${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 404) {
      return NextResponse.json({ error: 'Cotización no encontrada.' }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'No se pudo obtener la cotización.' },
        { status: res.status },
      );
    }

    const envelope = (await res.json()) as { success: boolean; data: BackendPublicQuote };
    quoteData = envelope.data;
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con el servidor.' }, { status: 502 });
  }

  // 2. Resolve logo / signature as data URIs
  const tc = quoteData.templateConfig;
  const logoUrl = tc?.showLogo ? (tc.logoUrl ?? quoteData.doctor.logoUrl) : null;
  const signatureUrl = tc?.showSignature
    ? (tc.signatureUrl ?? quoteData.doctor.signatureUrl)
    : null;

  const [logoDataUri, signatureDataUri] = await Promise.all([
    imageUrlToDataUri(logoUrl),
    imageUrlToDataUri(signatureUrl),
  ]);

  // 3. Build template config for the PDF component (snake_case)
  const templateConfig = {
    header_text: tc?.headerText ?? quoteData.doctor.fullName ?? '',
    footer_text: tc?.footerText ?? '',
    primary_color: tc?.primaryColor ?? '#0891b2',
    font_family: tc?.fontFamily ?? 'Helvetica',
    // No fallback to the raw URL on purpose. imageUrlToDataUri enforces a
    // timeout, an image Content-Type check and a size cap; handing the raw URL
    // to @react-pdf would make it fetch the address again server-side with none
    // of those guards, turning a doctor-controlled logo_url into a request
    // against whatever the container can reach. A missing logo beats that.
    logo_url: logoDataUri ?? null,
    signature_url: signatureDataUri ?? null,
    show_logo: tc?.showLogo ?? true,
    show_signature: tc?.showSignature ?? true,
  };

  // 4. Render PDF server-side
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const QuotePdfModule = await import('@/components/pdf/QuotePdf');
    const QuotePdf = QuotePdfModule.default;

    const element = React.createElement(QuotePdf, {
      quoteNumber: quoteData.quoteNumber,
      status: quoteData.status,
      validUntil: quoteData.validUntil,
      notes: quoteData.notes,
      subtotal_usd: Number(quoteData.subtotalUsd),
      discount_usd: Number(quoteData.discountUsd),
      total_usd: Number(quoteData.totalUsd),
      bcv_rate: quoteData.bcvRate !== null ? Number(quoteData.bcvRate) : null,
      total_bs: quoteData.totalBs !== null ? Number(quoteData.totalBs) : null,
      created_at: quoteData.sentAt ?? new Date().toISOString(),
      recipientName: quoteData.recipient_name ?? '',
      items: quoteData.items.map((it) => ({
        kind: it.kind,
        name: it.name,
        description: it.description,
        quantity: Number(it.quantity),
        unit_price_usd: Number(it.unitPriceUsd),
        amount_usd: Number(it.amountUsd),
      })),
      doctor: {
        fullName: quoteData.doctor.fullName,
        specialty: quoteData.doctor.specialty,
        licenseNumber: null,
      },
      templateConfig,
    });

    const buffer = await renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);

    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );

    const safeNumber = quoteData.quoteNumber.replace(/[^\w-]/g, '');
    const filename = `Cotizacion-${safeNumber}.pdf`;

    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    // The raw error can carry internal addresses or network paths (a failed
    // image fetch surfaces as ECONNREFUSED 10.x.x.x). Log it, return a generic
    // message: this route is public and reachable without any credentials.
    log.error('[quotes/pdf] render failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'No se pudo generar el PDF.' }, { status: 500 });
  }
}
