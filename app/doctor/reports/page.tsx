'use client'

import { useState, useEffect } from 'react'
import { Download, Loader2, BarChart3, Calendar, User, FileBarChart, ArrowRight, X, Clock, UserX, Repeat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type ConsultationRecord = {
  id: string
  consultation_code: string
  patient_name: string
  patient_cedula?: string
  chief_complaint: string
  payment_method: string
  amount: number
  consultation_date: string
  status?: string
  payment_status?: string
  duration_minutes?: number
  patient_id?: string
}

export default function ReportsPage() {
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterError, setFilterError] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')
  const [hoursPerWeek, setHoursPerWeek] = useState<string>('—')
  const [noShowRate, setNoShowRate] = useState<string>('—')
  const [retention, setRetention] = useState<{ patients: number; percentage: string }>({ patients: 0, percentage: '—' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      const { data } = await supabase
        .from('consultations')
        .select('id, consultation_code, chief_complaint, payment_method, amount, consultation_date, status, payment_status, duration_minutes, patient_id, patients(full_name, id_number)')
        .eq('doctor_id', user.id)
        .order('consultation_date', { ascending: false })

      const records: ConsultationRecord[] = (data ?? []).map(c => ({
        id: c.id,
        consultation_code: c.consultation_code,
        patient_name: (!Array.isArray(c.patients) && c.patients) ? (c.patients as any).full_name : 'Paciente desconocido',
        patient_cedula: (!Array.isArray(c.patients) && c.patients) ? (c.patients as any).id_number : undefined,
        chief_complaint: c.chief_complaint || '',
        payment_method: c.payment_method || 'No especificado',
        amount: c.amount || 0,
        consultation_date: c.consultation_date,
        status: c.status,
        payment_status: c.payment_status,
        duration_minutes: c.duration_minutes,
        patient_id: c.patient_id,
      }))
      setConsultations(records)

      // Calcular estadísticas
      calculateStats(records, user.id, supabase)
      setLoading(false)
    })
  }, [])

  const calculateStats = async (records: ConsultationRecord[], userId: string, supabase: any) => {
    // 1. Horas de consulta por semana
    try {
      if (records.length > 0) {
        const totalMinutes = records.reduce((sum, c) => sum + (c.duration_minutes || 30), 0)
        const totalHours = totalMinutes / 60
        const weeks = new Set<string>()
        records.forEach(c => {
          const date = new Date(c.consultation_date)
          const weekStart = new Date(date)
          weekStart.setDate(date.getDate() - date.getDay())
          weeks.add(weekStart.toISOString().split('T')[0])
        })
        const avgHoursPerWeek = weeks.size > 0 ? totalHours / weeks.size : 0
        setHoursPerWeek(avgHoursPerWeek.toFixed(1))
      }
    } catch (err) {
      console.error('Error calculating hours:', err)
    }

    // 2. Tasa de no-show
    try {
      const total = records.length
      let noShow = records.filter(c => {
        if (c.status) return c.status === 'cancelled' || c.status === 'no_show'
        return c.payment_status !== 'paid' && new Date(c.consultation_date) < new Date()
      }).length
      const rate = total > 0 ? ((noShow / total) * 100).toFixed(1) : '0.0'
      setNoShowRate(rate)
    } catch (err) {
      console.error('Error calculating no-show rate:', err)
    }

    // 3. Retención de pacientes
    try {
      const { data: allConsultations } = await supabase
        .from('consultations')
        .select('patient_id')
        .eq('doctor_id', userId)

      if (allConsultations && allConsultations.length > 0) {
        const patientCounts = {} as Record<string, number>
        allConsultations.forEach((c: any) => {
          if (c.patient_id) {
            patientCounts[c.patient_id] = (patientCounts[c.patient_id] || 0) + 1
          }
        })

        const totalPatients = Object.keys(patientCounts).length
        const returning = Object.values(patientCounts).filter(count => count >= 2).length
        const pct = totalPatients > 0 ? ((returning / totalPatients) * 100).toFixed(0) : '0'
        setRetention({ patients: returning, percentage: pct })
      }
    } catch (err) {
      console.error('Error calculating retention:', err)
    }
  }

  const applyFilter = () => {
    setFilterError('')
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom)
      const to = new Date(dateTo)
      if (from > to) {
        setFilterError('La fecha "Desde" no puede ser mayor que "Hasta"')
        return
      }
    }
    setAppliedFrom(dateFrom)
    setAppliedTo(dateTo)
  }

  const clearFilter = () => {
    setDateFrom('')
    setDateTo('')
    setAppliedFrom('')
    setAppliedTo('')
    setFilterError('')
  }

  const setPreset = (preset: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let from: Date, to: Date

    switch (preset) {
      case 'today':
        from = new Date(today)
        to = new Date(today)
        break
      case 'last7':
        from = new Date(today)
        from.setDate(from.getDate() - 7)
        to = new Date(today)
        break
      case 'thisMonth':
        from = new Date(today.getFullYear(), today.getMonth(), 1)
        to = new Date(today)
        break
      case 'last30':
        from = new Date(today)
        from.setDate(from.getDate() - 30)
        to = new Date(today)
        break
      default:
        return
    }

    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    setDateFrom(formatDate(from))
    setDateTo(formatDate(to))
  }

  function exportToCSV() {
    if (consultations.length === 0) return

    setExporting(true)

    // Filtrar por fechas aplicadas
    let filtered = consultations
    if (appliedFrom) {
      const fromDate = new Date(appliedFrom)
      filtered = filtered.filter(c => new Date(c.consultation_date) >= fromDate)
    }
    if (appliedTo) {
      const toDate = new Date(appliedTo)
      toDate.setHours(23, 59, 59)
      filtered = filtered.filter(c => new Date(c.consultation_date) <= toDate)
    }

    // Encabezados
    const headers = [
      'ID Consulta',
      'Paciente',
      'Cédula',
      'Motivo',
      'Forma de pago',
      'Monto (USD)',
      'Fecha'
    ]

    // Filas
    const rows = filtered.map(c => [
      c.consultation_code,
      c.patient_name,
      c.patient_cedula || '—',
      c.chief_complaint,
      c.payment_method,
      c.amount.toFixed(2),
      new Date(c.consultation_date).toLocaleDateString('es-VE')
    ])

    // Crear CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    // Descargar
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Reporte_Consultas_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setExporting(false)
  }

  const filteredCount = consultations.filter(c => {
    let match = true
    if (appliedFrom) match = match && new Date(c.consultation_date) >= new Date(appliedFrom)
    if (appliedTo) {
      const toDate = new Date(appliedTo)
      toDate.setHours(23, 59, 59)
      match = match && new Date(c.consultation_date) <= toDate
    }
    return match
  }).length

  const totalAmount = consultations
    .filter(c => {
      let match = true
      if (appliedFrom) match = match && new Date(c.consultation_date) >= new Date(appliedFrom)
      if (appliedTo) {
        const toDate = new Date(appliedTo)
        toDate.setHours(23, 59, 59)
        match = match && new Date(c.consultation_date) <= toDate
      }
      return match
    })
    .reduce((sum, c) => sum + c.amount, 0)

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-teal-500" /> <span>Reportería de Consultas</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Exporta datos de tus consultas a CSV para análisis en Excel</p>
        </div>

        {/* New KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-teal-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Horas de consulta</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{hoursPerWeek}</p>
                <p className="text-xs text-slate-500 mt-1">hrs/semana</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                <UserX className="w-5 h-5 text-teal-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Tasa de no-show</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{noShowRate}</p>
                <p className="text-xs text-slate-500 mt-1">% de consultas</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                <Repeat className="w-5 h-5 text-teal-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Retención de pacientes</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{retention.patients}</p>
                <p className="text-xs text-slate-500 mt-1">pacientes · {retention.percentage}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-teal-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">Total</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{consultations.length}</p>
            <p className="text-xs text-slate-500 mt-1">Consultas registradas</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <User className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">Filtrados</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{filteredCount}</p>
            <p className="text-xs text-slate-500 mt-1">En el rango seleccionado</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">Ingresos</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">${totalAmount.toFixed(0)}</p>
            <p className="text-xs text-slate-500 mt-1">USD en consultas</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Rango de fechas (opcional)</p>
            {(appliedFrom || appliedTo) && (
              <button
                onClick={clearFilter}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" /> Limpiar filtro
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
              />
            </div>
          </div>

          {filterError && (
            <p className="text-xs text-red-600 font-medium">{filterError}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={applyFilter}
              className="g-bg text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-all"
            >
              <ArrowRight className="w-4 h-4" /> Aplicar
            </button>

            <button
              onClick={() => setPreset('today')}
              className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-all"
            >
              Hoy
            </button>

            <button
              onClick={() => setPreset('last7')}
              className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-all"
            >
              Últimos 7 días
            </button>

            <button
              onClick={() => setPreset('thisMonth')}
              className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-all"
            >
              Este mes
            </button>

            <button
              onClick={() => setPreset('last30')}
              className="px-3 py-1 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-all"
            >
              Últimos 30 días
            </button>
          </div>

          {(appliedFrom || appliedTo) && (
            <p className="text-xs text-slate-600 bg-teal-50 px-3 py-2 rounded-lg border border-teal-200">
              Filtro activo: {appliedFrom && `desde ${new Date(appliedFrom).toLocaleDateString('es-VE')}`}
              {appliedFrom && appliedTo && ' '}
              {appliedTo && `hasta ${new Date(appliedTo).toLocaleDateString('es-VE')}`}
            </p>
          )}
        </div>

        {/* Export Button */}
        <button
          onClick={exportToCSV}
          disabled={loading || exporting || consultations.length === 0}
          className="w-full g-bg text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Exportando...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" /> Exportar a CSV
            </>
          )}
        </button>

        {/* Consultations Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando consultas...
          </div>
        ) : consultations.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl py-12 text-center">
            <BarChart3 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Sin consultas registradas</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left font-semibold text-slate-700">ID Consulta</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-700">Paciente</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-700">Cédula</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-700">Motivo</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-700">Pago</th>
                    <th className="px-5 py-3 text-right font-semibold text-slate-700">Monto</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-700">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {consultations.map((c, i) => (
                    <tr key={c.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/doctor/consultations?id=${c.id}`}
                          className="font-mono text-teal-600 hover:text-teal-700 underline transition-colors"
                        >
                          {c.consultation_code}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{c.patient_name}</td>
                      <td className="px-5 py-3 text-slate-600">{c.patient_cedula || '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{c.chief_complaint}</td>
                      <td className="px-5 py-3 text-xs bg-slate-100 rounded px-2 py-1 inline-block text-slate-700 font-semibold">{c.payment_method}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-600">${c.amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-slate-600">{new Date(c.consultation_date).toLocaleDateString('es-VE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
