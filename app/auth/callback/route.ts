import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // `next` se valida: sólo se acepta como ruta interna (CR open-redirect prevention)
  const nextRaw = searchParams.get('next')
  const next = (nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//')) ? nextRaw : null

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

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

  // AL-101: ningún fallback silencioso a 'doctor'.
  // Route based on role — explícito, con whitelist.
  const role = profile.role as string | null
  let target: string
  if (role === 'super_admin') {
    target = '/admin'
  } else if (role === 'patient') {
    target = '/patient/dashboard'
  } else if (role === 'doctor') {
    target = '/doctor'
  } else {
    // Role inválido/NULL → forzar onboarding en lugar de default a /doctor
    console.warn(`[auth/callback] Profile ${userId} tiene role inválido: ${role}`)
    return NextResponse.redirect(`${origin}/onboarding?error=role_missing`)
  }

  return NextResponse.redirect(`${origin}${next || target}`)
}
