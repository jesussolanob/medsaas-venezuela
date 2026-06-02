/**
 * /admin/patients — Pacientes (vista global)
 * 2026-05-02: rediseño Delta Health Tech.
 * Server component que pasa data al client AdminPatientsClient.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users, Heart, Calendar, ClipboardList } from 'lucide-react'
import AdminPatientsClient, { type PatientRow } from './AdminPatientsClient'
import { PageHead, StatCard } from '@/components/dh'

export const revalidate = 30

export default async function AdminPatientsPage() {
  // RBAC
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') redirect('/doctor')

  // Stats
  const { count: totalPatients } = await admin.from('patients').select('id', { count: 'exact', head: true })
  const { count: totalConsultations } = await admin.from('consultations').select('id', { count: 'exact', head: true })
  const { count: totalAppointments } = await admin.from('appointments').select('id', { count: 'exact', head: true })

  // Activos último mes (al menos 1 cita en últimos 30 días)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  let activosMes = 0
  try {
    const { data: recentAppts } = await admin
      .from('appointments')
      .select('patient_id')
      .gte('scheduled_at', thirtyDaysAgo.toISOString())
    activosMes = new Set((recentAppts || []).map(a => a.patient_id).filter(Boolean)).size
  } catch {}

  const { data: patients } = await admin
    .from('patients')
    .select(`
      id, full_name, email, phone, cedula, birth_date, created_at, doctor_id,
      doctors:doctor_id(full_name, email, specialty)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  const patientIds = (patients || []).map(p => p.id)
  const citasMap: Record<string, number> = {}
  const atendidasMap: Record<string, number> = {}

  if (patientIds.length > 0) {
    const { data: allAppts } = await admin
      .from('appointments')
      .select('patient_id, status, consultation_id')
      .in('patient_id', patientIds)
      .not('status', 'in', '("cancelled","rescheduled")')

    for (const a of allAppts || []) {
      if (!a.patient_id) continue
      citasMap[a.patient_id] = (citasMap[a.patient_id] || 0) + 1
      if (a.status === 'completed') atendidasMap[a.patient_id] = (atendidasMap[a.patient_id] || 0) + 1
    }

    const { data: standaloneConsults } = await admin
      .from('consultations')
      .select('patient_id, status, appointment_id')
      .in('patient_id', patientIds)
      .is('appointment_id', null)
      .not('status', 'in', '("cancelled")')

    for (const c of standaloneConsults || []) {
      if (!c.patient_id) continue
      citasMap[c.patient_id] = (citasMap[c.patient_id] || 0) + 1
      if (c.status === 'completed') atendidasMap[c.patient_id] = (atendidasMap[c.patient_id] || 0) + 1
    }
  }

  const rows: PatientRow[] = (patients || []).map(p => {
    const doctor: any = Array.isArray(p.doctors) ? p.doctors[0] : p.doctors
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      cedula: p.cedula,
      birth_date: p.birth_date,
      created_at: p.created_at,
      doctor_id: p.doctor_id,
      doctor_name: doctor?.full_name || null,
      doctor_specialty: doctor?.specialty || null,
      citas: citasMap[p.id] || 0,
      atendidas: atendidasMap[p.id] || 0,
    }
  })

  // Edad promedio
  const ages = rows
    .map(r => {
      if (!r.birth_date) return null
      const b = new Date(r.birth_date)
      if (isNaN(b.getTime())) return null
      return Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000))
    })
    .filter((a): a is number => a !== null && a > 0 && a < 130)
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a, 0) / ages.length) : 0

  return (
    <div>
      <PageHead
        title="Pacientes"
        subtitle={`${(totalPatients || 0).toLocaleString('es-VE')} pacientes registrados · ${activosMes.toLocaleString('es-VE')} activos este mes`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard
          label="Pacientes totales"
          value={(totalPatients || 0).toLocaleString('es-VE')}
          icon={<Users size={16} />}
          delta={rows.length > 0 ? 'En la plataforma' : 'Sin datos'}
          deltaColor="success"
        />
        <StatCard
          label="Activos · 30 días"
          value={activosMes.toLocaleString('es-VE')}
          icon={<Heart size={16} />}
          delta={`${(totalPatients || 0) > 0 ? Math.round((activosMes / (totalPatients || 1)) * 100) : 0}% del total`}
          deltaColor="turquoise"
        />
        <StatCard
          label="Edad promedio"
          value={avgAge > 0 ? `${avgAge}` : '—'}
          icon={<ClipboardList size={16} />}
          delta={avgAge > 0 ? 'Años' : 'Sin fechas registradas'}
          deltaColor="neutral"
        />
        <StatCard
          label="Citas totales"
          value={(totalAppointments || 0).toLocaleString('es-VE')}
          icon={<Calendar size={16} />}
          delta={`${(totalConsultations || 0).toLocaleString('es-VE')} consultas registradas`}
          deltaColor="success"
        />
      </div>

      <AdminPatientsClient patients={rows} />
    </div>
  )
}
