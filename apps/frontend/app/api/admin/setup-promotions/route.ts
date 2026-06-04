/**
 * /api/admin/setup-promotions — DEPRECADO (410 Gone).
 *
 * Creaba la tabla `plan_promotions` vía `exec_sql` en Supabase. En la nueva
 * arquitectura la tabla se crea con la migración Sequelize `20260604000000-plan-promotions`
 * (módulo backend `promotions`). Este endpoint ya no aplica. Sin Supabase.
 */
import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    {
      error:
        'Endpoint deprecado. La tabla plan_promotions se crea con la migración Sequelize del backend (módulo promotions).',
    },
    { status: 410 },
  );
}
