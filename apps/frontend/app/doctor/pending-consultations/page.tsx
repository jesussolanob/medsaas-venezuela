/**
 * app/doctor/pending-consultations/page.tsx
 *
 * Server Component shell — kicks off data loading and renders the client list.
 * The BFF route handler at /api/doctor/pending-consultations proxies to the
 * backend and enriches items with patient_name.
 */

import PendingConsultationsClient from './PendingConsultationsClient';

export const dynamic = 'force-dynamic';

export default function PendingConsultationsPage() {
  // Data is fetched client-side in PendingConsultationsClient to support
  // interactive filtering and real-time refresh after schedule / cancel actions.
  return <PendingConsultationsClient />;
}
