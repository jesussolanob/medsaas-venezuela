import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/doctor/settings?google=error', req.url))
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/integrations/google/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', await tokenRes.text())
      return NextResponse.redirect(new URL('/doctor/settings?google=error', req.url))
    }

    const tokens = await tokenRes.json()
    const refreshToken = tokens.refresh_token
    const accessToken = tokens.access_token

    // Get the logged-in user
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/doctor/settings?google=error', req.url))
    }

    // Store refresh token in the doctor's profile
    const admin = createAdminClient()
    await admin.from('profiles').update({
      google_refresh_token: refreshToken || accessToken,
    }).eq('id', user.id)

    return NextResponse.redirect(new URL('/doctor/settings?google=success', req.url))
  } catch (err) {
    console.error('Google Calendar callback error:', err)
    return NextResponse.redirect(new URL('/doctor/settings?google=error', req.url))
  }
}
