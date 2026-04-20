'use client'
import { useEffect, useState } from 'react'
import { X, Phone, Mail, FileText, Calendar, Users, TrendingUp, MapPin, Building2 } from 'lucide-react'

interface DoctorDetailDrawerProps {
  doctor: any
  isOpen: boolean
  onClose: () => void
  onDoctorUpdated?: () => void
}

export default function DoctorDetailDrawer({ doctor, isOpen, onClose, onDoctorUpdated }: DoctorDetailDrawerProps) {
  const [details, setDetails] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [suspending, setSuspending] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!isOpen || !doctor) {
      setLoading(true)
      return
    }

    async function loadDetails() {
      try {
        setLoading(true)
        setError('')

        const res = await fetch(`/api/admin/doctor-details?id=${doctor.id}`)
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Error al cargar detalles')

        setDetails(data)
      } catch (err: any) {
        console.error('Error loading doctor details:', err)
        setError(err.message || 'Error al cargar detalles')
      } finally {
        setLoading(false)
      }
    }

    loadDetails()
  }, [isOpen, doctor?.id])

  const handleToggleStatus = async () => {
    if (!details?.profile) return

    const action = details.profile.is_active ? 'suspend' : 'activate'
    const message = details.profile.is_active
      ? '¿Estás seguro de que deseas suspender este médico?'
      : '¿Estás seguro de que deseas activar este médico?'

    if (!confirm(message)) return

    try {
      setSuspending(true)
      setError('')

      const response = await fetch('/api/admin/toggle-doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId: details.profile.id, action }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar el estado')
      }

      setDetails({
        ...details,
        profile: {
          ...details.profile,
          is_active: action === 'activate',
        },
      })

      setSuccessMessage(`Médico ${action === 'activate' ? 'activado' : 'suspendido'} exitosamente`)
      setTimeout(() => setSuccessMessage(''), 3000)
      onDoctorUpdated?.()
    } catch (err: any) {
      console.error('Error updating doctor status:', err)
      setError(err.message || 'Error al actualizar el estado')
    } finally {
      setSuspending(false)
    }
  }

  if (!isOpen) return null

  const profile = details?.profile || doctor
  const subscription = details?.subscription
  const trialDaysLeft = subscription && subscription.trial_ends_at
    ? Math.ceil((new Date(subscription.trial_ends_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white z-50 shadow-2xl flex flex-col overflow-hidden transition-transform duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Detalle del Médico</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400 text-sm">Cargando...</div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          ) : successMessage ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
              {successMessage}
            </div>
          ) : (
            <>
              {/* Avatar y nombre */}
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-2xl mx-auto mb-3">
                  {profile?.full_name?.charAt(0) ?? '?'}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{profile?.full_name}</h3>
                <p className="text-sm text-slate-500 mt-1">{profile?.specialty || '—'}</p>
                {profile?.clinic_id && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-0.5 rounded-full mt-2">
                    <Building2 className="w-3 h-3" /> Clínica
                  </span>
                )}
              </div>

              {/* Info grid */}
              <div className="space-y-3">
                {/* Email */}
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Email</p>
                    <p className="text-sm text-slate-900 break-all">{profile?.email}</p>
                  </div>
                </div>

                {/* Phone */}
                {profile?.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Teléfono</p>
                      <p className="text-sm text-slate-900">{profile.phone}</p>
                    </div>
                  </div>
                )}

                {/* Cédula */}
                {profile?.cedula && (
                  <div className="flex items-start gap-3">
                    <FileText className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Cédula</p>
                      <p className="text-sm text-slate-900">{profile.cedula}</p>
                    </div>
                  </div>
                )}

                {/* Location */}
                {(profile?.city || profile?.state || profile?.country) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Ubicación</p>
                      <p className="text-sm text-slate-900">
                        {[profile?.city, profile?.state, profile?.country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Plan badge */}
              <div className="bg-teal-50 border border-teal-200 p-3 rounded-lg">
                <p className="text-xs text-slate-500 uppercase mb-1">Plan</p>
                <p className="text-sm font-bold text-teal-700">Beta Privada</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Acceso completo a todas las funcionalidades</p>
              </div>

              {/* Registro */}
              {profile?.created_at && (
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Registrado: {new Date(profile.created_at).toLocaleDateString('es-VE')}
                  </span>
                </div>
              )}

              {/* Estadísticas */}
              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    Pacientes
                  </span>
                  <span className="font-semibold text-slate-900">{details?.patientCount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                    Citas (mes)
                  </span>
                  <span className="font-semibold text-slate-900">{details?.consultationCount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Ingresos (mes)</span>
                  <span className="font-semibold text-slate-900">${(details?.monthlyRevenue || 0).toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {!loading && (
          <div className="border-t border-slate-200 p-6 space-y-2">
            <button
              onClick={handleToggleStatus}
              disabled={suspending}
              className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${
                profile?.is_active
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              {suspending ? 'Actualizando...' : (profile?.is_active ? 'Suspender' : 'Activar')}
            </button>
            <button
              onClick={onClose}
              className="w-full bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </>
  )
}
