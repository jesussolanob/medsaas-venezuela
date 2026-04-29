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
  // Construir link de WhatsApp si hay número configurado
  let sales_whatsapp_url: string | null = null
  if (settings.sales_whatsapp_number) {
    const number = settings.sales_whatsapp_number.replace(/\D/g, '')
    const text = encodeURIComponent(settings.sales_whatsapp_message || 'Hola')
    sales_whatsapp_url = `https://wa.me/${number}?text=${text}`
  }

  return NextResponse.json({
    base_price_usd: settings.subscription_base_price_usd,
    currency: settings.subscription_currency,
    beta_duration_days: settings.beta_duration_days,
    duration_options: options,
    sales_whatsapp_url,
  }, {
    headers: { 'Cache-Control': 'public, max-age=300' }, // 5 min CDN cache
  })
}
