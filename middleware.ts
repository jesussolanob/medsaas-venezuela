import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // ── 1. Autenticación obligatoria para las 3 áreas ──────────────────────────
  if (!user && (
    path.startsWith('/admin') ||
    path.startsWith('/doctor') ||
    path.startsWith('/patient')
  )) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // ── 2. RBAC — verificar rol contra la ruta ──────────────────────────────────
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const role = (profile?.role as string | null) ?? null

    // /admin — solo super_admin
    if (path.startsWith('/admin') && role !== 'super_admin') {
      const target = role === 'patient' ? '/patient/dashboard'
                   : role === 'doctor'  ? '/doctor'
                   : '/login'
      return NextResponse.redirect(new URL(target, request.url))
    }

    // /doctor — doctor o super_admin
    if (path.startsWith('/doctor') && role !== 'doctor' && role !== 'super_admin') {
      const target = role === 'patient' ? '/patient/dashboard' : '/login'
      return NextResponse.redirect(new URL(target, request.url))
    }

    // /patient — patient o super_admin
    if (path.startsWith('/patient') && role !== 'patient' && role !== 'super_admin') {
      const target = role === 'doctor' ? '/doctor' : '/login'
      return NextResponse.redirect(new URL(target, request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/doctor/:path*', '/patient/:path*'],
}
