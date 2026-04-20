import { NextResponse } from 'next/server'

// Force dynamic — never statically cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/bcv-rate
 * Fetches the current BCV (Banco Central de Venezuela) official exchange rate.
 * Priority order (exact BCV rate first):
 *   1. pydolarve.org API (mirrors exact BCV rate)
 *   2. dolarapi.com API (mirrors exact BCV rate)
 *   3. BCV official website (scraping)
 *   4. fawazahmed0/currency-api CDN (approximate market rate — last resort)
 */
export async function GET() {
  let rate: number | null = null
  let dateStr = ''
  let source = 'none'

  // ── Source 1: pydolarve.org API (exact BCV rate) ───────────────────────
  try {
    const res = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
      signal: AbortSignal.timeout(8000),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DeltaMedicalCRM/1.0',
      },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      const monitors = data?.monitors
      if (monitors?.usd?.price && monitors.usd.price > 0) {
        rate = monitors.usd.price
        dateStr = monitors.usd.last_update || ''
        source = 'pydolarve.org'
      }
    }
  } catch {
    // pydolarve failed, try next source
  }

  // ── Source 2: dolarapi.com (exact BCV/oficial rate) ────────────────────
  if (!rate) {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DeltaMedicalCRM/1.0',
        },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.promedio && data.promedio > 0) {
          rate = data.promedio
          dateStr = data.fechaActualizacion || ''
          source = 'dolarapi.com'
        } else if (data?.venta && data.venta > 0) {
          rate = data.venta
          dateStr = data.fechaActualizacion || ''
          source = 'dolarapi.com'
        } else if (data?.compra && data.compra > 0) {
          rate = data.compra
          dateStr = data.fechaActualizacion || ''
          source = 'dolarapi.com'
        }
      }
    } catch {
      // dolarapi failed, try next
    }
  }

  // ── Source 2b: dolarapi alternative endpoint ───────────────────────────
  if (!rate) {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const bcvEntry = Array.isArray(data)
          ? data.find((d: { casa?: string }) => d.casa === 'oficial' || d.casa === 'bcv')
          : null
        if (bcvEntry?.promedio && bcvEntry.promedio > 0) {
          rate = bcvEntry.promedio
          dateStr = bcvEntry.fechaActualizacion || ''
          source = 'dolarapi.com'
        } else if (bcvEntry?.venta && bcvEntry.venta > 0) {
          rate = bcvEntry.venta
          dateStr = bcvEntry.fechaActualizacion || ''
          source = 'dolarapi.com'
        }
      }
    } catch {
      // alternative endpoint failed
    }
  }

  // ── Source 3: BCV official website (scraping) ──────────────────────────
  if (!rate) {
    try {
      const res = await fetch('https://www.bcv.org.ve/', {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-VE,es;q=0.9',
        },
        cache: 'no-store',
      })

      if (res.ok) {
        const html = await res.text()

        // BCV shows USD rate inside a div with id="dolar"
        const usdMatch = html.match(
          /id="dolar"[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i
        )
        if (usdMatch) {
          const rateStr = usdMatch[1].replace(/\./g, '').replace(',', '.')
          const parsed = parseFloat(rateStr)
          if (parsed > 0) {
            rate = parsed
            source = 'bcv.org.ve'
          }
        }

        if (!rate) {
          const altMatch = html.match(
            /USD[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i
          )
          if (altMatch) {
            const rateStr = altMatch[1].replace(/\./g, '').replace(',', '.')
            const parsed = parseFloat(rateStr)
            if (parsed > 0) {
              rate = parsed
              source = 'bcv.org.ve'
            }
          }
        }
      }
    } catch {
      // BCV fetch failed
    }
  }

  // ── Source 4: currency-api CDN (approximate — last resort) ─────────────
  if (!rate) {
    try {
      const res = await fetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
        {
          signal: AbortSignal.timeout(6000),
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        }
      )
      if (res.ok) {
        const data = await res.json()
        const vesRate = data?.usd?.ves ?? data?.ves
        if (vesRate && vesRate > 0) {
          rate = parseFloat(Number(vesRate).toFixed(2))
          dateStr = data.date || ''
          source = 'currency-api'
        }
      }
    } catch {
      // currency-api CDN failed, try fallback
    }
  }

  if (!rate) {
    try {
      const res = await fetch(
        'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
        {
          signal: AbortSignal.timeout(6000),
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        }
      )
      if (res.ok) {
        const data = await res.json()
        const vesRate = data?.usd?.ves ?? data?.ves
        if (vesRate && vesRate > 0) {
          rate = parseFloat(Number(vesRate).toFixed(2))
          dateStr = data.date || ''
          source = 'currency-api'
        }
      }
    } catch {
      // all CDN sources failed
    }
  }

  // ── Build response ──────────────────────────────────────────────────────
  if (rate && rate > 0) {
    if (!dateStr) {
      dateStr = new Date().toLocaleDateString('es-VE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }

    const sourceLabel = source === 'pydolarve.org'
      ? 'BCV Oficial (vía PyDolarVe)'
      : source === 'dolarapi.com'
        ? 'BCV Oficial (vía DolarAPI)'
        : source === 'bcv.org.ve'
          ? 'BCV Oficial'
          : source === 'currency-api'
            ? 'Tasa aproximada (Currency API)'
            : 'BCV'

    return NextResponse.json({
      rate,
      date: `${sourceLabel} — ${dateStr}`,
      source,
    })
  }

  // All sources failed
  return NextResponse.json({
    rate: null,
    date: '',
    source: 'none',
    message: 'No se pudo obtener la tasa BCV automáticamente. Ingrese la tasa manualmente.',
  })
}
