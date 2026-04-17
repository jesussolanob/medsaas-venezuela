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

type NewSubscription = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  specialty: string | null
  plan: string
  status: string
  started_at: string
  expires_at: string
}

type ExpiringSubscription = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  specialty: string | null
  plan: string
  status: string
  expires_at: string
  days_remaining: number
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

  // 1. Fetch pending payments with doctor info
  const { data: pendingData } = await supabase
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

  // 2. Fetch recently processed payments (last 20)
  const { data: processedData } = await supabase
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

  // 3. Fetch new subscriptions (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: newSubsData } = await supabase
    .from('subscriptions')
    .select(`
      id,
      doctor_id,
      plan,
      status,
      started_at,
      expires_at,
      profiles:doctor_id(full_name, email, specialty)
    `)
    .gte('started_at', thirtyDaysAgo.toISOString())
    .order('started_at', { ascending: false })

  // 4. Fetch subscriptions expiring in next 14 days
  const now = new Date()
  const fourteenDaysFromNow = new Date()
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)

  const { data: expiringSubsData } = await supabase
    .from('subscriptions')
    .select(`
      id,
      doctor_id,
      plan,
      status,
      expires_at,
      profiles:doctor_id(full_name, email, specialty)
    `)
    .lte('expires_at', fourteenDaysFromNow.toISOString())
    .gte('expires_at', now.toISOString())
    .in('status', ['active', 'trial'])
    .order('expires_at', { ascending: true })

  // Transform pending payments
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

  // Transform processed payments
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

  // Transform new subscriptions
  const newSubscriptions: NewSubscription[] = (newSubsData || []).map((s: any) => ({
    id: s.id,
    doctor_id: s.doctor_id,
    doctor_name: s.profiles?.full_name || 'Unknown',
    doctor_email: s.profiles?.email || 'unknown@example.com',
    specialty: s.profiles?.specialty || null,
    plan: s.plan,
    status: s.status,
    started_at: s.started_at,
    expires_at: s.expires_at,
  }))

  // Transform expiring subscriptions
  const expiringSubscriptions: ExpiringSubscription[] = (expiringSubsData || []).map((s: any) => {
    const expiresDate = new Date(s.expires_at)
    const daysRemaining = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return {
      id: s.id,
      doctor_id: s.doctor_id,
      doctor_name: s.profiles?.full_name || 'Unknown',
      doctor_email: s.profiles?.email || 'unknown@example.com',
      specialty: s.profiles?.specialty || null,
      plan: s.plan,
      status: s.status,
      expires_at: s.expires_at,
      days_remaining: Math.max(0, daysRemaining),
    }
  })

  return (
    <ApprovalsClient
      pendingPayments={pendingPayments}
      processedPayments={processedPayments}
      newSubscriptions={newSubscriptions}
      expiringSubscriptions={expiringSubscriptions}
    />
  )
}
