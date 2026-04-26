import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminPatientsClient, { type PatientRow } from './AdminPatientsClient'

// Cache corto de 30s: lista refresca cada media minuto sin sacrificar velocidad
export const revalidate = 30

/**
 * /admin/patients
 * Vista global de todos los pacientes registrados en la plataforma.
 * Server component para performance: se resuelve todo server-side.
 */
export default async function AdminPatientsPage() {
  // RBAC guard
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') redirect('/doctor')

  // ── Stats globales ─────────────────────────────────────────────────────────
  const { count: totalPatients } = await admin
    .from('patients')
    .select('id', { count: 'exact', head: true })

  const { count: totalConsultations } = await admin
    .from('consultations')
    .select('id', { count: 'exact', head: true })

  const { count: totalAppointments } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })

  // ── Listado con datos agregados ────────────────────────────────────────────
  const { data: patients } = await admin
    .from('patients')
    .select(`
      id,
      full_name,
      email,
      phone,
      cedula,
      birth_date,
      created_at,
      doctor_id,
      doctors:doctor_id(full_name, email, specialty)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  // Contar 2 métricas por paciente:
  // - citasMap: appointments activas + consultations sin appointment (consultas standalone)
  // - atendidasMap: appointments status='completed' + consultations status='completed'
  const patientIds = (patients || []).map(p => p.id)
  const citasMap: Record<string, number> = {}
  const atendidasMap: Record<string, number> = {}

  if (patientIds.length > 0) {
    // 1. Appointments (todas excepto cancelled/rescheduled)
    const { data: allAppts } = await admin
      .from('appointments')
      .select('patient_id, status, consultation_id')
      .in('patient_id', patientIds)
      .not('status', 'in', '("cancelled","rescheduled")')

    for (const a of allAppts || []) {
      if (!a.patient_id) continue
      citasMap[a.patient_id] = (citasMap[a.patient_id] || 0) + 1
      if (a.status === 'completed') {
        atendidasMap[a.patient_id] = (atendidasMap[a.patient_id] || 0) + 1
      }
    }

    // 2. Consultations standalone (sin appointment_id) — el doctor las creó manualmente
    //    Cuentan como "cita" siempre, y como "atendida" solo si status='completed'
    const { data: standaloneConsults } = await admin
      .from('consultations')
      .select('patient_id, status, appointment_id')
      .in('patient_id', patientIds)
      .is('appointment_id', null)
      .not('status', 'in', '("cancelled")')

    for (const c of standaloneConsults || []) {
      if (!c.patient_id) continue
      citasMap[c.patient_id] = (citasMap[c.patient_id] || 0) + 1
      if (c.status === 'completed') {
        atendidasMap[c.patient_id] = (atendidasMap[c.patient_id] || 0) + 1
      }
    }
  }

  // Construir filas para el client component (incluye specialty + counts)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pacientes</h1>
        <p className="text-slate-500 text-sm mt-1">
          Estadísticas globales de pacientes registrados en la plataforma
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Pacientes totales</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{(totalPatients || 0).toLocaleString('es-VE')}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Consultas realizadas</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{(totalConsultations || 0).toLocaleString('es-VE')}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Citas agendadas</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{(totalAppointments || 0).toLocaleString('es-VE')}</p>
        </div>
      </div>

      {/* Filtros + tabla (client component) */}
      <AdminPatientsClient patients={rows} />
    </div>
  )
}
