import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/doctor/exchange-rate
 *
 * Devuelve la tasa según la configuración del doctor:
 *   - 'usd_bcv'  → USD oficial BCV (scraping bcv.org.ve)
 *   - 'eur_bcv'  → EUR oficial BCV (scraping bcv.org.ve)
 *   - 'custom'   → tasa manual fijada por el doctor
 *
 * Fuente principal: bcv.org.ve (scraping HTML directo).
 * La respuesta tiene la forma { usd, eur, yuan, lira, rublo } disponible en
 * un solo fetch; cachea 10 min en memoria del server.
 */

type ScrapedRates = {
  usd?: number
  eur?: number
  yuan?: number
  lira?: number
  rublo?: number
  fetchedAt: number
}

let _cache: ScrapedRates | null = null
const CACHE_MS = 10 * 60 * 1000  // 10 minutos

async function scrapeBcv(): Promise<ScrapedRates | null> {
  // Cache hit
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_MS) return _cache

  try {
    const res = await fetch('https://bcv.org.ve/', {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DeltaMedicalCRM/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'es-VE,es;q=0.9',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const html = await res.text()

    const parseRate = (currencyId: string): number | undefined => {
      // <div id="euro" ...> ... <strong> 567,70963084 </strong>
      // El regex captura el número aunque tenga espacios alrededor
      const re = new RegExp(`id="${currencyId}"[\\s\\S]*?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`, 'i')
      const m = html.match(re)
      if (!m) return undefined
      // BCV usa formato venezolano: "567,70963084" → convertir a 567.70963084
      // Si tuviera miles con punto: "1.234,56" → "1234.56"
      const raw = m[1].trim()
      // Si contiene coma, la coma es el decimal; puntos son miles
      let normalized: string
      if (raw.includes(',')) {
        normalized = raw.replace(/\./g, '').replace(',', '.')
      } else {
        // No coma → asume formato con punto como decimal
        normalized = raw
      }
      const n = parseFloat(normalized)
      return Number.isFinite(n) && n > 0 ? n : undefined
    }

    const rates: ScrapedRates = {
      usd: parseRate('dolar'),
      eur: parseRate('euro'),
      yuan: parseRate('yuan'),
      lira: parseRate('lira'),
      rublo: parseRate('rublo'),
      fetchedAt: Date.now(),
    }

    _cache = rates
    return rates
  } catch (err) {
    console.error('[exchange-rate] scrapeBcv error:', err)
    return null
  }
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

  // ── Caso 1: tasa custom ─────────────────────────────────────────────
  if (mode === 'custom' && customRate && customRate > 0) {
    return NextResponse.json({
      rate: Number(customRate),
      mode: 'custom',
      label: customLabel || 'Tasa personalizada',
      date: 'Fijada por el doctor',
      source: 'custom',
    })
  }

  // ── Casos 2 y 3: scraping directo BCV (USD o EUR) ───────────────────
  const rates = await scrapeBcv()
  if (!rates) {
    return NextResponse.json({
      rate: null,
      mode,
      label: '',
      date: '',
      source: 'none',
      message: 'No se pudo obtener la tasa BCV. Intenta más tarde o configura una tasa personalizada.',
    }, { status: 503 })
  }

  const dateStr = new Date(rates.fetchedAt).toLocaleString('es-VE')

  if (mode === 'eur_bcv') {
    if (!rates.eur) {
      return NextResponse.json({
        rate: null,
        mode: 'eur_bcv',
        label: 'EUR → BsS (no disponible)',
        date: '',
        source: 'bcv.org.ve',
        message: 'EUR no está publicado actualmente en el BCV. Usa USD o tasa personalizada.',
      }, { status: 503 })
    }
    return NextResponse.json({
      rate: rates.eur,
      mode: 'eur_bcv',
      label: 'EUR → BsS (BCV oficial)',
      date: dateStr,
      source: 'bcv.org.ve',
    })
  }

  // Default: USD
  if (!rates.usd) {
    return NextResponse.json({
      rate: null,
      mode: 'usd_bcv',
      label: 'USD → BsS (no disponible)',
      date: '',
      source: 'bcv.org.ve',
      message: 'USD no se pudo extraer del BCV.',
    }, { status: 503 })
  }
  return NextResponse.json({
    rate: rates.usd,
    mode: 'usd_bcv',
    label: 'USD → BsS (BCV oficial)',
    date: dateStr,
    source: 'bcv.org.ve',
  })
}
