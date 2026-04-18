import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/payment-accounts
 * List all active payment accounts
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('payment_accounts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching payment accounts:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Payment accounts GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/payment-accounts
 * Create a new payment account
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json()
    const { type, bank_name, account_holder, phone, rif, notes } = body

    if (!account_holder || !type) {
      return NextResponse.json({ error: 'Titular y tipo son requeridos' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('payment_accounts')
      .insert({
        type,
        bank_name: bank_name || null,
        account_holder,
        phone: phone || null,
        rif: rif || null,
        notes: notes || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating payment account:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Payment accounts POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/payment-accounts
 * Soft-delete a payment account (set is_active = false)
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin
      .from('payment_accounts')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting payment account:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Payment accounts DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
