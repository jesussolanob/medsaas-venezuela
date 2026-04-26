'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBcvRate } from '@/lib/useBcvRate'
import { fetchPayments as sharedFetchPayments, formatUsd, formatBs } from '@/lib/finances'
import {
  Receipt, Search, Download, DollarSign, CheckCircle, Clock,
  XCircle, Calendar, ArrowRight, Loader2, RefreshCw, Filter,
  TrendingUp, Banknote, X, CreditCard, FileText, ExternalLink, Upload
} from 'lucide-react'

type CobrosTab = 'pending' | 'approved'

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
  _source?: 'appointment' | 'consultation'
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
  const { rate: bcvRate, loading: bcvLoading, toBs } = useBcvRate()

  // Date range for export
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [showExport, setShowExport] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  async function handleReceiptUpload(file: File) {
    if (!selectedPayment) return
    setUploadingReceipt(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `receipts/${user.id}/${selectedPayment.id}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('payment-receipts')
        .upload(filePath, file, { upsert: true, contentType: file.type })

      if (uploadErr) {
        // Try creating the bucket if it doesn't exist
        await supabase.storage.createBucket('payment-receipts', { public: true })
        const { error: retryErr } = await supabase.storage
          .from('payment-receipts')
          .upload(filePath, file, { upsert: true, contentType: file.type })
        if (retryErr) throw retryErr
      }

      const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(filePath)
      const publicUrl = urlData.publicUrl

      // Update the appointment record with the receipt URL
      await supabase.from('appointments')
        .update({ payment_receipt_url: publicUrl })
        .eq('id', selectedPayment.id)

      // Update local state
      setSelectedPayment(prev => prev ? { ...prev, payment_receipt_url: publicUrl } : null)
      setPayments(prev => prev.map(p => p.id === selectedPayment.id ? { ...p, payment_receipt_url: publicUrl } : p))
    } catch (err) {
      console.error('Error uploading receipt:', err)
      alert('Error al subir el comprobante')
    } finally {
      setUploadingReceipt(false)
    }
  }

  // BCV rate now comes from useBcvRate() hook

  // FUENTE UNICA (ronda 15): leer de tabla `payments` via helper compartido.
  // Tab 'approved' = dinero real cobrado. Tab 'pending' = por cobrar.
  // Antes leia de `appointments.status` (legacy) lo que causaba drift con el dashboard.
  const fetchPayments = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = await sharedFetchPayments(supabase, {
      doctorId: user.id,
      status: tab,  // 'pending' | 'approved'
    })

    // Adaptar al shape Payment de esta vista
    setPayments(rows.map(p => ({
      id: p.id,
      patient_name: p.appointment?.patient_name || 'Paciente',
      plan_name: p.appointment?.plan_name || null,
      plan_price: p.amount_usd,
      payment_method: p.method_snapshot || null,
      status: p.status,
      scheduled_at: p.appointment?.scheduled_at || p.created_at,
      // Codigo unificado: consultation_code como maestro, appointment_code como fallback
      appointment_code: p.consultation?.consultation_code || p.appointment?.appointment_code || p.payment_code || '',
      payment_receipt_url: p.appointment?.payment_receipt_url || null,
      _source: 'appointment' as const,
    })))
    setLoading(false)
  }, [tab])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  // REFRESH AUTOMATICO (ronda 15): si otra pestaña/vista cambia un pago en `payments`,
  // suscribirse a Supabase Realtime y refrescar para evitar saldos stale.
  useEffect(() => {
    const supabase = createClient()
    let channel: any = null
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channel = supabase
        .channel('cobros-payments-watch')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments', filter: `doctor_id=eq.${user.id}` },
          () => { fetchPayments() }
        )
        .subscribe()
    })()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [fetchPayments])

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

    // CODIGO UNIFICADO (ronda 13): exportamos consultation_code en la columna "Código"
    const { data } = await supabase
      .from('appointments')
      .select('patient_name, plan_name, plan_price, payment_method, status, scheduled_at, appointment_code, consultations(consultation_code)')
      .eq('doctor_id', user.id)
      .neq('source', 'google_calendar')
      .gte('scheduled_at', `${dateFrom}T00:00:00`)
      .lte('scheduled_at', `${dateTo}T23:59:59`)
      .order('scheduled_at', { ascending: false })

    if (!data || data.length === 0) {
      alert('No hay datos en ese rango de fechas')
      return
    }

    const headers = ['Fecha', 'Paciente', 'Servicio', 'Monto USD', 'Monto Bs', 'Método de Pago', 'Estado', 'Código']
    const rows = data.map(r => {
      const consNested = (r as any).consultations
      const consCode = Array.isArray(consNested) ? consNested[0]?.consultation_code : consNested?.consultation_code
      return [
        new Date(r.scheduled_at).toLocaleDateString('es-VE'),
        r.patient_name || '',
        r.plan_name || '',
        (r.plan_price || 0).toFixed(2),
        bcvRate ? ((r.plan_price || 0) * bcvRate).toFixed(2) : 'N/A',
        PAYMENT_METHOD_LABELS[r.payment_method || ''] || r.payment_method || '',
        r.status || '',
        consCode || r.appointment_code || '',
      ]
    })

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

  async function updatePaymentStatus(id: string, newStatus: string) {
    setUpdatingStatus(true)
    const supabase = createClient()

    // BUG-012 fix: actualizar 3 fuentes para mantener sincronía
    //  1. payments.status (source of truth nuevo)
    //  2. consultations.payment_status (mirror legacy)
    //  3. appointments.status (display de cobros legacy)

    // 1. Buscar payment_id de la appointment
    const { data: appt } = await supabase
      .from('appointments')
      .select('payment_id, consultation_id')
      .eq('id', id)
      .single()

    // 2. Update appointments (legacy display)
    await supabase.from('appointments').update({ status: newStatus }).eq('id', id)

    // 3. Update payments (source of truth)
    if (appt?.payment_id) {
      const paymentStatus = newStatus === 'completed' ? 'approved' : 'pending'
      await supabase
        .from('payments')
        .update({
          status: paymentStatus,
          paid_at: paymentStatus === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', appt.payment_id)
    }

    // 4. Update consultation mirror
    if (appt?.consultation_id) {
      const consPayStatus = newStatus === 'completed' ? 'approved' : 'pending'
      await supabase
        .from('consultations')
        .update({ payment_status: consPayStatus })
        .eq('id', appt.consultation_id)
    }

    setUpdatingStatus(false)
    setSelectedPayment(null)
    fetchPayments()
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric'
  })

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', {
    hour: '2-digit', minute: '2-digit', hour12: true
  })

  // Tabs del módulo de Cobros — solo 2 estados de pago
  const tabs: { key: CobrosTab; label: string; icon: any; color: string }[] = [
    { key: 'pending', label: 'Pendientes', icon: Clock, color: 'amber' },
    { key: 'approved', label: 'Aprobados', icon: CheckCircle, color: 'emerald' },
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
          <p className="text-2xl font-bold text-slate-900">{formatUsd(totalUSD)}</p>
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
              <p className="text-2xl font-bold text-slate-900">{formatBs(totalBs)}</p>
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
              <div key={p.id} onClick={() => setSelectedPayment(p)} className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors items-center cursor-pointer">
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
                    {formatUsd(p.plan_price)}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs text-slate-500">
                    {bcvRate ? formatBs((p.plan_price || 0) * bcvRate) : '—'}
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

      {/* Detail drawer */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex" onClick={() => setSelectedPayment(null)}>
          <div className="ml-auto w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Detalle del cobro</h3>
              <button onClick={() => setSelectedPayment(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Patient info */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">Paciente</p>
                <p className="text-lg font-bold text-slate-900">{selectedPayment.patient_name || 'Sin nombre'}</p>
                {selectedPayment.appointment_code && (
                  <p className="text-xs font-mono text-slate-400">Código: {selectedPayment.appointment_code}</p>
                )}
              </div>

              {/* Service & amount */}
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-4 border border-teal-100 space-y-2">
                <p className="text-xs font-semibold text-slate-500">Servicio</p>
                <p className="text-sm font-bold text-slate-800">{selectedPayment.plan_name || '—'}</p>
                <div className="flex items-baseline gap-2 pt-1">
                  <span className="text-2xl font-bold text-teal-600">{formatUsd(selectedPayment.plan_price)}</span>
                  <span className="text-xs text-slate-400">USD</span>
                  {bcvRate && (
                    <span className="text-sm text-slate-500 ml-2">
                      = {formatBs((selectedPayment.plan_price || 0) * bcvRate)}
                    </span>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="flex items-center gap-3 py-3 border-b border-slate-100">
                <Calendar className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-700">{formatDate(selectedPayment.scheduled_at)}</p>
                  <p className="text-xs text-slate-400">{formatTime(selectedPayment.scheduled_at)}</p>
                </div>
              </div>

              {/* Payment method */}
              <div className="flex items-center gap-3 py-3 border-b border-slate-100">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase">Método de pago</p>
                  <p className="text-sm font-medium text-slate-700">
                    {PAYMENT_METHOD_LABELS[selectedPayment.payment_method || ''] || selectedPayment.payment_method || 'No especificado'}
                  </p>
                </div>
              </div>

              {/* Receipt/comprobante */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Comprobante
                </p>
                {selectedPayment.payment_receipt_url ? (
                  <div className="space-y-2">
                    {selectedPayment.payment_receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <a href={selectedPayment.payment_receipt_url} target="_blank" rel="noopener noreferrer">
                        <img src={selectedPayment.payment_receipt_url} alt="Comprobante"
                          className="w-full rounded-xl border border-slate-200 hover:opacity-90 transition-opacity" />
                      </a>
                    ) : (
                      <a href={selectedPayment.payment_receipt_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium">
                        <ExternalLink className="w-4 h-4" /> Ver comprobante adjunto
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400 italic">Sin comprobante adjunto</p>
                    <label className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50/50 cursor-pointer transition-all ${uploadingReceipt ? 'opacity-60 pointer-events-none' : ''}`}>
                      {uploadingReceipt ? (
                        <><Loader2 className="w-4 h-4 animate-spin text-teal-500" /> <span className="text-sm text-teal-600 font-medium">Subiendo...</span></>
                      ) : (
                        <><Upload className="w-4 h-4 text-slate-400" /> <span className="text-sm text-slate-600 font-medium">Subir comprobante</span></>
                      )}
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleReceiptUpload(file)
                        e.target.value = ''
                      }} />
                    </label>
                  </div>
                )}
              </div>

              {/* Current status — solo 2 estados de PAGO */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">Estado del pago</p>
                <span className={`inline-flex text-sm font-semibold px-3 py-1.5 rounded-full ${
                  selectedPayment.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {selectedPayment.status === 'completed' ? 'Aprobado' : 'Pendiente'}
                </span>
              </div>

              {/* Change status — SOLO 2 opciones (el pago no se cancela, o está pendiente o aprobado) */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">Cambiar estado del pago</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updatePaymentStatus(selectedPayment.id, 'scheduled')}
                    disabled={updatingStatus || selectedPayment.status === 'scheduled' || selectedPayment.status === 'pending'}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all disabled:opacity-40 border-amber-200 text-amber-600 hover:bg-amber-50"
                  >
                    <Clock className="w-3.5 h-3.5" /> Pendiente
                  </button>
                  <button
                    onClick={() => updatePaymentStatus(selectedPayment.id, 'completed')}
                    disabled={updatingStatus || selectedPayment.status === 'completed'}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all disabled:opacity-40 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Aprobar
                  </button>
                </div>
                {updatingStatus && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Actualizando...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
