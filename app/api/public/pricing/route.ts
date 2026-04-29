/**
 * GET /api/public/pricing  (PÚBLICO, sin auth)
 * Devuelve el precio base + opciones de duración con descuentos.
 * Usado por el landing page para mostrar pricing en vivo.
 */
import { NextResponse } from 'next/server'
import { computeDurationOptions, getAppSettings } from '@/lib/subscription'

export async function GET() {
  const [settings, options] = await Promise.all([
    getAppSettings(),
    computeDurationOptions(),
  ])
  return NextResponse.json({
    base_price_usd: settings.subscription_base_price_usd,
    currency: settings.subscription_currency,
    beta_duration_days: settings.beta_duration_days,
    duration_options: options,
  }, {
    headers: { 'Cache-Control': 'public, max-age=300' }, // 5 min CDN cache
  })
}
