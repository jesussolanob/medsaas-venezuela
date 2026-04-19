import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST: Store an HTML document in Supabase Storage and return its public URL
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { htmlContent, fileName, consultationCode } = body

  if (!htmlContent || !fileName) {
    return NextResponse.json({ error: 'Contenido y nombre de archivo requeridos' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // Store as HTML file in Supabase Storage
    const filePath = `shared-docs/${user.id}/${consultationCode || 'doc'}/${fileName}.html`

    // Ensure bucket exists
    try {
      await admin.storage.createBucket('shared-docs', { public: true })
    } catch { /* bucket may already exist */ }

    const { error: uploadErr } = await admin.storage
      .from('shared-docs')
      .upload(filePath, htmlContent, {
        contentType: 'text/html',
        upsert: true,
      })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      return NextResponse.json({ error: 'Error al subir documento' }, { status: 500 })
    }

    const { data: urlData } = admin.storage.from('shared-docs').getPublicUrl(filePath)

    return NextResponse.json({ success: true, url: urlData.publicUrl })
  } catch (err: any) {
    console.error('Share PDF error:', err)
    return NextResponse.json({ error: err?.message || 'Error al compartir' }, { status: 500 })
  }
}
