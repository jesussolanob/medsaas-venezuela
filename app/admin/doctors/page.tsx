'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserCheck, UserX } from 'lucide-react'
import NewDoctorModal from './NewDoctorModal'
import DoctorDetailDrawer from './DoctorDetailDrawer'
import DoctorActionButton from './DoctorActionButton'

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null)
  const supabase = createClient()

  const loadDoctors = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*, subscriptions(plan, status)')
        .eq('role', 'doctor')
        .order('created_at', { ascending: false })
      setDoctors(data || [])
    } catch (err) {
      console.error('Error loading doctors:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDoctors()
  }, [])

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Médicos</h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">{doctors?.length ?? 0} médicos registrados</p>
          </div>
          <div className="flex-shrink-0">
            <NewDoctorModal />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-hidden">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Médico</th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Especialidad</th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Estado</th>
                <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 sm:px-6 py-8 text-center text-slate-400 text-sm">
                    Cargando médicos...
                  </td>
                </tr>
              ) : !doctors || doctors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 sm:px-6 py-16 text-center">
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
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs sm:text-sm flex-shrink-0">
                          {doctor.full_name?.charAt(0) ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">{doctor.full_name}</p>
                          <p className="text-xs text-slate-400 truncate">{doctor.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">{doctor.specialty ?? '—'}</td>
                    <td className="px-4 sm:px-6 py-4">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full capitalize whitespace-nowrap">
                        {doctor.subscriptions?.[0]?.plan ?? 'Sin plan'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
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
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={() => setSelectedDoctor(doctor)}
                          className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                        >
                          Ver
                        </button>
                        <span className="text-slate-200 hidden sm:inline">|</span>
                        <div className="hidden sm:block">
                          <DoctorActionButton
                            doctorId={doctor.id}
                            isActive={doctor.is_active}
                            onSuccess={loadDoctors}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DoctorDetailDrawer
        doctor={selectedDoctor}
        isOpen={selectedDoctor !== null}
        onClose={() => setSelectedDoctor(null)}
        onDoctorUpdated={loadDoctors}
      />
    </>
  )
}