/**
 * GET /api/public/plans  (PÚBLICO, sin auth)
 *
 * Proxya el catálogo público de planes del backend (`GET /api/plans`, que NO
 * requiere autenticación) para que la landing pública pueda mostrar los 3 planes
 * vendibles (Free/Base/Plus) con precios + features, traídos de la BD.
 *
 * El BFF `/api/plans` existente proxya `/api/admin/plans` (super_admin) — por eso
 * daba "No autenticado" en la landing. Este endpoint usa el catálogo público.
 */
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

interface PublicPlan {
  plan_key: string;
  name: string;
  description?: string | null;
  prices: { period: string; price_usd: number }[];
  features: { feature_key: string; feature_label: string }[];
}

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/plans?role=doctor`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ plans: [] }, { status: 200 });
    }
    const json = (await res.json()) as { data?: PublicPlan[]; plans?: PublicPlan[] };
    const plans = json?.data ?? json?.plans ?? [];
    return NextResponse.json({ plans }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return NextResponse.json({ plans: [] }, { status: 200 });
  }
}
