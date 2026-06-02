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
    return NextResponse.redirect(`${origin}/auth/error?type=auth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/auth/error?type=auth`)
  }

  const userId = data.user.id
  const adminClient = createAdminClient()

  // Check if profile exists
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, phone, is_active, subscription_status')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    // First-time user — redirect to onboarding to complete profile
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // BUG-014: bloquear si está suspendido
  if (profile.is_active === false || profile.subscription_status === 'suspended') {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/auth/error?type=suspended`)
  }

  // BUG-017: super_admin/admin van directo sin onboarding
  const role = profile.role as string | null
  if (role === 'super_admin' || role === 'admin') {
    return NextResponse.redirect(`${origin}${next || '/admin'}`)
  }

  // Existing user — check if phone is set (onboarding complete)
  if (!profile.phone) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // AL-101: ningún fallback silencioso a 'doctor'.
  let target: string
  if (role === 'patient') {
    target = '/patient/dashboard'
  } else if (role === 'doctor') {
    target = '/doctor'
  } else {
    console.warn(`[auth/callback] Profile ${userId} tiene role inválido: ${role}`)
    return NextResponse.redirect(`${origin}/onboarding?error=role_missing`)
  }

  return NextResponse.redirect(`${origin}${next || target}`)
}
