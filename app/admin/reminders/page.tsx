import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

export default async function RemindersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reminders } = await supabase
    .from('reminders_queue')
    .select('*, appointments(scheduled_at, title), profiles(full_name)')
    .order('scheduled_for', { ascending: true })
    .limit(50)

  const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    pending: { label: 'Pendiente', icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50' },
    sent:    { label: 'Enviado',   icon: CheckCircle,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    failed:  { label: 'Fallido',   icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50' },
    cancelled: { label: 'Cancelado', icon: AlertCircle, color: 'text-slate-400',  bg: 'bg-slate-50' },
  }

  const pending = reminders?.filter(r => r.status === 'pending').length ?? 0
  const sent    = reminders?.filter(r => r.status === 'sent').length ?? 0
  const failed  = reminders?.filter(r => r.status === 'failed').length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Recordatorios</h2>
        <p className="text-slate-500 text-sm mt-1">Monitor de la cola de envíos</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-amber-100 p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">{pending}</p>
          <p className="text-xs text-slate-400 mt-1">Pendientes</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 p-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">{sent}</p>
          <p className="text-xs text-slate-400 mt-1">Enviados</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-3">
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">{failed}</p>
          <p className="text-xs text-slate-400 mt-1">Fallidos</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Paciente</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Tipo</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Canal</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Programado</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!reminders || reminders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-sm">
                  No hay recordatorios en la cola todavía
                </td>
              </tr>
            ) : (
              reminders.map((r) => {
                const config = statusConfig[r.status] ?? statusConfig.pending
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {r.profiles?.full_name ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-teal-50 text-teal-600 px-2 py-1 rounded-full font-medium">
                        {r.offset_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 capitalize">{r.channel}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(r.scheduled_for).toLocaleString('es-VE')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full w-fit ${config.bg} ${config.color}`}>
                        <config.icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}