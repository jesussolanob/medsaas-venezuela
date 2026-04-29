import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// AUDIT FIX 2026-04-28 (C-2): firmar el path con HMAC para prevenir
// brute-forcing de links. Si SHARE_LINK_SECRET no está set, no firmamos
// (modo backward-compat); cuando se setea, view-doc rechaza links sin sig.
function signPath(filePath: string): string | null {
  const secret = process.env.SHARE_LINK_SECRET
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(filePath).digest('hex')
}

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

    // FIX 2026-04-29: el toolbar mostraba "Documento Medico" genérico. Detectamos
    // el tipo desde el prefijo del fileName (informe-/recipe-/prescripciones-/reposo-)
    // para mostrar el título correcto.
    const docTypeLabel = (() => {
      const fn = (fileName as string).toLowerCase()
      if (fn.startsWith('informe')) return 'Informe Médico'
      if (fn.startsWith('receta') || fn.startsWith('recipe')) return 'Receta Médica'
      if (fn.startsWith('prescripciones') || fn.startsWith('prescription')) return 'Prescripción de Exámenes'
      if (fn.startsWith('reposo')) return 'Constancia de Reposo'
      return 'Documento Médico'
    })()

    // Wrap the HTML content in a professional viewer with print/download buttons
    const viewerHtml = htmlContent
      .replace(/<script>window\.onload\s*=\s*function\(\)\s*\{\s*window\.print\(\);\s*\}<\/script>/g, '')
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
      /* F4 (2026-04-29): -webkit-backdrop-filter para Safari < 18 */
      cursor: pointer; transition: all 0.2s; -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
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
      .replace('<body>', `<body>
  <div class="doc-toolbar">
    <div class="brand">Delta Medical CRM<span>${docTypeLabel}</span></div>
    <div class="actions">
      <button onclick="window.print()">Imprimir</button>
      <button class="primary" onclick="window.print()">Guardar PDF</button>
    </div>
  </div>`)

    // Convert to Buffer for proper upload
    const htmlBuffer = Buffer.from(viewerHtml, 'utf-8')

    const docPath = `${user.id}/${consultationCode || 'doc'}/${fileName}.html`

    // Ensure bucket exists
    try {
      await admin.storage.createBucket('shared-docs', { public: true })
    } catch { /* bucket may already exist */ }

    const { error: uploadErr } = await admin.storage
      .from('shared-docs')
      .upload(docPath, htmlBuffer, {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
        cacheControl: '0',
      })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      return NextResponse.json({ error: 'Error al subir documento' }, { status: 500 })
    }

    // Return URL to our own viewer endpoint (guarantees correct HTML rendering)
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_URL || 'https://medsaas-venezuela.vercel.app'
    const sig = signPath(docPath)
    const sigQuery = sig ? `&sig=${sig}` : ''
    const viewerUrl = `${baseUrl}/api/doctor/view-doc?path=${encodeURIComponent(docPath)}${sigQuery}`

    return NextResponse.json({ success: true, url: viewerUrl })
  } catch (err: any) {
    console.error('Share PDF error:', err)
    return NextResponse.json({ error: err?.message || 'Error al compartir' }, { status: 500 })
  }
}
