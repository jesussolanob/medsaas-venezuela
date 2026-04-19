import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ApprovalsClient from './ApprovalsClient'

export default async function ApprovalsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    redirect('/doctor')
  }

  const admin = createAdminClient()

  // Fetch doctors in trial (pending beta approval)
  const { data: trialDoctors } = await admin
    .from('subscriptions')
    .select(`
      id,
      doctor_id,
      plan,
      status,
      current_period_end,
      created_at,
      profiles:doctor_id(full_name, email, specialty, phone, city, state)
    `)
    .in('status', ['trial', 'trialing'])
    .order('created_at', { ascending: false })

  // Fetch recently activated doctors (last 30)
  const { data: activeDoctors } = await admin
    .from('subscriptions')
    .select(`
      id,
      doctor_id,
      plan,
      status,
      current_period_end,
      created_at,
      profiles:doctor_id(full_name, email, specialty)
    `)
    .eq('status', 'active')
    .order('current_period_end', { ascending: false })
    .limit(30)

  const pending = (trialDoctors || []).map((s: any) => ({
    subscriptionId: s.id,
    doctorId: s.doctor_id,
    name: s.profiles?.full_name || 'Sin nombre',
    email: s.profiles?.email || '',
    specialty: s.profiles?.specialty || null,
    phone: s.profiles?.phone || null,
    location: [s.profiles?.city, s.profiles?.state].filter(Boolean).join(', ') || null,
    plan: s.plan,
    status: s.status,
    registeredAt: s.created_at,
    trialEndsAt: s.current_period_end,
  }))

  const approved = (activeDoctors || []).map((s: any) => ({
    subscriptionId: s.id,
    doctorId: s.doctor_id,
    name: s.profiles?.full_name || 'Sin nombre',
    email: s.profiles?.email || '',
    specialty: s.profiles?.specialty || null,
    plan: s.plan,
    activatedAt: s.current_period_end,
  }))

  return <ApprovalsClient pending={pending} approved={approved} />
}
