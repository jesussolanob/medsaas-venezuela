import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/admin/fix-role
 * Fixes the role for a user by email. Used to restore super_admin role
 * when a duplicate auth user was created via Google OAuth.
 *
 * Body: { email: string, role: string }
 */
export async function POST(req: Request) {
  try {
    const { email, role } = await req.json()

    if (!email || !role) {
      return NextResponse.json({ error: 'email y role son requeridos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. List all auth users with this email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const matchingUsers = users.filter(u => u.email === email)

    if (matchingUsers.length === 0) {
      return NextResponse.json({ error: `No se encontró usuario con email ${email}` }, { status: 404 })
    }

    const results: any[] = []

    // If there are multiple auth users with same email, we need to handle duplicates
    if (matchingUsers.length > 1) {
      // Find which one has the super_admin profile (the original)
      let primaryUser = null
      let duplicateUsers = []

      for (const u of matchingUsers) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, phone')
          .eq('id', u.id)
          .maybeSingle()

        if (profile?.role === 'super_admin' || profile?.role === 'admin') {
          primaryUser = { user: u, profile }
        } else {
          duplicateUsers.push({ user: u, profile })
        }
      }

      // If no primary found, pick the oldest one as primary
      if (!primaryUser) {
        const sorted = matchingUsers.sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        const oldest = sorted[0]
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, phone')
          .eq('id', oldest.id)
          .maybeSingle()
        primaryUser = { user: oldest, profile }
        duplicateUsers = sorted.slice(1).map(u => ({ user: u, profile: null }))
      }

      // Delete duplicate auth users and their profiles
      for (const dup of duplicateUsers) {
        // Delete profile if exists
        if (dup.profile) {
          await supabase.from('profiles').delete().eq('id', dup.user.id)
          results.push({ action: 'deleted_profile', userId: dup.user.id })
        }

        // Delete subscription if exists
        await supabase.from('subscriptions').delete().eq('doctor_id', dup.user.id)
        results.push({ action: 'deleted_subscription', userId: dup.user.id })

        // Delete the duplicate auth user
        const { error: deleteError } = await supabase.auth.admin.deleteUser(dup.user.id)
        if (deleteError) {
          results.push({ action: 'delete_auth_error', userId: dup.user.id, error: deleteError.message })
        } else {
          results.push({ action: 'deleted_auth_user', userId: dup.user.id })
        }
      }

      // Update primary user's profile role
      if (primaryUser.profile) {
        await supabase.from('profiles').update({ role }).eq('id', primaryUser.user.id)
        results.push({ action: 'updated_role', userId: primaryUser.user.id, role })
      } else {
        // Create profile for primary user
        await supabase.from('profiles').upsert({
          id: primaryUser.user.id,
          role,
          full_name: primaryUser.user.user_metadata?.full_name || 'Admin',
          email,
          phone: '+58 000 0000000',
          is_active: true,
        })
        results.push({ action: 'created_profile', userId: primaryUser.user.id, role })
      }

      // Update auth metadata
      await supabase.auth.admin.updateUserById(primaryUser.user.id, {
        user_metadata: { role },
      })
      results.push({ action: 'updated_metadata', userId: primaryUser.user.id })

      return NextResponse.json({
        success: true,
        primaryUserId: primaryUser.user.id,
        duplicatesRemoved: duplicateUsers.length,
        results,
      })
    }

    // Single user — just update the role
    const user = matchingUsers[0]

    // Update or create profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (existingProfile) {
      await supabase.from('profiles').update({ role }).eq('id', user.id)
      results.push({ action: 'updated_role', userId: user.id, role })
    } else {
      await supabase.from('profiles').upsert({
        id: user.id,
        role,
        full_name: user.user_metadata?.full_name || 'Admin',
        email,
        phone: '+58 000 0000000',
        is_active: true,
      })
      results.push({ action: 'created_profile', userId: user.id, role })
    }

    // Update auth metadata
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { role },
    })
    results.push({ action: 'updated_metadata', userId: user.id })

    return NextResponse.json({ success: true, userId: user.id, results })
  } catch (err: any) {
    console.error('Fix role error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
