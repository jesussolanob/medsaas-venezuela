import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/doctor/exchange-rate
 *
 * Fuentes en cascada para USD y EUR (BCV oficial):
 *   1. pydolarve.org   — API estable (~200ms response)
 *   2. ve.dolarapi.com — API alternativa
 *   3. bcv.org.ve      — scraping HTML directo (último recurso)
 *
 * Cada fuente se intenta hasta 7s. Si todas fallan → 503 con detalle para debug.
 */

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/html;q=0.9, */*;q=0.1',
        'User-Agent': 'Mozilla/5.0 (compatible; DeltaMedicalCRM/1.0)',
        'Accept-Language': 'es-VE,es;q=0.9',
      },
      cache: 'no-store',
    })
    clearTimeout(timer)
    return res
  } catch {
    return null
  }
}

type RateResult = { rate: number; date: string; source: string } | null

async function fetchUsdRate(): Promise<RateResult> {
  const attempts: string[] = []

  // 1. pydolarve.org
  try {
    attempts.push('pydolarve.org')
    const res = await fetchWithTimeout('https://pydolarve.org/api/v2/dollar?page=bcv')
    if (res?.ok) {
      const data = await res.json()
      const p = data?.monitors?.usd?.price ?? data?.monitors?.bcv?.price
      if (p && p > 0) return { rate: p, date: data?.monitors?.usd?.last_update || '', source: 'pydolarve.org' }
    }
  } catch {}

  // 2. dolarapi
  try {
    attempts.push('dolarapi.com')
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial')
    if (res?.ok) {
      const data = await res.json()
      const p = data?.promedio ?? data?.venta ?? data?.compra
      if (p && p > 0) return { rate: p, date: data?.fechaActualizacion || '', source: 'dolarapi.com' }
    }
  } catch {}

  // 3. bcv.org.ve scraping
  try {
    attempts.push('bcv.org.ve')
    const res = await fetchWithTimeout('https://bcv.org.ve/', 8000)
    if (res?.ok) {
      const html = await res.text()
      const rate = parseBcvRate(html, 'dolar')
      if (rate) return { rate, date: 'BCV oficial', source: 'bcv.org.ve' }
    }
  } catch {}

  console.warn('[exchange-rate] USD all sources failed:', attempts.join(', '))
  return null
}

async function fetchEurRate(): Promise<RateResult> {
  const attempts: string[] = []

  // 1. pydolarve euro (endpoint específico EUR)
  try {
    attempts.push('pydolarve.org/euro')
    const res = await fetchWithTimeout('https://pydolarve.org/api/v2/euro?page=bcv')
    if (res?.ok) {
      const data = await res.json()
      // Puede venir como monitors.bcv.price, monitors.eur.price, o monitors.oficial.price
      const m = data?.monitors || {}
      const p = m.bcv?.price ?? m.eur?.price ?? m.oficial?.price
      if (p && p > 0) return { rate: p, date: m.bcv?.last_update || m.eur?.last_update || '', source: 'pydolarve.org' }
    }
  } catch {}

  // 2. dolarapi euro
  try {
    attempts.push('dolarapi.com/euro')
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/euro/oficial')
    if (res?.ok) {
      const data = await res.json()
      const p = data?.promedio ?? data?.venta ?? data?.compra
      if (p && p > 0) return { rate: p, date: data?.fechaActualizacion || '', source: 'dolarapi.com' }
    }
  } catch {}

  // 3. bcv.org.ve scraping (EUR)
  try {
    attempts.push('bcv.org.ve')
    const res = await fetchWithTimeout('https://bcv.org.ve/', 8000)
    if (res?.ok) {
      const html = await res.text()
      const rate = parseBcvRate(html, 'euro')
      if (rate) return { rate, date: 'BCV oficial', source: 'bcv.org.ve' }
    }
  } catch {}

  console.warn('[exchange-rate] EUR all sources failed:', attempts.join(', '))
  return null
}

function parseBcvRate(html: string, currencyId: string): number | null {
  // <div id="euro" ...> ... <strong> 567,70963084 </strong>
  const re = new RegExp(`id="${currencyId}"[\\s\\S]*?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`, 'i')
  const m = html.match(re)
  if (!m) return null
  const raw = m[1].trim()
  // Formato venezolano: "567,70963084" → 567.70963084; "1.234,56" → 1234.56
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const n = parseFloat(normalized)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(_request: Request) {
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

  // ── Custom rate ──────────────────────────────────────────────────────
  if (mode === 'custom' && customRate && customRate > 0) {
    return NextResponse.json({
      rate: Number(customRate),
      mode: 'custom',
      label: customLabel || 'Tasa personalizada',
      date: 'Fijada por el doctor',
      source: 'custom',
    })
  }

  // ── EUR BCV ──────────────────────────────────────────────────────────
  if (mode === 'eur_bcv') {
    const result = await fetchEurRate()
    if (result) {
      return NextResponse.json({
        rate: result.rate,
        mode: 'eur_bcv',
        label: 'EUR → BsS (BCV oficial)',
        date: result.date || new Date().toLocaleString('es-VE'),
        source: result.source,
      })
    }
    return NextResponse.json({
      rate: null,
      mode: 'eur_bcv',
      label: 'EUR → BsS',
      date: '',
      source: 'none',
      message: 'No se pudo obtener la tasa EUR de ninguna fuente. Usa tasa personalizada.',
    }, { status: 503 })
  }

  // ── USD BCV (default) ────────────────────────────────────────────────
  const result = await fetchUsdRate()
  if (result) {
    return NextResponse.json({
      rate: result.rate,
      mode: 'usd_bcv',
      label: 'USD → BsS (BCV oficial)',
      date: result.date || new Date().toLocaleString('es-VE'),
      source: result.source,
    })
  }
  return NextResponse.json({
    rate: null,
    mode: 'usd_bcv',
    label: 'USD → BsS',
    date: '',
    source: 'none',
    message: 'No se pudo obtener la tasa USD de ninguna fuente. Usa tasa personalizada.',
  }, { status: 503 })
}
