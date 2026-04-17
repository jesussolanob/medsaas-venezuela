import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApprovalsClient from './ApprovalsClient'

type PendingPayment = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  amount: number
  currency: string
  payment_method: string
  reference_number: string | null
  receipt_url: string | null
  created_at: string
  status: string
}

type ProcessedPayment = PendingPayment & {
  verified_at: string
  verified_by: string | null
}

export default async function ApprovalsPage() {
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    redirect('/doctor')
  }

  // Fetch pending payments with doctor info
  const { data: pendingData, error: pendingError } = await supabase
    .from('subscription_payments')
    .select(`
      id,
      doctor_id,
      amount,
      currency,
      payment_method,
      reference_number,
      receipt_url,
      status,
      created_at,
      profiles:doctor_id(full_name, email)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // Fetch recently processed payments (last 20)
  const { data: processedData, error: processedError } = await supabase
    .from('subscription_payments')
    .select(`
      id,
      doctor_id,
      amount,
      currency,
      payment_method,
      reference_number,
      receipt_url,
      status,
      created_at,
      verified_at,
      verified_by,
      profiles:doctor_id(full_name, email)
    `)
    .in('status', ['approved', 'rejected'])
    .order('verified_at', { ascending: false })
    .limit(20)

  // Transform pending data
  const pendingPayments: PendingPayment[] = (pendingData || []).map((p: any) => ({
    id: p.id,
    doctor_id: p.doctor_id,
    doctor_name: p.profiles?.full_name || 'Unknown',
    doctor_email: p.profiles?.email || 'unknown@example.com',
    amount: p.amount,
    currency: p.currency,
    payment_method: p.payment_method,
    reference_number: p.reference_number,
    receipt_url: p.receipt_url,
    created_at: p.created_at,
    status: p.status,
  }))

  // Transform processed data
  const processedPayments: ProcessedPayment[] = (processedData || []).map((p: any) => ({
    id: p.id,
    doctor_id: p.doctor_id,
    doctor_name: p.profiles?.full_name || 'Unknown',
    doctor_email: p.profiles?.email || 'unknown@example.com',
    amount: p.amount,
    currency: p.currency,
    payment_method: p.payment_method,
    reference_number: p.reference_number,
    receipt_url: p.receipt_url,
    created_at: p.created_at,
    status: p.status,
    verified_at: p.verified_at,
    verified_by: p.verified_by,
  }))

  return <ApprovalsClient pendingPayments={pendingPayments} processedPayments={processedPayments} />
}
