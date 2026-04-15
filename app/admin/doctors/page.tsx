import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserCheck, UserX } from 'lucide-react'
import NewDoctorModal from './NewDoctorModal'

export default async function DoctorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctors } = await supabase
    .from('profiles')
    .select('*, subscriptions(plan, status)')
    .eq('role', 'doctor')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Médicos</h2>
          <p className="text-slate-500 text-sm mt-1">{doctors?.length ?? 0} médicos registrados</p>
        </div>
        <NewDoctorModal />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Médico</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Especialidad</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!doctors || doctors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <UserCheck className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">No hay médicos registrados todavía</p>
                    <NewDoctorModal />
                  </div>
                </td>
              </tr>
            ) : (
              doctors.map((doctor) => (
                <tr key={doctor.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-sm">
                        {doctor.full_name?.charAt(0) ?? '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{doctor.full_name}</p>
                        <p className="text-xs text-slate-400">{doctor.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{doctor.specialty ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full capitalize">
                      {doctor.subscriptions?.[0]?.plan ?? 'Sin plan'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {doctor.is_active ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full w-fit">
                        <UserCheck className="w-3 h-3" /> Activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full w-fit">
                        <UserX className="w-3 h-3" /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button className="text-xs text-teal-600 hover:text-teal-700 font-medium">Ver</button>
                      <span className="text-slate-200">|</span>
                      <button className="text-xs text-slate-400 hover:text-red-500 font-medium">
                        {doctor.is_active ? 'Suspender' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}