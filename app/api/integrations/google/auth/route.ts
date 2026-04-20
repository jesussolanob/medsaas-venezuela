import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'

  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID no configurado. Agrega esta variable en Vercel.' },
      { status: 500 }
    )
  }

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleAuthUrl.searchParams.append('client_id', clientId)
  googleAuthUrl.searchParams.append('redirect_uri', `${baseUrl}/api/integrations/google/callback`)
  googleAuthUrl.searchParams.append('response_type', 'code')
  googleAuthUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/calendar')
  googleAuthUrl.searchParams.append('access_type', 'offline')
  googleAuthUrl.searchParams.append('prompt', 'consent')

  return NextResponse.redirect(googleAuthUrl.toString())
}
