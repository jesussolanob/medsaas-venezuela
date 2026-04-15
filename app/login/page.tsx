import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: kpis } = await supabase.rpc('bi_platform_kpis')

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '0.5rem' }}>
        MedSaaS Venezuela
      </h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>Panel Super Admin</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '12px' }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>MÉDICOS ACTIVOS</p>
          <p style={{ fontSize: '28px', fontWeight: '600' }}>{kpis?.total_doctors ?? 0}</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '12px' }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>CITAS HOY</p>
          <p style={{ fontSize: '28px', fontWeight: '600' }}>{kpis?.appts_today ?? 0}</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '12px' }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>CITAS ESTE MES</p>
          <p style={{ fontSize: '28px', fontWeight: '600' }}>{kpis?.appts_this_month ?? 0}</p>
        </div>
        <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '12px' }}>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>SUSCRIPCIONES ACTIVAS</p>
          <p style={{ fontSize: '28px', fontWeight: '600' }}>{kpis?.active_subscriptions ?? 0}</p>
        </div>
      </div>

      <p style={{ color: '#666', fontSize: '14px' }}>Bienvenido, {user.email}</p>
    </div>
  )
}