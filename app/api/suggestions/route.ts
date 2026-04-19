import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET: Fetch suggestions (admin gets all, doctor gets own)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  let query = admin.from('doctor_suggestions').select('*, profiles(full_name, email, specialty)')

  if (profile?.role === 'doctor') {
    query = query.eq('doctor_id', user.id)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

// POST: Doctor creates a suggestion
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { subject, message, category } = body

  if (!subject || !message) {
    return NextResponse.json({ error: 'Subject and message required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('doctor_suggestions').insert({
    doctor_id: user.id,
    subject,
    message,
    category: category || 'general',
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

// PATCH: Admin marks suggestion as read/resolved
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, status, admin_response } = body

  const admin = createAdminClient()
  const updates: Record<string, any> = {}
  if (status) updates.status = status
  if (admin_response) updates.admin_response = admin_response
  updates.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from('doctor_suggestions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
