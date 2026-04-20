import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET: Serve a shared document as rendered HTML (not download)
// Usage: /api/doctor/view-doc?path=shared-docs/userId/code/filename.html
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path')

  if (!filePath) {
    return new NextResponse('Documento no encontrado', { status: 400 })
  }

  try {
    const admin = createAdminClient()

    const { data, error } = await admin.storage
      .from('shared-docs')
      .download(filePath)

    if (error || !data) {
      console.error('Download error:', error)
      return new NextResponse(
        `<html><body style="font-family:system-ui;text-align:center;padding:60px">
          <h2>Documento no encontrado</h2>
          <p>El enlace puede haber expirado o el documento fue eliminado.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    const htmlContent = await data.text()

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: any) {
    console.error('View doc error:', err)
    return new NextResponse('Error al cargar documento', { status: 500 })
  }
}
