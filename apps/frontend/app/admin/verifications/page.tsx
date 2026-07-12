/**
 * /admin/verifications — Panel de verificaciones de médicos.
 *
 * Server Component: carga la lista inicial de médicos (todos los estados) desde
 * el backend y la pasa al VerificationsClient para interactividad.
 *
 * Auth: super_admin (el backend enforza el RBAC).
 */

import { backendGet } from '@/lib/api-client.server';
import VerificationsClient, { type VerificationItem } from './VerificationsClient';

export const metadata = {
  title: 'Verificaciones — Delta Salud',
};

// Revalidate every 60 s so the page reflects new registrations without a full reload.
export const revalidate = 60;

export default async function VerificationsPage() {
  // The backend requires a status filter, so load the three states in parallel
  // and merge them; the client tabs between them. Server components must pass the
  // super_admin role override for the backend RBAC.
  const statuses = ['pending', 'verified', 'rejected'] as const;
  const results = await Promise.all(
    statuses.map((status) =>
      backendGet<VerificationItem[]>(`/api/admin/doctor-verifications?status=${status}&limit=100`, {
        role: 'super_admin',
      }),
    ),
  );

  const items: VerificationItem[] = results.flatMap((r) => (r.ok ? (r.value ?? []) : []));

  return <VerificationsClient initialItems={items} />;
}
