import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/doctor/exchange-rate
 * Devuelve la tasa de cambio a BsS según la configuración del doctor autenticado:
 *   - 'usd_bcv'  → consulta BCV USD (reutiliza /api/admin/bcv-rate)
 *   - 'eur_bcv'  → consulta BCV EUR
 *   - 'custom'   → usa la tasa manual que fijó el doctor
 *
 * Respuesta: { rate, mode, label, date, source }
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let mode: 'usd_bcv' | 'eur_bcv' | 'custom' = 'usd_bcv'
  let customRate: number | null = null
  let customLabel: string | null = null

  if (user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('currency_mode, custom_rate, custom_rate_label')
      .eq('id', user.id)
      .single()
    if (profile) {
      mode = (profile.currency_mode as any) || 'usd_bcv'
      customRate = profile.custom_rate
      customLabel = profile.custom_rate_label
    }
  }

  // ── Caso 1: tasa custom ──────────────────────────────────────────────────
  if (mode === 'custom' && customRate && customRate > 0) {
    return NextResponse.json({
      rate: Number(customRate),
      mode: 'custom',
      label: customLabel || 'Tasa personalizada',
      date: 'Fijada por el doctor',
      source: 'custom',
    })
  }

  // ── Caso 2: EUR BCV (extraer desde pydolarve o dolarapi) ─────────────────
  if (mode === 'eur_bcv') {
    try {
      const res = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const eur = data?.monitors?.eur
        if (eur?.price && eur.price > 0) {
          return NextResponse.json({
            rate: eur.price,
            mode: 'eur_bcv',
            label: 'EUR → BsS (BCV oficial)',
            date: eur.last_update || '',
            source: 'pydolarve.org',
          })
        }
      }
    } catch { /* fallback abajo */ }

    try {
      const res = await fetch('https://ve.dolarapi.com/v1/euro/oficial', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const price = data?.promedio || data?.venta || data?.compra
        if (price && price > 0) {
          return NextResponse.json({
            rate: price,
            mode: 'eur_bcv',
            label: 'EUR → BsS (BCV oficial)',
            date: data.fechaActualizacion || '',
            source: 'dolarapi.com',
          })
        }
      }
    } catch { /* sin fuente */ }

    return NextResponse.json({
      rate: null,
      mode: 'eur_bcv',
      label: 'EUR → BsS (no disponible)',
      date: '',
      source: 'none',
      message: 'No se pudo obtener la tasa EUR. Configura una tasa personalizada o usa USD.',
    })
  }

  // ── Caso 3 (default): USD BCV — delegamos al endpoint existente ──────────
  try {
    const url = new URL(request.url)
    const res = await fetch(new URL('/api/admin/bcv-rate', url.origin).toString(), {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({
        rate: data.rate,
        mode: 'usd_bcv',
        label: 'USD → BsS (BCV oficial)',
        date: data.date || '',
        source: data.source || 'bcv',
      })
    }
  } catch { /* fallthrough */ }

  return NextResponse.json({
    rate: null,
    mode,
    label: '',
    date: '',
    source: 'none',
    message: 'No se pudo obtener la tasa. Configura una tasa personalizada o reintenta.',
  }, { status: 503 })
}
