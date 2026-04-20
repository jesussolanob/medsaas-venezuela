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

    // Wrap the HTML content in a viewer that looks professional when opened from a link
    // Remove the auto-print script and add a toolbar with Print/Download button
    const viewerHtml = htmlContent
      // Remove auto-print script so it doesn't trigger when opening from WhatsApp
      .replace(/<script>window\.onload\s*=\s*function\(\)\s*\{\s*window\.print\(\);\s*\}<\/script>/g, '')
      // Inject a floating toolbar and enhanced styles for mobile-friendly viewing
      .replace('</head>', `
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .doc-toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 999;
      background: linear-gradient(135deg, #0891b2, #00C4CC);
      padding: 12px 20px; display: flex; align-items: center; justify-content: space-between;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }
    .doc-toolbar .brand { color: white; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; }
    .doc-toolbar .brand span { opacity: 0.8; font-weight: 400; margin-left: 8px; font-size: 12px; }
    .doc-toolbar .actions { display: flex; gap: 8px; }
    .doc-toolbar button {
      background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);
      color: white; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);
    }
    .doc-toolbar button:hover { background: rgba(255,255,255,0.35); }
    .doc-toolbar button.primary { background: white; color: #0891b2; border-color: white; }
    .doc-toolbar button.primary:hover { background: #f0fdfa; }
    body { padding-top: 70px !important; }
    @media print {
      .doc-toolbar { display: none !important; }
      body { padding-top: 20px !important; }
    }
    @media (max-width: 640px) {
      body { padding: 70px 16px 20px 16px !important; }
      .meta { flex-direction: column; gap: 12px !important; }
      .header { flex-direction: column; gap: 12px; text-align: center; }
      .header-text { text-align: center !important; max-width: 100% !important; }
    }
  </style>
</head>`)
      // Add toolbar right after <body>
      .replace('<body>', `<body>
  <div class="doc-toolbar">
    <div class="brand">Delta Medical CRM<span>Documento Médico</span></div>
    <div class="actions">
      <button onclick="window.print()">🖨️ Imprimir</button>
      <button class="primary" onclick="window.print()">📄 Guardar PDF</button>
    </div>
  </div>`)

    // Store as HTML file in Supabase Storage
    const filePath = `shared-docs/${user.id}/${consultationCode || 'doc'}/${fileName}.html`

    // Ensure bucket exists
    try {
      await admin.storage.createBucket('shared-docs', { public: true })
    } catch { /* bucket may already exist */ }

    const { error: uploadErr } = await admin.storage
      .from('shared-docs')
      .upload(filePath, viewerHtml, {
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
