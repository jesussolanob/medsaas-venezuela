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

  // ── Caso 2: EUR BCV ──────────────────────────────────────────────────────
  // pydolarve.org tiene endpoint específico para EUR: /api/v2/euro?page=bcv
  if (mode === 'eur_bcv') {
    // Fuente 1: pydolarve.org/api/v2/euro (BCV oficial EUR)
    try {
      const res = await fetch('https://pydolarve.org/api/v2/euro?page=bcv', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json', 'User-Agent': 'DeltaMedicalCRM/1.0' },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const monitors = data?.monitors
        // BCV oficial viene como monitors.bcv o monitors.eur según versión
        const priceEntry = monitors?.bcv || monitors?.eur || monitors?.oficial
        if (priceEntry?.price && priceEntry.price > 0) {
          return NextResponse.json({
            rate: priceEntry.price,
            mode: 'eur_bcv',
            label: 'EUR → BsS (BCV oficial)',
            date: priceEntry.last_update || priceEntry.fecha || '',
            source: 'pydolarve.org',
          })
        }
      }
    } catch { /* siguiente fuente */ }

    // Fuente 2: ve.dolarapi.com/v1/euro/oficial
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/euro/oficial', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json', 'User-Agent': 'DeltaMedicalCRM/1.0' },
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
    } catch { /* siguiente fuente */ }

    // Fuente 3: ve.dolarapi.com/v1/euros (listado)
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/euros', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const oficial = Array.isArray(data)
          ? data.find((d: any) => d.casa === 'oficial' || d.casa === 'bcv')
          : null
        const price = oficial?.promedio || oficial?.venta || oficial?.compra
        if (price && price > 0) {
          return NextResponse.json({
            rate: price,
            mode: 'eur_bcv',
            label: 'EUR → BsS (BCV oficial)',
            date: oficial.fechaActualizacion || '',
            source: 'dolarapi.com',
          })
        }
      }
    } catch { /* siguiente fuente */ }

    // Fuente 4: currency-api CDN (EUR/VES aproximado como último recurso)
    try {
      const res = await fetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json',
        { signal: AbortSignal.timeout(6000), headers: { 'Accept': 'application/json' }, cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        const vesRate = data?.eur?.ves ?? data?.ves
        if (vesRate && vesRate > 0) {
          return NextResponse.json({
            rate: parseFloat(Number(vesRate).toFixed(2)),
            mode: 'eur_bcv',
            label: 'EUR → BsS (tasa aproximada)',
            date: data.date || '',
            source: 'currency-api',
          })
        }
      }
    } catch { /* sin fuente */ }

    // Si todas las fuentes EUR fallan, NO caer a USD — devolver error explícito
    return NextResponse.json({
      rate: null,
      mode: 'eur_bcv',
      label: 'EUR → BsS (no disponible)',
      date: '',
      source: 'none',
      message: 'No se pudo obtener la tasa EUR del BCV. Configura una tasa personalizada mientras tanto.',
    }, { status: 503 })
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
