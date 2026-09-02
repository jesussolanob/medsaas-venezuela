/**
 * app/quotes/[token]/page.tsx
 *
 * PUBLIC view — no auth required.
 * Fetches the quote from the public backend endpoint and renders it for the recipient.
 *
 * The token is the quote UUID (or a dedicated share_token if the backend uses one).
 * Backend endpoint: GET /api/quotes/:token  (no auth headers — public controller).
 */

import { notFound } from 'next/navigation';
import React from 'react';
import PublicQuoteClient from './PublicQuoteClient';

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types matching the public quotes controller response
// ---------------------------------------------------------------------------

interface PublicQuoteItem {
  id: string;
  kind: 'service' | 'product';
  name: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  amountUsd: number;
  sortOrder: number;
}

interface PublicQuoteDoctor {
  fullName: string;
  professionalTitle: string | null;
  specialty: string | null;
}

interface PublicQuoteTemplateConfig {
  headerText: string | null;
  footerText: string | null;
  primaryColor: string | null;
  showLogo: boolean;
  showSignature: boolean;
  logoUrl: string | null;
  signatureUrl: string | null;
}

export interface PublicQuoteData {
  quoteNumber: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  /** YYYY-MM-DD or null */
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
  items: PublicQuoteItem[];
  doctor: PublicQuoteDoctor;
  templateConfig: PublicQuoteTemplateConfig | null;
}

interface Props {
  params: Promise<{ token: string }>;
}

export const metadata = { title: 'Cotización | Delta Salud' };

export const dynamic = 'force-dynamic';

export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params;

  let quoteData: PublicQuoteData | null = null;
  let fetchError: string | null = null;

  const res = await fetch(`${BACKEND_URL}/api/quotes/${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
  }).catch(() => null);

  if (!res) {
    fetchError = 'Error de conexión. Intentá de nuevo.';
  } else if (res.status === 404) {
    notFound();
  } else if (res.status === 410) {
    fetchError =
      'Este enlace ya no está disponible. El presupuesto venció o fue retirado. Solicitale uno nuevo al especialista.';
  } else if (!res.ok) {
    fetchError = 'No se pudo cargar la cotización. Intentá de nuevo.';
  } else {
    const envelope = (await res.json().catch(() => null)) as {
      success: boolean;
      data: PublicQuoteData;
    } | null;
    quoteData = envelope?.data ?? null;
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center">
          <p className="text-slate-500">{fetchError}</p>
        </div>
      </div>
    );
  }

  if (!quoteData) {
    notFound();
  }

  return <PublicQuoteClient token={token} quote={quoteData} />;
}
