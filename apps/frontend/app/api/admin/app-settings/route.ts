/**
 * /api/admin/app-settings
 * Singleton key/value config global del SaaS.
 * Solo super_admin lee/escribe.
 *
 * NOTE: getAppSettings / setAppSetting in lib/subscription.ts still use
 * createAdminClient internally. That is intentional — the guard is used for
 * RBAC only; the data helpers manage their own Supabase connection.
 * FASE 5/6: pendiente backend — migrate app_settings read/write to NestJS
 *   PUT /api/admin/settings once it covers all keys used here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { getAppSettings, setAppSetting, type AppSettings } from '@/lib/subscription';

const ALLOWED_KEYS: (keyof AppSettings)[] = [
  'subscription_base_price_usd',
  'subscription_currency',
  'beta_duration_days',
  'payment_methods_enabled',
  'payment_methods_config',
  'stripe_enabled',
  'expiration_warning_days',
  'sales_whatsapp_number',
  'sales_whatsapp_message',
];

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const settings = await getAppSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const body = await req.json();

  const updates = body?.updates as Record<string, unknown>;
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'updates obj requerido' }, { status: 400 });
  }

  const errors: string[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(k as keyof AppSettings)) {
      errors.push(`key no permitida: ${k}`);
      continue;
    }
    try {
      await setAppSetting(k as keyof AppSettings, v, guard.user.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${k}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  const settings = await getAppSettings();
  return NextResponse.json({ success: true, settings });
}
