'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Receipt, Search, Download, DollarSign, CheckCircle, Clock,
  XCircle, Calendar, ArrowRight, Loader2, RefreshCw, Filter,
  TrendingUp, Banknote
} from 'lucide-react'

type CobrosTab = 'pending' | 'approved' | 'cancelled'

type Payment = {
  id: string
  patient_name: string
  plan_name: string | null
  plan_price: number | null
  payment_method: string | null
  status: string
  scheduled_at: string
  appointment_code?: string
  payment_receipt_url?: string | null
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  transferencia: 'Transferencia',
  zelle: 'Zelle',
  binance: 'Binance',
  efectivo_usd: 'Efectivo USD',
  efectivo_bs: 'Efectivo Bs',
  pos: 'POS',
  package: 'Paquete prepagado',
}

export default function CobrosPage() {
  const [tab, setTab] = useState<CobrosTab>('pending')
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [bcvRate, setBcvRate] = useState<number | null>(null)
  const [bcvLoading, setBcvLoading] = useState(true)

  // Date range for export
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [showExport, setShowExport] = useState(false)

  // Fetch BCV rate
  useEffect(() => {
    async function fetchBcvRate() {
      try {
        const res = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
          next: { revalidate: 3600 },
        })
        if (res.ok) {
          const data = await res.json()
          const rate = data?.monitors?.usd?.price
          if (rate) setBcvRate(parseFloat(rate))
        }
      } catch {
        // fallback rate
        setBcvRate(null)
      } finally {
        setBcvLoading(false)
      }
    }
    fetchBcvRate()
  }, [])

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let statusFilter: string[]
    switch (tab) {
      case 'pending':
        statusFilter = ['scheduled', 'pending', 'confirmed']
        break
      case 'approved':
        statusFilter = ['completed']
        break
      case 'cancelled':
        statusFilter = ['cancelled']
        break
    }

    const { data } = await supabase
      .from('appointments')
      .select('id, patient_name, plan_name, plan_price, payment_method, status, scheduled_at, appointment_code, payment_receipt_url')
      .eq('doctor_id', user.id)
      .in('status', statusFilter)
      .order('scheduled_at', { ascending: false })
      .limit(200)

    setPayments(data || [])
    setLoading(false)
  }, [tab])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const filtered = payments.filter(p => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      p.patient_name?.toLowerCase().includes(q) ||
      p.plan_name?.toLowerCase().includes(q) ||
      p.appointment_code?.toLowerCase().includes(q)
    )
  })

  const totalUSD = filtered.reduce((sum, p) => sum + (p.plan_price || 0), 0)
  const totalBs = bcvRate ? totalUSD * bcvRate : null

  // Export to CSV/Excel
  async function exportExcel() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('appointments')
      .select('patient_name, plan_name, plan_price, payment_method, status, scheduled_at, appointment_code')
      .eq('doctor_id', user.id)
      .gte('scheduled_at', `${dateFrom}T00:00:00`)
      .lte('scheduled_at', `${dateTo}T23:59:59`)
      .order('scheduled_at', { ascending: false })

    if (!data || data.length === 0) {
      alert('No hay datos en ese rango de fechas')
      return
    }

    const headers = ['Fecha', 'Paciente', 'Servicio', 'Monto USD', 'Monto Bs', 'Método de Pago', 'Estado', 'Código']
    const rows = data.map(r => [
      new Date(r.scheduled_at).toLocaleDateString('es-VE'),
      r.patient_name || '',
      r.plan_name || '',
      (r.plan_price || 0).toFixed(2),
      bcvRate ? ((r.plan_price || 0) * bcvRate).toFixed(2) : 'N/A',
      PAYMENT_METHOD_LABELS[r.payment_method || ''] || r.payment_method || '',
      r.status || '',
      r.appointment_code || '',
    ])

    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cobros_${dateFrom}_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric'
  })

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', {
    hour: '2-digit', minute: '2-digit', hour12: true
  })

  const tabs: { key: CobrosTab; label: string; icon: any; color: string }[] = [
    { key: 'pending', label: 'Pendientes', icon: Clock, color: 'amber' },
    { key: 'approved', label: 'Aprobadas', icon: CheckCircle, color: 'emerald' },
    { key: 'cancelled', label: 'Canceladas', icon: XCircle, color: 'red' },
  ]

  return (
    <div className="space-y-6">
      {/* Header with totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-teal-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Total USD</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">${totalUSD.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-teal-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Bs</span>
          </div>
          {bcvLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span className="text-sm text-slate-400">Cargando tasa BCV...</span>
            </div>
          ) : totalBs !== null ? (
            <>
              <p className="text-2xl font-bold text-slate-900">Bs {totalBs.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-1">Tasa BCV: {bcvRate?.toFixed(2)} Bs/$</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Tasa no disponible</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-5 h-5 text-teal-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Exportar</span>
          </div>
          {!showExport ? (
            <button
              onClick={() => setShowExport(true)}
              className="text-sm font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              Exportar a Excel <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
              <div className="flex gap-2">
                <button onClick={exportExcel}
                  className="flex-1 text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 rounded-lg py-1.5 transition-colors">
                  Descargar
                </button>
                <button onClick={() => setShowExport(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar paciente o servicio..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:border-teal-400 focus:ring-1 focus:ring-teal-100 outline-none"
          />
        </div>
      </div>

      {/* Payment list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No hay registros {tab === 'pending' ? 'pendientes' : tab === 'approved' ? 'aprobados' : 'cancelados'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
              <div className="col-span-3">Paciente</div>
              <div className="col-span-2">Servicio</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2">Método</div>
              <div className="col-span-1 text-right">USD</div>
              <div className="col-span-1 text-right">Bs</div>
              <div className="col-span-1 text-center">Estado</div>
            </div>

            {filtered.map(p => (
              <div key={p.id} className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors items-center">
                <div className="col-span-3">
                  <p className="text-sm font-medium text-slate-900">{p.patient_name || 'Sin nombre'}</p>
                  {p.appointment_code && (
                    <p className="text-xs text-slate-400 mt-0.5">#{p.appointment_code}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-slate-600">{p.plan_name || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500">{formatDate(p.scheduled_at)}</p>
                  <p className="text-xs text-slate-400">{formatTime(p.scheduled_at)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500">
                    {PAYMENT_METHOD_LABELS[p.payment_method || ''] || p.payment_method || '—'}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-sm font-semibold text-slate-900">
                    ${(p.plan_price || 0).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs text-slate-500">
                    {bcvRate ? `Bs ${((p.plan_price || 0) * bcvRate).toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="col-span-1 text-center">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    p.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : p.status === 'cancelled'
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {p.status === 'completed' ? 'Aprobada' : p.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
