import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Cita360Client, { type Cita360Data } from './Cita360Client'

export const dynamic = 'force-dynamic'

/**
 * /doctor/cita-360/[id]
 * Panel de auditoría 360° de una cita: 4 pasos (cita, consulta, pago, resumen).
 * El [id] es appointment_id (uuid).
 */
export default async function Cita360Page({ params }: { params: { id: string } }) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Leer la appointment principal con datos completos
  const { data: appt } = await admin
    .from('appointments')
    .select(`
      id, appointment_code, status, scheduled_at, appointment_mode,
      duration_minutes, chief_complaint, reschedule_of, created_at, updated_at,
      service_id, service_snapshot,
      consultation_id, payment_id,
      doctor_id, patient_id,
      patient_name, patient_email, patient_phone, patient_cedula
    `)
    .eq('id', params.id)
    .single()

  if (!appt) notFound()

  // Validar ownership: solo el doctor o admin
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, full_name, specialty, professional_title')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin' && appt.doctor_id !== user.id) {
    redirect('/doctor/agenda')
  }

  // Doctor info (puede ser distinto del logueado si es admin)
  const { data: doctor } = await admin
    .from('profiles')
    .select('full_name, specialty, professional_title, email')
    .eq('id', appt.doctor_id)
    .single()

  // Paciente
  const { data: patient } = appt.patient_id
    ? await admin
        .from('patients')
        .select('full_name, email, phone, cedula, birth_date')
        .eq('id', appt.patient_id)
        .single()
    : { data: null }

  // Consulta linkeada
  const { data: consultation } = appt.consultation_id
    ? await admin
        .from('consultations')
        .select(`
          id, consultation_code, status, consultation_date, chief_complaint,
          diagnosis, treatment, blocks_data, blocks_snapshot,
          started_at, ended_at, payment_status, plan_name, amount,
          created_at, updated_at
        `)
        .eq('id', appt.consultation_id)
        .single()
    : { data: null }

  // Pago linkeado
  const { data: payment } = appt.payment_id
    ? await admin
        .from('payments')
        .select(`
          id, payment_code, amount_usd, amount_bs, bcv_rate, currency,
          method_snapshot, payment_reference, payment_receipt_url,
          status, paid_at, package_id, created_at, updated_at
        `)
        .eq('id', appt.payment_id)
        .single()
    : { data: null }

  // Cadena de reagendamientos: buscar todas las appointments con la misma consultation_id
  const { data: rescheduleChain } = appt.consultation_id
    ? await admin
        .from('appointments')
        .select('id, appointment_code, status, scheduled_at, reschedule_of, created_at')
        .eq('consultation_id', appt.consultation_id)
        .order('created_at', { ascending: true })
    : { data: [] }

  // Audit log de cambios (defensive: tabla puede no existir o no tener datos)
  let changeLog: any[] = []
  try {
    const { data: logs } = await admin
      .from('appointment_changes_log')
      .select('id, actor_id, actor_role, action, field_changed, old_value, new_value, reason, created_at')
      .eq('appointment_id', appt.id)
      .order('created_at', { ascending: false })
      .limit(20)
    changeLog = logs || []
  } catch { /* tabla puede no existir */ }

  const data: Cita360Data = {
    appointment: appt as any,
    consultation: consultation as any,
    payment: payment as any,
    doctor: doctor as any,
    patient: patient as any,
    rescheduleChain: (rescheduleChain || []) as any,
    changeLog: changeLog as any,
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Link href="/doctor/agenda" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600">
        ← Volver a Agenda
      </Link>
      <Cita360Client data={data} />
    </div>
  )
}
