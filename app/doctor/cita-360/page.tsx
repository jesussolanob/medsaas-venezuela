import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Cita360List from './Cita360List'

export const dynamic = 'force-dynamic'

/**
 * /doctor/cita-360
 * Selector de citas — el doctor elige una y ve su Cita 360°.
 */
export default async function Cita360IndexPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Solo doctor o super_admin
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'doctor' && profile.role !== 'super_admin')) {
    redirect('/login')
  }

  // Cargar últimas 100 citas del doctor (admin ve todas)
  let query = admin
    .from('appointments')
    .select(`
      id, appointment_code, status, scheduled_at, appointment_mode,
      patient_id, patient_name, consultation_id, payment_id, doctor_id
    `)
    .order('scheduled_at', { ascending: false })
    .limit(150)

  if (profile.role === 'doctor') {
    query = query.eq('doctor_id', user.id)
  }

  const { data: appts } = await query

  // Cargar datos auxiliares (patient names + consultation codes + payment codes)
  const ids = (appts || []).map(a => a.id)
  const consultIds = (appts || []).map(a => a.consultation_id).filter(Boolean) as string[]
  const paymentIds = (appts || []).map(a => a.payment_id).filter(Boolean) as string[]
  const patientIds = (appts || []).map(a => a.patient_id).filter(Boolean) as string[]

  const [{ data: cons }, { data: pays }, { data: pats }] = await Promise.all([
    consultIds.length
      ? admin.from('consultations').select('id, consultation_code, status').in('id', consultIds)
      : Promise.resolve({ data: [] }),
    paymentIds.length
      ? admin.from('payments').select('id, payment_code, status, amount_usd').in('id', paymentIds)
      : Promise.resolve({ data: [] }),
    patientIds.length
      ? admin.from('patients').select('id, full_name').in('id', patientIds)
      : Promise.resolve({ data: [] }),
  ])

  const consMap = new Map((cons || []).map((c: any) => [c.id, c]))
  const paysMap = new Map((pays || []).map((p: any) => [p.id, p]))
  const patsMap = new Map((pats || []).map((p: any) => [p.id, p.full_name]))

  const rows = (appts || []).map(a => ({
    id: a.id,
    appointment_code: a.appointment_code || '—',
    status: a.status,
    scheduled_at: a.scheduled_at,
    mode: a.appointment_mode,
    patient_name: patsMap.get(a.patient_id || '') || a.patient_name || 'Paciente',
    consultation_code: consMap.get(a.consultation_id || '')?.consultation_code || null,
    consultation_status: consMap.get(a.consultation_id || '')?.status || null,
    payment_code: paysMap.get(a.payment_id || '')?.payment_code || null,
    payment_status: paysMap.get(a.payment_id || '')?.status || null,
    payment_amount: paysMap.get(a.payment_id || '')?.amount_usd || null,
  }))

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cita 360°</h1>
        <p className="text-sm text-slate-500 mt-1">
          Selecciona una cita para ver su flujo completo: cita, consulta, pago y resumen.
        </p>
      </div>
      <Cita360List rows={rows} />
    </div>
  )
}
