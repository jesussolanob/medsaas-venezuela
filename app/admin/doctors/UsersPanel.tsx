'use client'
import { useState, useEffect } from 'react'
import { UserCheck, UserX, Plus } from 'lucide-react'
import NewDoctorModal from './NewDoctorModal'
import DoctorDetailDrawer from './DoctorDetailDrawer'
import ClinicDetailDrawer from './ClinicDetailDrawer'
import DoctorActionButton from './DoctorActionButton'
import NewClinicModal from './NewClinicModal'
import { clsx } from 'clsx'

const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial',
  basic: 'Basic',
  professional: 'Professional',
  clinic: 'Centro de Salud',
  enterprise: 'Centro de Salud',
  centro_salud: 'Centro de Salud',
}

const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-slate-100 text-slate-600',
  basic: 'bg-blue-50 text-blue-600',
  professional: 'bg-teal-50 text-teal-600',
  clinic: 'bg-violet-50 text-violet-600',
  enterprise: 'bg-violet-50 text-violet-600',
}

const STATUS_COLORS: Record<string, { suffix: string; color: string }> = {
  active: { suffix: '', color: '' },
  trial: { suffix: ' · Trial', color: 'bg-amber-50 text-amber-700' },
  trialing: { suffix: ' · Trial', color: 'bg-amber-50 text-amber-700' },
  suspended: { suffix: ' · Suspendida', color: 'bg-red-50 text-red-700' },
  past_due: { suffix: ' · Vencido', color: 'bg-orange-50 text-orange-700' },
  pending_payment: { suffix: ' · Pendiente', color: 'bg-orange-50 text-orange-700' },
}

function getPlanTag(plan?: string | null, status?: string | null): { label: string; color: string } {
  const planKey = plan || 'trial'
  const planName = PLAN_LABELS[planKey] || planKey.charAt(0).toUpperCase() + planKey.slice(1)
  const statusInfo = STATUS_COLORS[status || 'trial'] || STATUS_COLORS.trial
  const color = statusInfo.color || PLAN_COLORS[planKey] || PLAN_COLORS.trial
  return { label: planName + (statusInfo.suffix || ''), color }
}

interface Doctor {
  id: string
  full_name: string
  email: string
  specialty?: string
  is_active: boolean
  subscriptions?: { plan: string; status: string } | Array<{ plan: string; status: string }> | null
}

interface Clinic {
  id: string
  name: string
  city?: string
  email?: string
  is_active: boolean
  subscription_plan?: string
  subscription_status?: string
  max_doctors: number
  owner_id?: string
  owner_name?: string
  doctor_count?: number
}

export default function UsersPanel() {
  const [tab, setTab] = useState<'doctors' | 'clinics'>('doctors')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)

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

  const loadClinics = async () => {
    try {
      const res = await fetch('/api/admin/clinics')
      if (!res.ok) throw new Error('Failed to load clinics')
      const data = await res.json()
      setClinics(data)
    } catch (err) {
      console.error('Error loading clinics:', err)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      if (tab === 'doctors') {
        await loadDoctors()
      } else {
        await loadClinics()
      }
      setLoading(false)
    }
    load()
  }, [tab])

  const tabs = [
    { value: 'doctors' as const, label: 'Médicos', icon: '👨‍⚕️' },
    { value: 'clinics' as const, label: 'Clínicas', icon: '🏥' },
  ]

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Usuarios</h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              {tab === 'doctors'
                ? `${doctors?.length ?? 0} médicos registrados`
                : `${clinics?.length ?? 0} clínicas registradas`}
            </p>
          </div>
          <div className="flex-shrink-0">
            {tab === 'doctors' ? <NewDoctorModal /> : <NewClinicModal onSuccess={loadClinics} />}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                tab === t.value
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Doctors Tab */}
        {tab === 'doctors' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-hidden">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Médico
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    Especialidad
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    Estado
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Acciones
                  </th>
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
                            <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                              {doctor.full_name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{doctor.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">
                        {doctor.specialty ?? '—'}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {(() => {
                          const subs = doctor.subscriptions
                          const sub = Array.isArray(subs) ? subs[0] : subs
                          const tag = getPlanTag(sub?.plan, sub?.status)
                          return (
                            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${tag.color}`}>
                              {tag.label}
                            </span>
                          )
                        })()}
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
        )}

        {/* Clinics Tab */}
        {tab === 'clinics' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto -mx-4 sm:mx-0 sm:overflow-hidden">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Clínica
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    Ciudad
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    Médicos
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    Propietario
                  </th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 sm:px-6 py-8 text-center text-slate-400 text-sm">
                      Cargando clínicas...
                    </td>
                  </tr>
                ) : !clinics || clinics.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 sm:px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-2xl">
                          🏥
                        </div>
                        <p className="text-slate-400 text-sm">No hay clínicas registradas todavía</p>
                        <NewClinicModal onSuccess={loadClinics} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  clinics.map((clinic) => (
                    <tr key={clinic.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-medium text-xs sm:text-sm flex-shrink-0">
                            {clinic.name?.charAt(0) ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                              {clinic.name}
                            </p>
                            {clinic.email && (
                              <p className="text-xs text-slate-400 truncate">{clinic.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-slate-600 hidden sm:table-cell">
                        {clinic.city ?? '—'}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {(() => {
                          const tag = getPlanTag(clinic.subscription_plan, clinic.subscription_status)
                          return (
                            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${tag.color}`}>
                              {tag.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-slate-900 font-medium hidden md:table-cell">
                        {clinic.doctor_count || 0}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 hidden lg:table-cell truncate">
                        {clinic.owner_name}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <button
                          onClick={() => setSelectedClinic(clinic)}
                          className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DoctorDetailDrawer
        doctor={selectedDoctor}
        isOpen={selectedDoctor !== null}
        onClose={() => setSelectedDoctor(null)}
        onDoctorUpdated={loadDoctors}
      />

      <ClinicDetailDrawer
        clinic={selectedClinic}
        isOpen={selectedClinic !== null}
        onClose={() => setSelectedClinic(null)}
        onClinicUpdated={loadClinics}
      />
    </>
  )
}
