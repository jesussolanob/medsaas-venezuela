/**
 * app/doctor/inventory/page.tsx
 *
 * Server component — fetches initial product list and hands it to the client.
 * Plan gate: only delta_plus / free_trial (mirror of plus) can reach this route.
 * The layout's PLAN_GATED_ROUTES check covers access-by-URL; this page does not
 * duplicate that guard.
 */

import { getProducts } from './actions';
import InventoryClient from './InventoryClient';

export const metadata = { title: 'Inventario | Delta Salud' };

export default async function InventoryPage() {
  const { products } = await getProducts({ active: true, limit: 100 });

  return <InventoryClient initialProducts={products} />;
}
