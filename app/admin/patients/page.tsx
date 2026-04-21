import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
      doctors:doctor_id(full_name, email)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // Contar consultas por paciente (una sola query)
  const patientIds = (patients || []).map(p => p.id)
  const consultCountMap: Record<string, number> = {}
  if (patientIds.length > 0) {
    const { data: consultRows } = await admin
      .from('consultations')
      .select('patient_id')
      .in('patient_id', patientIds)
    for (const r of consultRows || []) {
      consultCountMap[r.patient_id] = (consultCountMap[r.patient_id] || 0) + 1
    }
  }

  function calcAge(birth: string | null): string {
    if (!birth) return '—'
    const b = new Date(birth)
    if (isNaN(b.getTime())) return '—'
    const diff = Date.now() - b.getTime()
    const years = Math.floor(diff / (365.25 * 24 * 3600 * 1000))
    return years >= 0 && years < 130 ? `${years}` : '—'
  }

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

      {/* Tabla de pacientes */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            Listado ({patients?.length || 0})
          </h2>
          <p className="text-xs text-slate-400 mt-1">Últimos 200 registros, ordenados por fecha de registro</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="text-left px-5 py-3">Nombre</th>
                <th className="text-left px-5 py-3">Email</th>
                <th className="text-left px-5 py-3">Teléfono</th>
                <th className="text-left px-5 py-3">Cédula</th>
                <th className="text-right px-5 py-3">Edad</th>
                <th className="text-right px-5 py-3">Consultas</th>
                <th className="text-left px-5 py-3">Médico</th>
                <th className="text-left px-5 py-3">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!patients || patients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    No hay pacientes registrados aún
                  </td>
                </tr>
              ) : (
                patients.map(p => {
                  const doctor = Array.isArray(p.doctors) ? p.doctors[0] : p.doctors
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-900">{p.full_name || '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{p.email || '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{p.phone || '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{p.cedula || '—'}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{calcAge(p.birth_date)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                          {consultCountMap[p.id] || 0}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 text-xs">
                        {doctor?.full_name || '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">
                        {new Date(p.created_at).toLocaleDateString('es-VE')}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
