import { NextResponse } from 'next/server'

// Stub route para Google OAuth
// En producción, esto redirige a Google OAuth y maneja el callback
export async function GET() {
  // URL de ejemplo de Google OAuth
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleAuthUrl.searchParams.append('client_id', process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID')
  googleAuthUrl.searchParams.append('redirect_uri', `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/integrations/google/callback`)
  googleAuthUrl.searchParams.append('response_type', 'code')
  googleAuthUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/calendar')
  googleAuthUrl.searchParams.append('access_type', 'offline')

  return NextResponse.redirect(googleAuthUrl.toString())
}
