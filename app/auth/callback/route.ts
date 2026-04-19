import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const userId = data.user.id
      const adminClient = createAdminClient()

      // Check if profile exists
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role, phone')
        .eq('id', userId)
        .maybeSingle()

      if (!profile) {
        // First-time user — redirect to onboarding to complete profile
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Existing user — check if phone is set (onboarding complete)
      if (!profile.phone) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Route based on role
      if (profile.role === 'super_admin' || profile.role === 'admin') {
        return NextResponse.redirect(`${origin}/admin`)
      }
      if (profile.role === 'patient') {
        return NextResponse.redirect(`${origin}/patient/dashboard`)
      }
      // Default: doctor
      return NextResponse.redirect(`${origin}/doctor`)
    }
  }

  // OAuth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
