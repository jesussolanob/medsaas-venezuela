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
  method: string
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
  created_at: string
  current_period_end: string
}

type ExpiringSubscription = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  specialty: string | null
  plan: string
  status: string
  current_period_end: string
  days_remaining: number
}

type ApprovedPayment = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  amount: number
  currency: string
  method: string
  created_at: string
}

type Invoice = {
  id: string
  invoice_number: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  amount: number
  currency: string
  description: string | null
  status: string
  issued_at: string
  sent_at: string | null
  paid_at: string | null
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
      method,
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
      method,
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
      created_at,
      current_period_end,
      profiles:doctor_id(full_name, email, specialty)
    `)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })

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
      current_period_end,
      profiles:doctor_id(full_name, email, specialty)
    `)
    .lte('current_period_end', fourteenDaysFromNow.toISOString())
    .gte('current_period_end', now.toISOString())
    .in('status', ['active', 'trial'])
    .order('current_period_end', { ascending: true })

  // 5. Fetch approved payments (for billing tab)
  const { data: approvedPaymentsData } = await supabase
    .from('subscription_payments')
    .select(`
      id,
      doctor_id,
      amount,
      currency,
      method,
      created_at,
      profiles:doctor_id(full_name, email)
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  // 6. Fetch all invoices (for billing tab)
  const { data: invoicesData } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      doctor_id,
      amount,
      currency,
      description,
      status,
      issued_at,
      sent_at,
      paid_at,
      profiles:doctor_id(full_name, email)
    `)
    .order('created_at', { ascending: false })

  // Transform pending payments
  const pendingPayments: PendingPayment[] = (pendingData || []).map((p: any) => ({
    id: p.id,
    doctor_id: p.doctor_id,
    doctor_name: p.profiles?.full_name || 'Unknown',
    doctor_email: p.profiles?.email || 'unknown@example.com',
    amount: p.amount,
    currency: p.currency,
    method: p.method,
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
    method: p.method,
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
    created_at: s.created_at,
    current_period_end: s.current_period_end,
  }))

  // Transform expiring subscriptions
  const expiringSubscriptions: ExpiringSubscription[] = (expiringSubsData || []).map((s: any) => {
    const expiresDate = new Date(s.current_period_end)
    const daysRemaining = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return {
      id: s.id,
      doctor_id: s.doctor_id,
      doctor_name: s.profiles?.full_name || 'Unknown',
      doctor_email: s.profiles?.email || 'unknown@example.com',
      specialty: s.profiles?.specialty || null,
      plan: s.plan,
      status: s.status,
      current_period_end: s.current_period_end,
      days_remaining: Math.max(0, daysRemaining),
    }
  })

  // Transform approved payments
  const approvedPayments: ApprovedPayment[] = (approvedPaymentsData || []).map((p: any) => ({
    id: p.id,
    doctor_id: p.doctor_id,
    doctor_name: p.profiles?.full_name || 'Unknown',
    doctor_email: p.profiles?.email || 'unknown@example.com',
    amount: p.amount,
    currency: p.currency,
    method: p.method,
    created_at: p.created_at,
  }))

  // Transform invoices
  const invoices: Invoice[] = (invoicesData || []).map((inv: any) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    doctor_id: inv.doctor_id,
    doctor_name: inv.profiles?.full_name || 'Unknown',
    doctor_email: inv.profiles?.email || 'unknown@example.com',
    amount: inv.amount,
    currency: inv.currency,
    description: inv.description,
    status: inv.status,
    issued_at: inv.issued_at,
    sent_at: inv.sent_at,
    paid_at: inv.paid_at,
  }))

  return (
    <ApprovalsClient
      pendingPayments={pendingPayments}
      processedPayments={processedPayments}
      newSubscriptions={newSubscriptions}
      expiringSubscriptions={expiringSubscriptions}
      approvedPayments={approvedPayments}
      invoices={invoices}
    />
  )
}
