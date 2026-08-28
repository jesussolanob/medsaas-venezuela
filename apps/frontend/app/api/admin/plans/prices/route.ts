/**
 * /api/admin/plans/prices — proxy para editar precios de un plan.
 *
 * PUT body: { planKey: string, prices: [{ period: string, price_usd: number, is_active: boolean }] }
 * → PUT /api/admin/plans/:planKey/prices (backend NestJS)
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';

type Period = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const VALID_PERIODS: Period[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  const planKey = typeof obj.planKey === 'string' ? obj.planKey : '';
  if (!planKey) {
    return NextResponse.json({ error: 'planKey requerido' }, { status: 400 });
  }

  if (!Array.isArray(obj.prices)) {
    return NextResponse.json({ error: 'prices debe ser un arreglo' }, { status: 400 });
  }

  // Se arma un objeto nuevo por precio en vez de dejar pasar el original: el
  // `compare_at_price` viajaba antes solo porque `filter` conserva las claves
  // extra, cosa que no se lee en el tipo y que se rompe sola el día que alguien
  // mapee el arreglo. Acá va explícito.
  const prices = (obj.prices as unknown[])
    .filter((p): p is Record<string, unknown> => {
      const item = p as Record<string, unknown>;
      return (
        VALID_PERIODS.includes(item.period as Period) &&
        typeof item.price_usd === 'number' &&
        typeof item.is_active === 'boolean'
      );
    })
    .map((item) => ({
      period: item.period as Period,
      price_usd: item.price_usd as number,
      is_active: item.is_active as boolean,
      // Precio tachado: opcional. null lo borra; undefined ni se manda.
      // El backend valida que sea mayor al precio real.
      ...(typeof item.compare_at_price === 'number' || item.compare_at_price === null
        ? { compare_at_price: item.compare_at_price as number | null }
        : {}),
    }));

  if (prices.length === 0) {
    return NextResponse.json({ error: 'No hay precios válidos para actualizar' }, { status: 400 });
  }

  const result = await backendPut<unknown>(
    `/api/admin/plans/${encodeURIComponent(planKey)}/prices`,
    { prices },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
