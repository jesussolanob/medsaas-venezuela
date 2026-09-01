/**
 * app/doctor/quotes/page.tsx
 *
 * Server component — fetches the initial quotes list and hands it to the client.
 * Plan gate: only delta_plus / free_trial can reach this route (enforced by
 * the layout's PLAN_GATED_ROUTES check — not duplicated here).
 */

import { getQuotes } from './actions';
import QuotesListClient from './QuotesListClient';

export const metadata = { title: 'Cotizaciones | Delta Salud' };

export default async function QuotesPage() {
  const result = await getQuotes({ page: 1, limit: 20 });

  return (
    <QuotesListClient
      initialQuotes={result.quotes}
      initialTotal={result.total}
      fetchError={result.error}
    />
  );
}
