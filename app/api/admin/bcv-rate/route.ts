import { NextResponse } from 'next/server'

/**
 * GET /api/admin/bcv-rate
 * Fetches the current BCV (Banco Central de Venezuela) exchange rate.
 * Tries multiple sources in order:
 *   1. BCV official website (scraping)
 *   2. pydolarve.org API
 *   3. dolarapi.com API
 * Falls back to manual entry if all fail.
 */
export async function GET() {
  let rate: number | null = null
  let dateStr = ''
  let source = 'none'

  // ── Source 0: fawazahmed0/currency-api CDN (fastest, no rate limits) ───
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd/ves.min.json',
      {
        signal: AbortSignal.timeout(6000),
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 3600 },
      }
    )
    if (res.ok) {
      const data = await res.json()
      // Response: { date: "2026-04-19", ves: 92.1234 }
      if (data?.ves && data.ves > 0) {
        rate = parseFloat(Number(data.ves).toFixed(2))
        dateStr = data.date || ''
        source = 'currency-api'
      }
    }
  } catch {
    // currency-api CDN failed, try fallback
  }

  // Fallback CDN endpoint
  if (!rate) {
    try {
      const res = await fetch(
        'https://latest.currency-api.pages.dev/v1/currencies/usd/ves.min.json',
        {
          signal: AbortSignal.timeout(6000),
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 3600 },
        }
      )
      if (res.ok) {
        const data = await res.json()
        if (data?.ves && data.ves > 0) {
          rate = parseFloat(Number(data.ves).toFixed(2))
          dateStr = data.date || ''
          source = 'currency-api'
        }
      }
    } catch {
      // fallback CDN also failed
    }
  }

  // ── Source 1: BCV official website ──────────────────────────────────────
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch('https://www.bcv.org.ve/', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-VE,es;q=0.9',
      },
      next: { revalidate: 3600 }, // cache for 1 hour
    })
    clearTimeout(timeout)

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

      // Alternative pattern
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
    // BCV fetch failed, try next source
  }

  // ── Source 2: pydolarve.org API ─────────────────────────────────────────
  if (!rate) {
    try {
      const res = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DeltaMedicalCRM/1.0',
        },
        next: { revalidate: 3600 },
      })
      if (res.ok) {
        const data = await res.json()
        const monitors = data?.monitors
        if (monitors?.usd?.price) {
          rate = monitors.usd.price
          dateStr = monitors.usd.last_update || ''
          source = 'pydolarve.org'
        }
      }
    } catch {
      // pydolarve failed, try next source
    }
  }

  // ── Source 3: dolarapi.com (Venezuela) ──────────────────────────────────
  if (!rate) {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        signal: AbortSignal.timeout(8000),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DeltaMedicalCRM/1.0',
        },
        next: { revalidate: 3600 },
      })
      if (res.ok) {
        const data = await res.json()
        // dolarapi returns { compra, venta, nombre, moneda, fechaActualizacion }
        if (data?.venta && data.venta > 0) {
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
      // dolarapi failed too
    }
  }

  // ── Source 4: alternative dolarapi endpoint ─────────────────────────────
  if (!rate) {
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares', {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 3600 },
      })
      if (res.ok) {
        const data = await res.json()
        // returns array of rates, find BCV/oficial
        const bcvEntry = Array.isArray(data)
          ? data.find((d: { casa?: string }) => d.casa === 'oficial' || d.casa === 'bcv')
          : null
        if (bcvEntry?.venta && bcvEntry.venta > 0) {
          rate = bcvEntry.venta
          dateStr = bcvEntry.fechaActualizacion || ''
          source = 'dolarapi.com'
        }
      }
    } catch {
      // all failed
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

    const sourceLabel = source === 'currency-api'
      ? 'BCV (vía Currency API)'
      : source === 'bcv.org.ve'
        ? 'BCV Oficial'
        : source === 'pydolarve.org'
          ? 'BCV (vía PyDolarVe)'
          : source === 'dolarapi.com'
            ? 'BCV (vía DolarAPI)'
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
