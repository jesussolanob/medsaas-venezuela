'use client'
import { useState, useEffect } from 'react'
import { UserCheck, UserX, Plus, Clock, AlertTriangle, Search } from 'lucide-react'
import NewDoctorModal from './NewDoctorModal'
import DoctorDetailDrawer from './DoctorDetailDrawer'
import DoctorActionButton from './DoctorActionButton'
import { clsx } from 'clsx'
import { getPlanLabel, getPlanColor, getStatusLabel, getStatusColor } from '@/lib/subscription'

interface Doctor {
  id: string
  full_name: string
  email: string
  specialty?: string
  is_active: boolean
  created_at?: string
  last_sign_in_at?: string
  // Plan, status y expiración ahora viven en profiles directamente
  plan?: string
  subscription_status?: string
  subscription_expires_at?: string
}

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export default function UsersPanel() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadDoctors = async () => {
    try {
      const res = await fetch('/api/admin/doctors')
      if (!res.ok) throw new Error('Failed to load doctors')
      const data = await res.json()
      setDoctors(data || [])
    } catch (err) {
      console.error('Error loading doctors:', err)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await loadDoctors()
      setLoading(false)
    }
    load()
  }, [])

  const filteredDoctors = doctors.filter(d => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return d.full_name?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q) || d.specialty?.toLowerCase().includes(q)
  })

  // Stats
  const activeDoctors = doctors.filter(d => d.is_active).length
  const inactiveDays7 = doctors.filter(d => {
    const days = daysSince(d.last_sign_in_at || d.created_at)
    return days >= 7 && d.is_active
  }).length

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Médicos y Suscripciones</h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {doctors?.length ?? 0} médicos registrados · {activeDoctors} activos
            </p>
          </div>
          <div className="flex-shrink-0">
            <NewDoctorModal />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-all">
            <p className="text-2xl font-bold text-slate-900">{doctors.length}</p>
            <p className="text-xs text-slate-400 mt-1">Total registrados</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-all">
            <p className="text-2xl font-bold text-emerald-600">{activeDoctors}</p>
            <p className="text-xs text-slate-400 mt-1">Activos</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-amber-600">{inactiveDays7}</p>
              {inactiveDays7 > 0 && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            </div>
            <p className="text-xs text-slate-400 mt-1">+7 días sin actividad</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar médico..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400"
            />
          </div>
        </div>

        {/* Doctors Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-hidden">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Médico</th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Especialidad</th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Plan / Estado</th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Vence</th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Actividad</th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 sm:px-6 py-8 text-center text-slate-400 text-sm">Cargando médicos...</td>
                  </tr>
                ) : filteredDoctors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 sm:px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                          <UserCheck className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-slate-400 text-sm">{searchQuery ? 'No se encontraron resultados' : 'No hay médicos registrados todavía'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDoctors.map((doctor) => {
                    const subs = doctor.subscriptions
                    const sub = Array.isArray(subs) ? subs[0] : subs
                    const plan = sub?.plan || 'trial'
                    const status = sub?.status || 'trial'
                    const daysInactive = daysSince(doctor.last_sign_in_at || doctor.created_at)
                    const vence = sub?.current_period_end
                      ? new Date(sub.current_period_end).toLocaleDateString('es-VE')
                      : '—'

                    return (
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
                        <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">
                          {doctor.specialty ?? '—'}
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap w-fit ${getPlanColor(plan)}`}>
                              {getPlanLabel(plan)}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap w-fit ${getStatusColor(status)}`}>
                              {getStatusLabel(status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-xs text-slate-500 hidden md:table-cell">
                          {vence}
                        </td>
                        <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                          <span className={clsx(
                            'text-xs px-2 py-1 rounded-full flex items-center gap-1 w-fit',
                            daysInactive >= 14 ? 'bg-red-50 text-red-600' :
                            daysInactive >= 7 ? 'bg-amber-50 text-amber-600' :
                            'bg-emerald-50 text-emerald-600'
                          )}>
                            <Clock className="w-3 h-3" />
                            {daysInactive === 0 ? 'Hoy' : `${daysInactive}d`}
                          </span>
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
                    )
                  })
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
