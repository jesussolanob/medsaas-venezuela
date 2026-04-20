import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'

  // Debug: check if env vars are configured
  if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Error: GOOGLE_CLIENT_ID no configurado</h2>
        <p>Agrega la variable <code>GOOGLE_CLIENT_ID</code> en Vercel con el Client ID de tu proyecto de Google Cloud Console.</p>
        <h3>Pasos:</h3>
        <ol>
          <li>Ve a <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console > Credentials</a></li>
          <li>Crea un OAuth 2.0 Client ID (tipo Web Application)</li>
          <li>En "Authorized redirect URIs" agrega: <code>${baseUrl}/api/integrations/google/callback</code></li>
          <li>Copia el Client ID y Client Secret</li>
          <li>Agregalos en Vercel como GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET</li>
          <li>Haz redeploy</li>
        </ol>
        <p><strong>Redirect URI actual:</strong> <code>${baseUrl}/api/integrations/google/callback</code></p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  if (!clientSecret) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Error: GOOGLE_CLIENT_SECRET no configurado</h2>
        <p>Agrega la variable <code>GOOGLE_CLIENT_SECRET</code> en Vercel.</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const redirectUri = `${baseUrl}/api/integrations/google/callback`

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleAuthUrl.searchParams.append('client_id', clientId)
  googleAuthUrl.searchParams.append('redirect_uri', redirectUri)
  googleAuthUrl.searchParams.append('response_type', 'code')
  googleAuthUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/calendar')
  googleAuthUrl.searchParams.append('access_type', 'offline')
  googleAuthUrl.searchParams.append('prompt', 'consent')

  return NextResponse.redirect(googleAuthUrl.toString())
}
