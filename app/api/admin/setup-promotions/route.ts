import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/admin/setup-promotions — Create plan_promotions table
export async function POST() {
  try {
    const admin = createAdminClient()

    // Create the table using raw SQL via rpc or direct query
    const { error } = await admin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS plan_promotions (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          plan_key TEXT NOT NULL,
          duration_months INTEGER NOT NULL DEFAULT 3,
          original_price_usd NUMERIC(10,2) NOT NULL,
          promo_price_usd NUMERIC(10,2) NOT NULL,
          label TEXT,
          is_active BOOLEAN DEFAULT true,
          starts_at TIMESTAMPTZ DEFAULT now(),
          ends_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_plan_promotions_active
          ON plan_promotions(plan_key, is_active) WHERE is_active = true;
      `
    })

    // If rpc doesn't exist, try direct insert to check if table exists
    if (error) {
      // Table might already exist, let's check
      const { error: checkError } = await admin
        .from('plan_promotions')
        .select('id')
        .limit(1)

      if (checkError && checkError.message.includes('does not exist')) {
        return NextResponse.json({
          error: 'La tabla no existe y no se pudo crear automáticamente. Por favor ejecuta la migración SQL manualmente en el dashboard de Supabase.',
          sql: `CREATE TABLE IF NOT EXISTS plan_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_key TEXT NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 3,
  original_price_usd NUMERIC(10,2) NOT NULL,
  promo_price_usd NUMERIC(10,2) NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE plan_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON plan_promotions FOR ALL USING (true) WITH CHECK (true);`
        }, { status: 500 })
      }

      // Table exists!
      return NextResponse.json({ success: true, message: 'La tabla plan_promotions ya existe' })
    }

    return NextResponse.json({ success: true, message: 'Tabla plan_promotions creada exitosamente' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
