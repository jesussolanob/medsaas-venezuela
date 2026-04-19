'use client'

import { useState } from 'react'
import {
  CheckCircle2, XCircle, Loader2, UserCheck, Clock, Users,
  Stethoscope, Mail, Phone, MapPin
} from 'lucide-react'

type PendingDoctor = {
  subscriptionId: string
  doctorId: string
  name: string
  email: string
  specialty: string | null
  phone: string | null
  location: string | null
  plan: string
  status: string
  registeredAt: string
  trialEndsAt: string
}

type ApprovedDoctor = {
  subscriptionId: string
  doctorId: string
  name: string
  email: string
  specialty: string | null
  plan: string
  activatedAt: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Hace menos de 1 hora'
  if (h < 24) return `Hace ${h}h`
  const d = Math.floor(h / 24)
  return `Hace ${d}d`
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export default function ApprovalsClient({
  pending: initialPending,
  approved: initialApproved,
}: {
  pending: PendingDoctor[]
  approved: ApprovedDoctor[]
}) {
  const [pending, setPending] = useState(initialPending)
  const [approved, setApproved] = useState(initialApproved)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showApproved, setShowApproved] = useState(false)

  async function handleActivate(doc: PendingDoctor) {
    setActivatingId(doc.subscriptionId)
    setError(null)
    try {
      const res = await fetch('/api/admin/extend-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: doc.subscriptionId, days: 365, activate: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al activar')
        return
      }
      setPending(prev => prev.filter(d => d.subscriptionId !== doc.subscriptionId))
      setApproved(prev => [{
        subscriptionId: doc.subscriptionId,
        doctorId: doc.doctorId,
        name: doc.name,
        email: doc.email,
        specialty: doc.specialty,
        plan: doc.plan,
        activatedAt: new Date().toISOString(),
      }, ...prev])
      setSuccess(`${doc.name} activado en la beta privada`)
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError('Error de conexión')
    } finally {
      setActivatingId(null)
    }
  }

  async function handleReject(doc: PendingDoctor) {
    if (!confirm(`¿Rechazar a ${doc.name}? Su cuenta será suspendida.`)) return
    setRejectingId(doc.subscriptionId)
    setError(null)
    try {
      const res = await fetch('/api/admin/extend-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: doc.subscriptionId, days: 0, suspend: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al rechazar')
        return
      }
      setPending(prev => prev.filter(d => d.subscriptionId !== doc.subscriptionId))
      setSuccess(`${doc.name} rechazado`)
      setTimeout(() => setSuccess(null), 3000)
    } catch {
      setError('Error de conexión')
    } finally {
      setRejectingId(null)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 p-5 text-white">
        <h2 className="text-lg font-bold">Beta Privada — Aprobaciones</h2>
        <p className="text-sm text-white/70 mt-1">Médicos que quieren unirse a la beta privada de Delta</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-500 font-medium">Pendientes</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{pending.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-500 font-medium">Activos en beta</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{approved.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 hidden sm:block">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-teal-500" />
            <span className="text-xs text-slate-500 font-medium">Total registrados</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{pending.length + approved.length}</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* Pending doctors */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            Solicitudes pendientes
            {pending.length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {pending.length}
              </span>
            )}
          </h3>
        </div>

        {pending.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm text-slate-600 font-medium">No hay solicitudes pendientes</p>
            <p className="text-xs text-slate-400 mt-1">Todos los médicos registrados han sido procesados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map(doc => {
              const trialDays = daysUntil(doc.trialEndsAt)
              return (
                <div key={doc.subscriptionId} className="px-5 py-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {getInitials(doc.name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{doc.name}</p>
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Trial — {trialDays}d restantes
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {doc.specialty && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" /> {doc.specialty}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {doc.email}
                        </span>
                        {doc.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {doc.phone}
                          </span>
                        )}
                        {doc.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {doc.location}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Registrado {timeAgo(doc.registeredAt)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleReject(doc)}
                        disabled={rejectingId === doc.subscriptionId || activatingId === doc.subscriptionId}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {rejectingId === doc.subscriptionId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleActivate(doc)}
                        disabled={activatingId === doc.subscriptionId || rejectingId === doc.subscriptionId}
                        className="flex items-center gap-1.5 text-xs text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium"
                      >
                        {activatingId === doc.subscriptionId ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Activando...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aprobar beta
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Approved doctors (collapsible) */}
      {approved.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowApproved(!showApproved)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <h3 className="text-sm font-bold text-slate-800">
              Médicos activos en beta
              <span className="ml-2 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full px-2 py-0.5">
                {approved.length}
              </span>
            </h3>
            <span className="text-xs text-slate-400">{showApproved ? 'Ocultar' : 'Ver'}</span>
          </button>

          {showApproved && (
            <div className="border-t border-slate-100">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-500">Médico</th>
                      <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-500">Especialidad</th>
                      <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-500">Email</th>
                      <th className="text-left py-2.5 px-5 text-xs font-semibold text-slate-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approved.map(doc => (
                      <tr key={doc.subscriptionId} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-5 font-medium text-slate-900">{doc.name}</td>
                        <td className="py-2.5 px-5 text-slate-600">{doc.specialty || '—'}</td>
                        <td className="py-2.5 px-5 text-slate-500 text-xs">{doc.email}</td>
                        <td className="py-2.5 px-5">
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Activo
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
