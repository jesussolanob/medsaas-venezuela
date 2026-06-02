import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// GET: Serve a shared document as rendered HTML.
// Usage: /api/doctor/view-doc?path=<doctor_uuid>/<code>/<file>.html&sig=<hmac>
//
// AUDIT FIX 2026-04-28 (C-2):
// - Validate path format strictly to prevent traversal / arbitrary downloads.
// - Verify HMAC signature when SHARE_LINK_SECRET is configured.
// - Backward compatible: legacy paths without `sig` still work but log a warning,
//   so existing WhatsApp/email links keep working until rotated.

const PATH_REGEX = /^(?:shared-docs\/)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_.-]{1,80}\.html$/

function isPathSafe(filePath: string): boolean {
  if (!filePath || filePath.length > 250) return false
  if (filePath.includes('..') || filePath.includes('\\') || filePath.includes('\0')) return false
  if (filePath.startsWith('/')) return false
  if (filePath.includes('//')) return false
  return PATH_REGEX.test(filePath)
}

function verifySignature(filePath: string, sig: string | null): boolean {
  const secret = process.env.SHARE_LINK_SECRET
  if (!secret) {
    return !sig
  }
  if (!sig) return false
  const expected = crypto.createHmac('sha256', secret).update(filePath).digest('hex')
  if (expected.length !== sig.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

const NOT_FOUND_HTML = `<html><body style="font-family:system-ui;text-align:center;padding:60px">
  <h2>Documento no encontrado</h2>
  <p>El enlace puede haber expirado o el documento fue eliminado.</p>
</body></html>`

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path')
  const sig = searchParams.get('sig')

  if (!filePath || !isPathSafe(filePath)) {
    return new NextResponse('Documento no válido', { status: 400 })
  }

  if (!verifySignature(filePath, sig)) {
    return new NextResponse('Firma inválida', { status: 403 })
  }

  if (!sig && process.env.SHARE_LINK_SECRET) {
    console.warn('[view-doc] legacy unsigned link served:', filePath)
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('shared-docs')
      .download(filePath)

    if (error || !data) {
      return new NextResponse(NOT_FOUND_HTML, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const htmlContent = await data.text()
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'inline',
        // FIX 2026-04-29: la URL del PDF es determinista (mismo
        // consultation_code = misma path = misma sig). Si cacheamos,
        // re-generaciones del mismo informe devuelven el HTML viejo.
        // Forzamos no-store para que el doctor siempre vea la última versión.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('View doc error:', err instanceof Error ? err.message : err)
    return new NextResponse('Error al cargar documento', { status: 500 })
  }
}
