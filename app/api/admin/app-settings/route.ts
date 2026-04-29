/**
 * /api/admin/app-settings
 * Singleton key/value config global del SaaS.
 * Solo super_admin lee/escribe.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'
import { getAppSettings, setAppSetting, type AppSettings } from '@/lib/subscription'

const ALLOWED_KEYS: (keyof AppSettings)[] = [
  'subscription_base_price_usd',
  'subscription_currency',
  'beta_duration_days',
  'payment_methods_enabled',
  'payment_methods_config',
  'stripe_enabled',
  'expiration_warning_days',
]

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const settings = await getAppSettings()
  return NextResponse.json({ settings })
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json()

  // body: { updates: { [key]: value } }
  const updates = body?.updates as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'updates obj requerido' }, { status: 400 })
  }

  const errors: string[] = []
  for (const [k, v] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(k as keyof AppSettings)) {
      errors.push(`key no permitida: ${k}`)
      continue
    }
    try {
      await setAppSetting(k as keyof AppSettings, v, guard.user.id)
    } catch (e: any) {
      errors.push(`${k}: ${e.message}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }

  const settings = await getAppSettings()
  return NextResponse.json({ success: true, settings })
}
