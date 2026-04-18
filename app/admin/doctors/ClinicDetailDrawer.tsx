'use client'
import { useEffect, useState } from 'react'
import { X, Phone, Mail, MapPin, Building2, Users, Calendar, Shield, CheckCircle2, XCircle } from 'lucide-react'

interface ClinicDetailDrawerProps {
  clinic: any
  isOpen: boolean
  onClose: () => void
  onClinicUpdated?: () => void
}

export default function ClinicDetailDrawer({ clinic, isOpen, onClose, onClinicUpdated }: ClinicDetailDrawerProps) {
  const [details, setDetails] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [suspending, setSuspending] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!isOpen || !clinic) {
      setLoading(true)
      return
    }

    async function loadDetails() {
      try {
        setLoading(true)
        setError('')

        const res = await fetch(`/api/admin/clinic-details?id=${clinic.id}`)
        const data = await res.json()

        if (!res.ok) throw new Error(data.error || 'Error al cargar detalles')

        setDetails(data)
      } catch (err: any) {
        console.error('Error loading clinic details:', err)
        setError(err.message || 'Error al cargar detalles')
      } finally {
        setLoading(false)
      }
    }

    loadDetails()
  }, [isOpen, clinic?.id])

  const handleToggleStatus = async () => {
    if (!details?.clinic) return

    const action = details.clinic.is_active ? 'suspend' : 'activate'
    const message = details.clinic.is_active
      ? '¿Estás seguro de que deseas suspender esta clínica?'
      : '¿Estás seguro de que deseas activar esta clínica?'

    if (!confirm(message)) return

    try {
      setSuspending(true)
      setError('')

      const response = await fetch('/api/admin/toggle-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: details.clinic.id, action }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar el estado')
      }

      setDetails({
        ...details,
        clinic: {
          ...details.clinic,
          is_active: action === 'activate',
        },
      })

      setSuccessMessage(`Clínica ${action === 'activate' ? 'activada' : 'suspendida'} exitosamente`)
      setTimeout(() => setSuccessMessage(''), 3000)
      onClinicUpdated?.()
    } catch (err: any) {
      console.error('Error updating clinic status:', err)
      setError(err.message || 'Error al actualizar el estado')
    } finally {
      setSuspending(false)
    }
  }

  const handleChangeToPro = async () => {
    if (!details?.clinic || !details?.ownerProfile) return

    const confirmMessage = '¿Solicitar cambio a plan Professional para esta clínica? Se enviará a Aprobaciones para verificación.'
    if (!confirm(confirmMessage)) return

    try {
      setChangingPlan(true)
      setError('')

      const response = await fetch('/api/admin/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId: details.ownerProfile.id, plan: 'professional' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al cambiar plan')
      }

      setSuccessMessage('Solicitud enviada a Aprobaciones')
      setTimeout(() => setSuccessMessage(''), 3000)
      onClinicUpdated?.()
    } catch (err: any) {
      console.error('Error changing plan:', err)
      setError(err.message || 'Error al cambiar plan')
    } finally {
      setChangingPlan(false)
    }
  }

  if (!isOpen) return null

  const clinicData = details?.clinic || clinic
  const ownerData = details?.ownerProfile
  const doctors = details?.doctors || []
  const subscription = details?.subscription

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
          <h2 className="text-lg font-semibold text-slate-900">Detalle de Clínica</h2>
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
                <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-2xl mx-auto mb-3">
                  {clinicData?.name?.charAt(0) ?? '?'}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{clinicData?.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{clinicData?.specialty || '—'}</p>
              </div>

              {/* Info grid */}
              <div className="space-y-3">
                {/* Email */}
                {clinicData?.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Email</p>
                      <p className="text-sm text-slate-900 break-all">{clinicData.email}</p>
                    </div>
                  </div>
                )}

                {/* Phone */}
                {clinicData?.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Teléfono</p>
                      <p className="text-sm text-slate-900">{clinicData.phone}</p>
                    </div>
                  </div>
                )}

                {/* Location */}
                {(clinicData?.city || clinicData?.state || clinicData?.address) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Ubicación</p>
                      <p className="text-sm text-slate-900">
                        {clinicData?.address && <div>{clinicData.address}</div>}
                        {[clinicData?.city, clinicData?.state]
                          .filter(Boolean)
                          .join(', ') && (
                          <div>
                            {[clinicData?.city, clinicData?.state]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Owner */}
                {ownerData && (
                  <div className="flex items-start gap-3">
                    <Building2 className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Propietario</p>
                      <p className="text-sm text-slate-900">{ownerData.full_name}</p>
                      <p className="text-xs text-slate-400">{ownerData.email}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 uppercase mb-1">Estado</p>
                  <p className="text-sm font-semibold">
                    {clinicData?.is_active ? (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Activa
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Inactiva
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 uppercase mb-1">Suscripción</p>
                  <p className="text-sm font-semibold capitalize text-teal-600">
                    {clinicData?.subscription_status || 'Sin estado'}
                  </p>
                </div>
              </div>

              {/* Doctors count */}
              <div className="bg-teal-50 border border-teal-200 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-teal-900 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Médicos en la clínica
                  </span>
                  <span className="bg-teal-100 text-teal-700 font-bold px-3 py-1 rounded-full text-sm">
                    {doctors.length}
                  </span>
                </div>
                <p className="text-xs text-teal-700">
                  Máximo: {clinicData?.max_doctors || '—'} médicos
                </p>
              </div>

              {/* Doctors list */}
              {doctors.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Médicos</p>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {doctors.map((doctor: any) => (
                      <div key={doctor.id} className="p-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs flex-shrink-0 mt-0.5">
                            {doctor.full_name?.charAt(0) ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {doctor.full_name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {doctor.specialty || '—'}
                            </p>
                            {!doctor.is_active && (
                              <span className="text-xs text-red-600 font-medium">Inactivo</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Created date */}
              {clinicData?.created_at && (
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Creada: {new Date(clinicData.created_at).toLocaleDateString('es-VE')}
                  </span>
                </div>
              )}

              {/* Subscription info */}
              {subscription && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <p className="text-xs text-amber-700 uppercase font-medium mb-2">Información de Suscripción</p>
                  {subscription.current_period_end && (
                    <p className="text-xs text-amber-600">
                      Vencimiento: {new Date(subscription.current_period_end).toLocaleDateString('es-VE')}
                    </p>
                  )}
                  {subscription.status === 'trial' && (
                    <p className="text-xs text-amber-600 mt-1">Estado: Período de prueba</p>
                  )}
                </div>
              )}
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
                clinicData?.is_active
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              {suspending ? 'Actualizando...' : (clinicData?.is_active ? 'Suspender' : 'Activar')}
            </button>
            <button
              onClick={handleChangeToPro}
              disabled={changingPlan}
              className="w-full bg-teal-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60"
            >
              {changingPlan ? 'Solicitando...' : 'Cambiar a Professional'}
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
