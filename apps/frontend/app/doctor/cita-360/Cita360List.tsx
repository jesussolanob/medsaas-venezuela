'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Calendar, Stethoscope, DollarSign, ChevronRight, X, Filter } from 'lucide-react'

export type Cita360Row = {
  id: string
  appointment_code: string
  status: string
  scheduled_at: string
  mode: string | null
  patient_name: string
  consultation_code: string | null
  consultation_status: string | null
  payment_code: string | null
  payment_status: string | null
  payment_amount: number | null
}

const STATUS_CITA: Record<string, { label: string; color: string }> = {
  scheduled:   { label: 'Agendada',   color: 'bg-amber-50 text-amber-700' },
  confirmed:   { label: 'Confirmada', color: 'bg-cyan-50 text-cyan-700' },
  completed:   { label: 'Atendida',   color: 'bg-emerald-50 text-emerald-700' },
  cancelled:   { label: 'Cancelada',  color: 'bg-red-50 text-red-700' },
  rescheduled: { label: 'Reagendada', color: 'bg-violet-50 text-violet-700' },
  no_show:     { label: 'No asistió', color: 'bg-orange-50 text-orange-700' },
  pending:     { label: 'Pendiente',  color: 'bg-slate-100 text-slate-600' },
}

const STATUS_PAGO: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pendiente', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Aprobado',  color: 'bg-emerald-50 text-emerald-700' },
}

function StatusPill({ map, status }: { map: Record<string, any>, status: string | null }) {
  const cfg = map[status || ''] || { label: status || '—', color: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Cita360List({ rows }: { rows: Cita360Row[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (search.trim()) {
        const s = search.toLowerCase()
        const match =
          r.patient_name?.toLowerCase().includes(s) ||
          r.appointment_code?.toLowerCase().includes(s) ||
          r.consultation_code?.toLowerCase().includes(s) ||
          r.payment_code?.toLowerCase().includes(s)
        if (!match) return false
      }
      if (statusFilter && r.status !== statusFilter) return false
      return true
    })
  }, [rows, search, statusFilter])

  return (
    <>
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Buscar y filtrar</h3>
          {(search || statusFilter) && (
            <button onClick={() => { setSearch(''); setStatusFilter('') }} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 ml-2">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Paciente, código de cita, consulta o pago…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400 box-border"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400 bg-white"
          >
            <option value="">Todos los estados de cita</option>
            <option value="scheduled">Agendada</option>
            <option value="confirmed">Confirmada</option>
            <option value="completed">Atendida</option>
            <option value="cancelled">Cancelada</option>
            <option value="rescheduled">Reagendada</option>
            <option value="no_show">No asistió</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Citas ({filtered.length} de {rows.length})
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-slate-400 text-sm">
            No se encontraron citas con esos filtros
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(r => (
              <li key={r.id}>
                <Link
                  href={`/doctor/cita-360/${r.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  {/* Fecha + paciente */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{r.patient_name}</p>
                      <StatusPill map={STATUS_CITA} status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500">{fmtDate(r.scheduled_at)} · {r.mode === 'online' ? '💻 Online' : '🏥 Presencial'}</p>
                  </div>

                  {/* Códigos */}
                  <div className="hidden md:flex flex-col items-start gap-1 text-[10px] font-mono">
                    <span className="text-cyan-700">{r.appointment_code}</span>
                    {r.consultation_code && <span className="text-teal-700">{r.consultation_code}</span>}
                    {r.payment_code && <span className="text-orange-700">{r.payment_code}</span>}
                  </div>

                  {/* Pago */}
                  <div className="hidden lg:flex flex-col items-end gap-1">
                    <StatusPill map={STATUS_PAGO} status={r.payment_status} />
                    {r.payment_amount != null && (
                      <span className="text-xs text-slate-600 font-semibold">${Number(r.payment_amount).toFixed(2)}</span>
                    )}
                  </div>

                  <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
