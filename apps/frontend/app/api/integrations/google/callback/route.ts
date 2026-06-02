import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// AUDIT FIX 2026-04-28 (FASE 5D): errores ahora redirigen a /auth/error con
// códigos semánticos en lugar de query params crípticos en /doctor/settings.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const origin = new URL(req.url).origin

  if (oauthError) {
    return NextResponse.redirect(`${origin}/auth/error?type=google_oauth_denied`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?type=google_token_failed`)
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_URL || origin}/api/integrations/google/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(`${origin}/auth/error?type=google_token_failed`)
    }

    const tokens = await tokenRes.json()
    const refreshToken = tokens.refresh_token
    const accessToken = tokens.access_token

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(`${origin}/auth/error?type=auth`)
    }

    const admin = createAdminClient()
    await admin.from('profiles').update({
      google_refresh_token: refreshToken || accessToken,
    }).eq('id', user.id)

    return NextResponse.redirect(`${origin}/doctor/settings?google=success`)
  } catch (err) {
    console.error('Google Calendar callback error:', err)
    return NextResponse.redirect(`${origin}/auth/error?type=google_token_failed`)
  }
}
