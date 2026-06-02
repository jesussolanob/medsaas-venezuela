'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // 🚫 Endpoint deshabilitado en producción (CR-003).
  // Para limpiar la BD, usa scripts/reset-dev-db.ts offline.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // También requerimos doble confirmación vía header:
  const confirmHeader = request.headers.get('x-confirm-destroy')
  if (confirmHeader !== 'DELETE_ALL_EXCEPT_ADMIN') {
    return NextResponse.json(
      { error: 'Missing x-confirm-destroy: DELETE_ALL_EXCEPT_ADMIN header' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Verify caller is super admin
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'No auth' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Not admin' }, { status: 403 })
  }

  const keepEmail = 'jesussolano4@gmail.com'

  try {
    // Get all users except the admin
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const usersToDelete = users?.filter(u => u.email !== keepEmail) || []

    // Delete related data in correct order (respecting foreign keys)
    const tables = [
      'consultation_payments',
      'prescriptions',
      'ehr_records',
      'consultations',
      'patient_packages',
      'appointments',
      'patient_messages',
      'patients',
      'leads',
      'payments',
      // subscriptions y doctor_invitations eliminadas en reingeniería 2026-04-22
      'pricing_plans',
      'accounts_payable',
      'reminders_queue',
      'doctor_suggestions',
    ]

    // Get admin user id
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', keepEmail)
      .single()

    const adminId = adminProfile?.id

    // Delete all data from tables where doctor_id != admin
    for (const table of tables) {
      try {
        if (adminId) {
          await supabase.from(table).delete().neq('doctor_id', adminId)
        }
        // Also try deleting by other FK columns
        if (adminId) {
          await supabase.from(table).delete().neq('id', adminId).not('doctor_id', 'is', null)
        }
      } catch {
        // Some tables may not have doctor_id column, that's ok
      }
    }

    // Delete profiles except admin
    if (adminId) {
      await supabase.from('profiles').delete().neq('id', adminId)
    }

    // Delete auth users
    let deleted = 0
    for (const u of usersToDelete) {
      try {
        await supabase.auth.admin.deleteUser(u.id)
        deleted++
      } catch (err) {
        console.error(`Failed to delete user ${u.email}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      deleted_users: deleted,
      kept: keepEmail,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
