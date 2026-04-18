import { NextResponse } from 'next/server'

/**
 * GET /api/admin/bcv-rate
 * Fetches the current BCV (Banco Central de Venezuela) exchange rate.
 * Tries to scrape bcv.org.ve; falls back to a reasonable estimate.
 */
export async function GET() {
  try {
    // Try fetching from BCV website
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let rate: number | null = null
    let dateStr = ''

    try {
      const res = await fetch('https://www.bcv.org.ve/', {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DeltaMedicalCRM/1.0)',
        },
      })
      clearTimeout(timeout)

      if (res.ok) {
        const html = await res.text()

        // BCV page has the USD rate in a specific div
        // Look for pattern like "Bs.S XX,XXXX" or "XX,XXXX" near "Dólar"
        const usdMatch = html.match(
          /id="dolar"[^>]*>[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i
        )
        if (usdMatch) {
          // Venezuelan format: 86,8200 → 86.8200
          const rateStr = usdMatch[1].replace(/\./g, '').replace(',', '.')
          rate = parseFloat(rateStr)
        }

        // Try alternative pattern
        if (!rate) {
          const altMatch = html.match(
            /USD[\s\S]*?<strong[^>]*>([\d.,]+)<\/strong>/i
          )
          if (altMatch) {
            const rateStr = altMatch[1].replace(/\./g, '').replace(',', '.')
            rate = parseFloat(rateStr)
          }
        }
      }
    } catch {
      clearTimeout(timeout)
      // BCV fetch failed, will use fallback
    }

    // If we got a valid rate
    if (rate && rate > 0) {
      dateStr = new Date().toLocaleDateString('es-VE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      return NextResponse.json({
        rate,
        date: `BCV — ${dateStr}`,
        source: 'bcv.org.ve',
      })
    }

    // Fallback: try a public API
    try {
      const apiRes = await fetch(
        'https://pydolarve.org/api/v2/dollar?page=bcv',
        { signal: AbortSignal.timeout(5000) }
      )
      if (apiRes.ok) {
        const data = await apiRes.json()
        // pydolarve returns monitors.usd.price or similar
        const monitors = data?.monitors
        if (monitors?.usd?.price) {
          rate = monitors.usd.price
          dateStr = monitors.usd.last_update || new Date().toLocaleDateString('es-VE')
          return NextResponse.json({
            rate,
            date: `BCV (via API) — ${dateStr}`,
            source: 'pydolarve',
          })
        }
      }
    } catch {
      // API also failed
    }

    // Final fallback with a note
    return NextResponse.json({
      rate: null,
      date: '',
      source: 'none',
      message: 'No se pudo obtener la tasa BCV automáticamente. Ingrese la tasa manualmente.',
    })
  } catch (error) {
    console.error('BCV rate error:', error)
    return NextResponse.json(
      { rate: null, date: '', source: 'error', message: 'Error al consultar la tasa BCV' },
      { status: 500 }
    )
  }
}
