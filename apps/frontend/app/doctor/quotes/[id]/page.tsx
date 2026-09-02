/**
 * app/doctor/quotes/[id]/page.tsx
 *
 * Server component — fetches a single quote and passes it to QuoteDetailClient.
 * Protected by the doctor layout's PLAN_GATED_ROUTES (moduleKey: 'quotes').
 */

import { notFound } from 'next/navigation';
import { getQuote } from '../actions';
import QuoteDetailClient from './QuoteDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'Detalle de cotización | Delta Salud' };

export default async function QuoteDetailPage({ params }: Props) {
  const { id } = await params;
  const quote = await getQuote(id);

  if (!quote) {
    notFound();
  }

  return <QuoteDetailClient initialQuote={quote} />;
}
