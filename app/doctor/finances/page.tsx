'use client'

// L7 (2026-04-29): añadidos KPIs (consultas/mes, pacientes únicos, crecimiento MoM),
// dropdown de meses (últimos 12), gráfico Recharts de ingresos vs egresos
// (últimos 6 meses) y exportación CSV de consultas con diagnóstico/duración.
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBcvRate } from '@/lib/useBcvRate'
import { fetchPayments as sharedFetchPayments, formatUsd, formatBs } from '@/lib/finances'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3,
  Plus, Trash2, Loader2, ChevronLeft, ChevronRight, Search, Calendar, Download,
  Users, ClipboardList, Activity, FileSpreadsheet, Eye, X,
  FileText, Stethoscope, Pill, MessageCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend,
} from 'recharts'

type Income = {
  id: string
  patient_name: string
  amount_usd: number
  payment_method: string
  date: string
  consultation_code?: string
}

type Expense = {
  id: string
  vendor_name: string
  concept: string
  amount: number
  due_date: string
  paid: boolean
  notes?: string
}

// L7 (2026-04-29): row de la cuadrícula descargable de consultas.
// 2026-04-30: extendida con campos para el modal de detalle (motivo, tratamiento,
// prescripción, método pago, modalidad, etc.) — UX request del usuario.
type ConsultationRow = {
  id: string
  consultation_code: string | null
  consultation_date: string | null
  patient_name: string
  patient_email: string | null
  patient_phone: string | null
  patient_cedula: string | null
  appointment_status: string | null      // scheduled|confirmed|cancelled|completed|no_show
  consultation_status: string | null     // completed|no_show (post-cita)
  payment_status: string | null          // pending|approved
  duration_minutes: number | null
  diagnosis: string | null
  amount_usd: number | null
  plan_name: string | null
  // Detalle clínico
  chief_complaint: string | null
  treatment: string | null
  notes: string | null
  blocks_data: Record<string, unknown> | null
  blocks_snapshot: Array<{ key: string; label: string; printable?: boolean }> | null
  // Detalle de la cita
  scheduled_at: string | null
  appointment_mode: string | null         // online | in_person
  payment_method: string | null
  payment_reference: string | null
}

const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Alquiler' },
  { value: 'staff', label: 'Personal' },
  { value: 'supplies', label: 'Insumos' },
  { value: 'services', label: 'Servicios' },
  { value: 'taxes', label: 'Impuestos' },
  { value: 'other', label: 'Otros' },
]

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

type ViewMode = 'month' | 'week' | 'day'

export default function FinancesPage() {
  const { rate: bcvRate, toBs } = useBcvRate()
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  // L7 (2026-04-29): consultas para el cuadro descargable + KPIs.
  const [consultationsRows, setConsultationsRows] = useState<ConsultationRow[]>([])
  const [loading, setLoading] = useState(true)
  // F3 (2026-04-29): nuevo tab 'reports' (Reportería) — la sección estaba renderizada
  // SIEMPRE en todos los tabs (no estaba envuelta en `tab === 'overview'`),
  // pero quedaba muy abajo del scroll y el usuario no la encontraba. Ahora vive
  // en su propio tab con icono BarChart3.
  const [tab, setTab] = useState<'overview' | 'income' | 'expenses' | 'reports'>('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  // L7 (2026-04-29): mes seleccionado para los KPIs nuevos (formato YYYY-MM,
  // independiente del navegador día/semana/mes existente — afecta solo a los
  // KPI cards del bloque "Reportería" y al gráfico Recharts).
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    vendor_name: '', concept: '', amount: '', category: 'other', due_date: new Date().toISOString().split('T')[0],
  })
  // Date range filters for tables
  const [incomeDateFrom, setIncomeDateFrom] = useState('')
  const [incomeDateTo, setIncomeDateTo] = useState('')
  const [expenseDateFrom, setExpenseDateFrom] = useState('')
  const [expenseDateTo, setExpenseDateTo] = useState('')
  // 2026-04-30: modal de detalle de consulta (UX feature request).
  const [detailRow, setDetailRow] = useState<ConsultationRow | null>(null)

  const supabase = createClient()

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // FUENTE UNICA (ronda 15): leemos pagos APROBADOS desde la tabla `payments`
      // mediante el helper compartido. Garantiza que Dashboard, Cobros y Finanzas
      // muestren EXACTAMENTE el mismo total — sin drift entre appointments.status y payments.status.
      const paid = await sharedFetchPayments(supabase, {
        doctorId: user.id,
        status: 'approved',
      })
      setIncomes(paid.map(p => ({
        id: p.id,
        patient_name: p.appointment?.patient_name || 'Paciente',
        amount_usd: Number(p.amount_usd || 0),
        payment_method: p.method_snapshot || '',
        date: p.appointment?.scheduled_at || p.paid_at || p.created_at,
        consultation_code: p.consultation?.consultation_code || p.appointment?.appointment_code || p.payment_code || '',
      })))

      // Load expenses
      const { data: exp } = await supabase
        .from('accounts_payable')
        .select('*')
        .eq('doctor_id', user.id)
        .order('due_date', { ascending: false })

      setExpenses(exp || [])

      // L7 (2026-04-29): consultas con join a appointment + patient para
      // alimentar KPIs y CSV. 2026-04-30: extendido con detalle clínico completo
      // (motivo/tratamiento/notas/blocks) y detalle de cita (modalidad/método pago).
      const { data: cons } = await supabase
        .from('consultations')
        .select(`
          id, consultation_code, consultation_date, payment_status,
          chief_complaint, diagnosis, treatment, notes,
          duration_minutes, amount, plan_name, blocks_data, blocks_snapshot,
          appointments(status, scheduled_at, appointment_mode, payment_method, payment_reference),
          patients(full_name, email, phone, cedula)
        `)
        .eq('doctor_id', user.id)
        .order('consultation_date', { ascending: false })
        .limit(2000)

      const rows: ConsultationRow[] = (cons || []).map((c: any) => {
        const appt = Array.isArray(c.appointments) ? c.appointments[0] : c.appointments
        const pat = Array.isArray(c.patients) ? c.patients[0] : c.patients
        const apptStatus: string | null = appt?.status ?? null
        const consultationStatus =
          apptStatus === 'completed' || apptStatus === 'no_show' ? apptStatus : null
        return {
          id: c.id,
          consultation_code: c.consultation_code,
          consultation_date: c.consultation_date,
          patient_name: pat?.full_name || 'Paciente',
          patient_email: pat?.email ?? null,
          patient_phone: pat?.phone ?? null,
          patient_cedula: pat?.cedula ?? null,
          appointment_status: apptStatus,
          consultation_status: consultationStatus,
          payment_status: c.payment_status ?? null,
          duration_minutes: c.duration_minutes ?? null,
          diagnosis: c.diagnosis ?? null,
          amount_usd: c.amount != null ? Number(c.amount) : null,
          plan_name: c.plan_name ?? null,
          chief_complaint: c.chief_complaint ?? null,
          treatment: c.treatment ?? null,
          notes: c.notes ?? null,
          blocks_data: c.blocks_data ?? null,
          blocks_snapshot: Array.isArray(c.blocks_snapshot) ? c.blocks_snapshot : null,
          scheduled_at: appt?.scheduled_at ?? null,
          appointment_mode: appt?.appointment_mode ?? null,
          payment_method: appt?.payment_method ?? null,
          payment_reference: appt?.payment_reference ?? null,
        }
      })
      setConsultationsRows(rows)
    } catch (err) {
      console.error('Error loading finances:', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // REFRESH AUTOMATICO (ronda 15): suscripcion realtime a payments para mantener
  // el saldo siempre sincronizado con Dashboard y Cobros sin reload.
  useEffect(() => {
    let channel: any = null
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channel = supabase
        .channel(`finances-payments-watch-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments', filter: `doctor_id=eq.${user.id}` },
          () => { loadData() }
        )
        .subscribe()
    })()
    return () => { if (channel) supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filter data by current period
  const filteredData = useMemo(() => {
    const filterByDate = (dateStr: string) => {
      const d = new Date(dateStr)
      if (viewMode === 'day') {
        return d.toDateString() === currentDate.toDateString()
      } else if (viewMode === 'week') {
        const start = new Date(currentDate)
        start.setDate(start.getDate() - start.getDay())
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        return d >= start && d <= end
      } else {
        return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear()
      }
    }

    const filteredIncomes = incomes.filter(i => filterByDate(i.date))
    const filteredExpenses = expenses.filter(e => filterByDate(e.due_date))

    const totalIncome = filteredIncomes.reduce((sum, i) => sum + (i.amount_usd || 0), 0)
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
    const balance = totalIncome - totalExpenses

    return { filteredIncomes, filteredExpenses, totalIncome, totalExpenses, balance }
  }, [incomes, expenses, viewMode, currentDate])

  // Chart data — last 6 periods
  const chartData = useMemo(() => {
    const periods: { label: string; income: number; expenses: number }[] = []

    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentDate)
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() - i)
        const label = `${MONTHS[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`
        const monthIncomes = incomes.filter(inc => {
          const id = new Date(inc.date)
          return id.getMonth() === d.getMonth() && id.getFullYear() === d.getFullYear()
        })
        const monthExpenses = expenses.filter(exp => {
          const ed = new Date(exp.due_date)
          return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear()
        })
        periods.push({
          label,
          income: monthIncomes.reduce((s, x) => s + (x.amount_usd || 0), 0),
          expenses: monthExpenses.reduce((s, x) => s + (x.amount || 0), 0),
        })
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() - i * 7)
        const start = new Date(d)
        start.setDate(start.getDate() - start.getDay())
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        const label = `${start.getDate()}/${start.getMonth()+1}`
        const weekIncomes = incomes.filter(inc => {
          const id = new Date(inc.date)
          return id >= start && id <= end
        })
        const weekExpenses = expenses.filter(exp => {
          const ed = new Date(exp.due_date)
          return ed >= start && ed <= end
        })
        periods.push({
          label,
          income: weekIncomes.reduce((s, x) => s + (x.amount_usd || 0), 0),
          expenses: weekExpenses.reduce((s, x) => s + (x.amount || 0), 0),
        })
      } else {
        d.setDate(d.getDate() - i)
        const label = `${d.getDate()}/${d.getMonth()+1}`
        const dayIncomes = incomes.filter(inc => new Date(inc.date).toDateString() === d.toDateString())
        const dayExpenses = expenses.filter(exp => new Date(exp.due_date).toDateString() === d.toDateString())
        periods.push({
          label,
          income: dayIncomes.reduce((s, x) => s + (x.amount_usd || 0), 0),
          expenses: dayExpenses.reduce((s, x) => s + (x.amount || 0), 0),
        })
      }
    }
    return periods
  }, [incomes, expenses, viewMode, currentDate])

  const maxChartVal = Math.max(...chartData.map(p => Math.max(p.income, p.expenses)), 1)

  // L7 (2026-04-29): opciones del dropdown — últimos 12 meses.
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      opts.push({ value, label })
    }
    return opts
  }, [])

  // L7 + FIX 2026-04-29: KPIs basados en `reportMonth`.
  // - consultasMes: TOTAL de consultas del mes (independiente de pago) — antes
  //   filtraba por payment_status='approved' y daba 0 cuando habían consultas
  //   pendientes/agendadas. Sub-desglose: aprobadas + pendientes para que el
  //   doctor vea el ratio.
  // - pacientesUnicos: distinct patient_name del mes.
  // - crecimientoMoM: % de consultas totales vs mes anterior.
  const reportKpis = useMemo(() => {
    const [yStr, mStr] = reportMonth.split('-')
    const year = parseInt(yStr, 10)
    const month = parseInt(mStr, 10) - 1
    const prevMonthDate = new Date(year, month - 1, 1)
    const prevYear = prevMonthDate.getFullYear()
    const prevMonth = prevMonthDate.getMonth()

    const inMonth = (d: Date, y: number, m: number) =>
      d.getFullYear() === y && d.getMonth() === m

    const currentMonth = consultationsRows.filter(r => {
      if (!r.consultation_date) return false
      return inMonth(new Date(r.consultation_date), year, month)
    })
    const prevMonthRows = consultationsRows.filter(r => {
      if (!r.consultation_date) return false
      return inMonth(new Date(r.consultation_date), prevYear, prevMonth)
    })

    const consultasMes = currentMonth.length
    const consultasAprobadas = currentMonth.filter(r => r.payment_status === 'approved').length
    const consultasPendientes = consultasMes - consultasAprobadas
    const pacientesUnicos = new Set(currentMonth.map(r => r.patient_name)).size
    const consultasPrev = prevMonthRows.length

    let crecimientoMoM: number | null = null
    if (consultasPrev > 0) {
      crecimientoMoM = ((consultasMes - consultasPrev) / consultasPrev) * 100
    } else {
      crecimientoMoM = null
    }

    return { consultasMes, consultasAprobadas, consultasPendientes, pacientesUnicos, crecimientoMoM, consultasPrev }
  }, [consultationsRows, reportMonth])

  // L7 (2026-04-29): chart Recharts — últimos 6 meses ingresos vs egresos
  // anclado al `reportMonth` seleccionado (no al `currentDate` del navegador).
  const reportChartData = useMemo(() => {
    const [yStr, mStr] = reportMonth.split('-')
    const anchor = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1)
    const months: { label: string; ingresos: number; egresos: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)
      const yy = d.getFullYear()
      const mm = d.getMonth()
      const ingresos = incomes
        .filter(inc => {
          const id = new Date(inc.date)
          return id.getFullYear() === yy && id.getMonth() === mm
        })
        .reduce((s, x) => s + (x.amount_usd || 0), 0)
      const egresos = expenses
        .filter(exp => {
          const ed = new Date(exp.due_date)
          return ed.getFullYear() === yy && ed.getMonth() === mm
        })
        .reduce((s, x) => s + (x.amount || 0), 0)
      months.push({
        label: `${MONTHS[mm]} ${String(yy).slice(2)}`,
        ingresos: parseFloat(ingresos.toFixed(2)),
        egresos: parseFloat(egresos.toFixed(2)),
      })
    }
    return months
  }, [incomes, expenses, reportMonth])

  // L7 (2026-04-29): consultas filtradas por `reportMonth` para el CSV.
  const reportConsultations = useMemo(() => {
    const [yStr, mStr] = reportMonth.split('-')
    const year = parseInt(yStr, 10)
    const month = parseInt(mStr, 10) - 1
    return consultationsRows.filter(r => {
      if (!r.consultation_date) return false
      const d = new Date(r.consultation_date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [consultationsRows, reportMonth])

  // L7 (2026-04-29): traduce status de cita a etiqueta legible.
  const apptStatusLabel = (s: string | null) => {
    if (!s) return '—'
    const map: Record<string, string> = {
      scheduled: 'Agendada', confirmed: 'Aprobada', cancelled: 'Rechazada',
      completed: 'Atendida', no_show: 'No asistió',
      pending: 'Pendiente', accepted: 'Aceptada',
    }
    return map[s] || s
  }
  const consultationStatusLabel = (s: string | null) => {
    if (s === 'completed') return 'Atendida'
    if (s === 'no_show') return 'No asistió'
    return '—'
  }
  const paymentStatusLabel = (s: string | null) => {
    if (s === 'approved') return 'Aprobado'
    if (s === 'pending') return 'Pendiente'
    return '—'
  }
  const formatDurationCell = (mins: number | null | undefined): string => {
    if (mins == null || mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
    return `${m} min`
  }

  // L7 (2026-04-29): export CSV de la cuadrícula de consultas.
  // Columnas requeridas: código, fecha, paciente, status cita, status consulta,
  // status pago, duración, diagnóstico + monto + plan (datos extra valiosos).
  // Genera CSV en cliente con Blob + URL.createObjectURL — sin libs externas.
  const downloadConsultationsCSV = () => {
    const monthLabel = monthOptions.find(o => o.value === reportMonth)?.label || reportMonth
    const escapeCsv = (v: unknown): string => {
      if (v == null) return ''
      const s = String(v)
      // Escapamos comillas duplicándolas y envolvemos toda la celda entre comillas
      // para soportar comas/saltos de línea/quotes en diagnósticos.
      return `"${s.replace(/"/g, '""')}"`
    }
    const headers = [
      'Código', 'Fecha', 'Paciente', 'Plan',
      'Status Cita', 'Status Consulta', 'Status Pago',
      'Duración', 'Monto USD', 'Diagnóstico',
    ]
    const lines: string[] = [headers.join(',')]
    for (const r of reportConsultations) {
      const dateStr = r.consultation_date
        ? new Date(r.consultation_date).toLocaleDateString('es-VE')
        : ''
      lines.push([
        escapeCsv(r.consultation_code || ''),
        escapeCsv(dateStr),
        escapeCsv(r.patient_name),
        escapeCsv(r.plan_name || ''),
        escapeCsv(apptStatusLabel(r.appointment_status)),
        escapeCsv(consultationStatusLabel(r.consultation_status)),
        escapeCsv(paymentStatusLabel(r.payment_status)),
        escapeCsv(formatDurationCell(r.duration_minutes)),
        r.amount_usd != null ? r.amount_usd.toFixed(2) : '',
        escapeCsv(r.diagnosis || ''),
      ].join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consultas_${monthLabel.replace(/\s/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const navigate = (dir: number) => {
    const d = new Date(currentDate)
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir)
    else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setCurrentDate(d)
  }

  const periodLabel = () => {
    if (viewMode === 'month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    if (viewMode === 'week') {
      const start = new Date(currentDate)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return `${start.getDate()}/${start.getMonth()+1} — ${end.getDate()}/${end.getMonth()+1}`
    }
    return currentDate.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const downloadCSV = (type: 'income' | 'expenses' | 'all') => {
    let csv = ''
    if (type === 'all') {
      // Unified table with all movements
      csv = 'Tipo,Descripción,Detalle,Monto USD,Método/Categoría,Fecha,Estado\n'
      const incRows = tab === 'income' ? incomes : filteredData.filteredIncomes
      const expRows = tab === 'expenses' ? expenses : filteredData.filteredExpenses
      // Combine and sort by date
      const allMovements: { type: string; desc: string; detail: string; amount: number; method: string; date: string; status: string }[] = []
      incRows.forEach(i => {
        allMovements.push({
          type: 'Ingreso',
          desc: i.patient_name,
          detail: i.consultation_code || '',
          amount: i.amount_usd,
          method: i.payment_method,
          date: i.date,
          status: 'Cobrado',
        })
      })
      expRows.forEach(e => {
        allMovements.push({
          type: 'Egreso',
          desc: e.vendor_name,
          detail: e.concept,
          amount: -e.amount,
          method: e.notes || 'Otros',
          date: e.due_date,
          status: e.paid ? 'Pagado' : 'Pendiente',
        })
      })
      allMovements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      allMovements.forEach(m => {
        csv += `"${m.type}","${m.desc}","${m.detail}",${m.amount},"${m.method}","${new Date(m.date).toLocaleDateString('es-VE')}","${m.status}"\n`
      })
      // Add totals row
      const totalInc = incRows.reduce((s, i) => s + (i.amount_usd || 0), 0)
      const totalExp = expRows.reduce((s, e) => s + (e.amount || 0), 0)
      csv += `\n"","","TOTAL INGRESOS",${totalInc},"","",""\n`
      csv += `"","","TOTAL EGRESOS",-${totalExp},"","",""\n`
      csv += `"","","BALANCE",${totalInc - totalExp},"","",""\n`
    } else if (type === 'income') {
      csv = 'Paciente,Monto USD,Método de pago,Fecha,Código\n'
      const rows = tab === 'income' ? incomes : filteredData.filteredIncomes
      rows.forEach(i => {
        csv += `"${i.patient_name}",${i.amount_usd},"${i.payment_method}","${new Date(i.date).toLocaleDateString('es-VE')}","${i.consultation_code || ''}"\n`
      })
    } else {
      csv = 'Proveedor,Concepto,Monto,Fecha,Pagado\n'
      const rows = tab === 'expenses' ? expenses : filteredData.filteredExpenses
      rows.forEach(e => {
        csv += `"${e.vendor_name}","${e.concept}",${e.amount},"${new Date(e.due_date).toLocaleDateString('es-VE')}","${e.paid ? 'Sí' : 'No'}"\n`
      })
    }
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type === 'all' ? 'movimientos' : type === 'income' ? 'ingresos' : 'gastos'}_${periodLabel().replace(/\s/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.concept || !expenseForm.amount) return
    setSavingExpense(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('accounts_payable').insert({
        doctor_id: user.id,
        vendor_name: expenseForm.vendor_name || expenseForm.category,
        concept: expenseForm.concept,
        amount: parseFloat(expenseForm.amount),
        due_date: expenseForm.due_date,
        paid: true,
        paid_at: new Date().toISOString(),
        notes: expenseForm.category,
      })

      setExpenseForm({ vendor_name: '', concept: '', amount: '', category: 'other', due_date: new Date().toISOString().split('T')[0] })
      setShowExpenseForm(false)
      loadData()
    } catch {}
    setSavingExpense(false)
  }

  const handleDeleteExpense = async (id: string) => {
    await supabase.from('accounts_payable').delete().eq('id', id)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Finanzas</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Control de ingresos, gastos y balance del consultorio</p>
        </div>

        {/* View mode + Period nav */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(['day', 'week', 'month'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === m ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {m === 'day' ? 'Día' : m === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100">
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-xs font-semibold text-slate-700 min-w-[120px] text-center">{periodLabel()}</span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-slate-100">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* F3 (2026-04-29): tabs movidos arriba para que Reportería sea descubrible */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
          {[
            { value: 'overview' as const, label: 'Resumen', icon: DollarSign },
            { value: 'income' as const, label: 'Ingresos', icon: TrendingUp },
            { value: 'expenses' as const, label: 'Gastos', icon: TrendingDown },
            { value: 'reports' as const, label: 'Reportería', icon: BarChart3 },
          ].map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                  tab === t.value ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
        {tab !== 'reports' && (
          <button
            onClick={() => downloadCSV('all')}
            className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-sm font-semibold hover:bg-teal-100 transition-colors"
          >
            <Download className="w-4 h-4" /> Descargar movimientos (CSV)
          </button>
        )}
      </div>

      {/* KPI Cards — visibles en overview/income/expenses (no en reports) */}
      {tab !== 'reports' && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ingresos</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatUsd(filteredData.totalIncome)}</p>
          {bcvRate && <p className="text-sm text-emerald-400 font-semibold">{toBs(filteredData.totalIncome)}</p>}
          <p className="text-xs text-slate-400 mt-1">{filteredData.filteredIncomes.length} pagos aprobados</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gastos</p>
          </div>
          <p className="text-2xl font-bold text-red-500">{formatUsd(filteredData.totalExpenses)}</p>
          {bcvRate && <p className="text-sm text-red-300 font-semibold">{toBs(filteredData.totalExpenses)}</p>}
          <p className="text-xs text-slate-400 mt-1">{filteredData.filteredExpenses.length} gastos registrados</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${filteredData.balance >= 0 ? 'bg-teal-50' : 'bg-amber-50'}`}>
              <DollarSign className={`w-5 h-5 ${filteredData.balance >= 0 ? 'text-teal-600' : 'text-amber-600'}`} />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Balance</p>
          </div>
          <p className={`text-2xl font-bold ${filteredData.balance >= 0 ? 'text-teal-600' : 'text-amber-600'}`}>
            {formatUsd(filteredData.balance)}
          </p>
          {bcvRate && <p className={`text-sm font-semibold ${filteredData.balance >= 0 ? 'text-teal-400' : 'text-amber-400'}`}>{toBs(filteredData.balance)}</p>}
          <p className="text-xs text-slate-400 mt-1">Ingresos - Gastos</p>
        </div>
      </div>
      )}

      {/* Chart — visible en overview/income/expenses (no en reports) */}
      {tab !== 'reports' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <BarChart3 className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700">Ingresos vs Gastos</h3>
          <div className="flex items-center gap-4 ml-auto">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Ingresos
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-3 rounded-sm bg-red-400" /> Gastos
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-3 rounded-sm bg-teal-200" /> Balance
            </span>
          </div>
        </div>
        {chartData.every(p => p.income === 0 && p.expenses === 0) ? (
          <div className="flex items-center justify-center h-48 text-sm text-slate-300">
            Sin datos en este período
          </div>
        ) : (
          <>
            {/* Y-axis labels + Bars */}
            <div className="flex gap-2">
              {/* Y-axis */}
              <div className="flex flex-col justify-between h-56 py-1 shrink-0">
                <span className="text-[9px] text-slate-400 font-medium text-right w-10">${maxChartVal >= 1000 ? `${(maxChartVal/1000).toFixed(1)}k` : maxChartVal.toFixed(0)}</span>
                <span className="text-[9px] text-slate-400 font-medium text-right w-10">${maxChartVal >= 1000 ? `${(maxChartVal/2000).toFixed(1)}k` : (maxChartVal/2).toFixed(0)}</span>
                <span className="text-[9px] text-slate-400 font-medium text-right w-10">$0</span>
              </div>
              {/* Chart area */}
              <div className="flex-1 relative">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-b border-dashed border-slate-100" />
                  <div className="border-b border-dashed border-slate-100" />
                  <div className="border-b border-slate-200" />
                </div>
                {/* Bars */}
                <div className="flex items-end gap-2 sm:gap-4 h-56 relative z-10">
                  {chartData.map((p, i) => {
                    const balance = p.income - p.expenses
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                        <div className="w-full flex gap-0.5 sm:gap-1 items-end h-48">
                          {/* Income bar */}
                          <div className="flex-1 flex flex-col items-center justify-end relative">
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-20 pointer-events-none">
                              +${p.income.toFixed(2)}
                            </div>
                            {p.income > 0 && (
                              <span className="text-[9px] font-bold text-emerald-600 mb-0.5">${p.income >= 1000 ? `${(p.income/1000).toFixed(1)}k` : p.income.toFixed(0)}</span>
                            )}
                            <div
                              className="w-full rounded-t-lg transition-all duration-700 ease-out"
                              style={{
                                height: `${Math.max((p.income / maxChartVal) * 100, p.income > 0 ? 5 : 0)}%`,
                                background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                              }}
                            />
                          </div>
                          {/* Expense bar */}
                          <div className="flex-1 flex flex-col items-center justify-end relative">
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-20 pointer-events-none">
                              -${p.expenses.toFixed(2)}
                            </div>
                            {p.expenses > 0 && (
                              <span className="text-[9px] font-bold text-red-500 mb-0.5">${p.expenses >= 1000 ? `${(p.expenses/1000).toFixed(1)}k` : p.expenses.toFixed(0)}</span>
                            )}
                            <div
                              className="w-full rounded-t-lg transition-all duration-700 ease-out"
                              style={{
                                height: `${Math.max((p.expenses / maxChartVal) * 100, p.expenses > 0 ? 5 : 0)}%`,
                                background: 'linear-gradient(180deg, #f87171 0%, #ef4444 100%)',
                              }}
                            />
                          </div>
                        </div>
                        {/* Label + Balance */}
                        <span className="text-[10px] text-slate-500 font-semibold">{p.label}</span>
                        {(p.income > 0 || p.expenses > 0) && (
                          <span className={`text-[9px] font-bold ${balance >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                            {balance >= 0 ? '+' : ''}{balance >= 1000 || balance <= -1000 ? `$${(balance/1000).toFixed(1)}k` : `$${balance.toFixed(0)}`}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* F3 (2026-04-29): Reportería ahora vive en su propio tab para que sea
          descubrible. Antes estaba siempre visible pero buried bajo el chart. */}
      {tab === 'reports' && (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-500" />
            <h3 className="text-sm font-bold text-slate-700">Reportería</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Mes:</span>
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
            >
              {monthOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* L7 KPI cards: consultas del mes / pacientes únicos / crecimiento MoM */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Consultas del mes</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{reportKpis.consultasMes}</p>
            <p className="text-xs text-slate-400 mt-1">
              {reportKpis.consultasAprobadas} aprobadas · {reportKpis.consultasPendientes} pendientes
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pacientes únicos</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{reportKpis.pacientesUnicos}</p>
            <p className="text-xs text-slate-400 mt-1">En el mes</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                reportKpis.crecimientoMoM == null ? 'bg-slate-50' :
                reportKpis.crecimientoMoM >= 0 ? 'bg-emerald-50' : 'bg-red-50'
              }`}>
                {reportKpis.crecimientoMoM == null ? (
                  <Activity className="w-4 h-4 text-slate-400" />
                ) : reportKpis.crecimientoMoM >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
              </div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Crecimiento MoM</p>
            </div>
            <p className={`text-2xl font-bold ${
              reportKpis.crecimientoMoM == null ? 'text-slate-400' :
              reportKpis.crecimientoMoM >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {reportKpis.crecimientoMoM == null
                ? '—'
                : `${reportKpis.crecimientoMoM >= 0 ? '+' : ''}${reportKpis.crecimientoMoM.toFixed(1)}%`}
            </p>
            <p className="text-xs text-slate-400 mt-1">vs mes anterior ({reportKpis.consultasPrev})</p>
          </div>
        </div>

        {/* L7 chart Recharts: ingresos vs egresos últimos 6 meses */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Ingresos vs Egresos · últimos 6 meses</p>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportChartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <RTooltip
                  formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* L7 cuadro descargable de consultas */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Consultas del mes ({reportConsultations.length})
            </p>
            <button
              onClick={downloadConsultationsCSV}
              disabled={reportConsultations.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-semibold hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4" /> Descargar Excel (CSV)
            </button>
          </div>
          {reportConsultations.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
              No hay consultas registradas en este mes
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Código</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Paciente</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status Cita</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status Consulta</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status Pago</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Duración</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monto</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Diagnóstico</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportConsultations.slice(0, 50).map(r => (
                    <tr
                      key={r.id}
                      className="hover:bg-teal-50/50 transition-colors cursor-pointer"
                      onClick={() => setDetailRow(r)}
                    >
                      <td className="px-3 py-2 text-xs font-mono text-slate-500">{r.consultation_code || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {r.consultation_date ? new Date(r.consultation_date).toLocaleDateString('es-VE') : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium text-slate-800">{r.patient_name}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{apptStatusLabel(r.appointment_status)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{consultationStatusLabel(r.consultation_status)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          r.payment_status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                          r.payment_status === 'pending' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-50 text-slate-500'
                        }`}>
                          {paymentStatusLabel(r.payment_status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{formatDurationCell(r.duration_minutes)}</td>
                      <td className="px-3 py-2 text-xs text-right font-semibold text-slate-700">
                        {r.amount_usd != null ? formatUsd(r.amount_usd) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 max-w-xs truncate" title={r.diagnosis || ''}>
                        {r.diagnosis || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailRow(r) }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md"
                        >
                          <Eye className="w-3 h-3" /> Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportConsultations.length > 50 && (
                <div className="px-3 py-2 text-[10px] text-slate-400 text-center bg-slate-50 border-t border-slate-100">
                  Mostrando 50 de {reportConsultations.length}. Descargá el CSV para verlas todas.
                </div>
              )}
            </div>
          )}

          {/* Modal detalle completo de consulta */}
          {detailRow && (
            <ConsultationDetailModal
              row={detailRow}
              onClose={() => setDetailRow(null)}
              apptStatusLabel={apptStatusLabel}
              consultationStatusLabel={consultationStatusLabel}
              paymentStatusLabel={paymentStatusLabel}
              formatDurationCell={formatDurationCell}
            />
          )}
        </div>
      </div>
      )}

      {/* Income Table */}
      {(tab === 'overview' || tab === 'income') && (() => {
        const tableIncomes = tab === 'income'
          ? incomes.filter(i => {
              if (incomeDateFrom && new Date(i.date) < new Date(incomeDateFrom)) return false
              if (incomeDateTo && new Date(i.date) > new Date(incomeDateTo + 'T23:59:59')) return false
              return true
            })
          : filteredData.filteredIncomes.slice(0, 5)
        const tableTotal = tableIncomes.reduce((s, i) => s + (i.amount_usd || 0), 0)

        return (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-700">Ingresos (Pagos aprobados)</h3>
                <button onClick={() => downloadCSV('income')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors" title="Descargar CSV">
                  <Download className="w-4 h-4" />
                </button>
              </div>
              {tab === 'income' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {/* F4 (2026-04-29): text-base en mobile evita zoom-in en iOS Safari (necesita >=16px); text-xs sólo en sm+ */}
                  <input type="date" value={incomeDateFrom} onChange={e => setIncomeDateFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs" />
                  <span className="text-xs text-slate-400">a</span>
                  <input type="date" value={incomeDateTo} onChange={e => setIncomeDateTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs" />
                  {(incomeDateFrom || incomeDateTo) && (
                    <button onClick={() => { setIncomeDateFrom(''); setIncomeDateTo('') }} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Limpiar</button>
                  )}
                </div>
              )}
            </div>

            {tableIncomes.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">No hay ingresos en este periodo</div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full md:min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                      <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Consulta</th>
                      <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Paciente</th>
                      <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monto USD</th>
                      <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monto Bs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableIncomes.map(inc => (
                      <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 text-xs text-slate-600">{new Date(inc.date).toLocaleDateString('es-VE')}</td>
                        <td className="px-5 py-3 text-xs text-slate-600">{inc.consultation_code || inc.payment_method || '—'}</td>
                        <td className="px-5 py-3 text-sm font-medium text-slate-900">{inc.patient_name}</td>
                        <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">+{formatUsd(inc.amount_usd)}</td>
                        <td className="px-5 py-3 text-xs text-slate-400 text-right">{bcvRate ? toBs(inc.amount_usd || 0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50/50 border-t border-emerald-100">
                      <td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-700">Total</td>
                      <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">{formatUsd(tableTotal)}</td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-500 text-right">{bcvRate ? toBs(tableTotal) : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* Expenses Table */}
      {(tab === 'overview' || tab === 'expenses') && (() => {
        const tableExpenses = tab === 'expenses'
          ? expenses.filter(e => {
              if (expenseDateFrom && new Date(e.due_date) < new Date(expenseDateFrom)) return false
              if (expenseDateTo && new Date(e.due_date) > new Date(expenseDateTo + 'T23:59:59')) return false
              return true
            })
          : filteredData.filteredExpenses.slice(0, 5)
        const tableTotal = tableExpenses.reduce((s, e) => s + (e.amount || 0), 0)

        return (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-700">Gastos del consultorio</h3>
                <button onClick={() => downloadCSV('expenses')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors" title="Descargar CSV">
                  <Download className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {tab === 'expenses' && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {/* F4 (2026-04-29): text-base en mobile evita zoom-in en iOS Safari */}
                    <input type="date" value={expenseDateFrom} onChange={e => setExpenseDateFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs" />
                    <span className="text-xs text-slate-400">a</span>
                    <input type="date" value={expenseDateTo} onChange={e => setExpenseDateTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-base sm:text-xs" />
                    {(expenseDateFrom || expenseDateTo) && (
                      <button onClick={() => { setExpenseDateFrom(''); setExpenseDateTo('') }} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Limpiar</button>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar gasto
                </button>
              </div>
            </div>

            {/* Add expense form */}
            {showExpenseForm && (
              <form onSubmit={handleAddExpense} className="px-5 py-4 bg-slate-50 border-b border-slate-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <select
                    value={expenseForm.category}
                    onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input type="text" placeholder="Concepto" value={expenseForm.concept} onChange={e => setExpenseForm(f => ({ ...f, concept: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  <input type="number" step="0.01" placeholder="Monto USD" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  {/* F4 (2026-04-29): text-base en mobile evita zoom-in en iOS Safari (input date) */}
                  <input type="date" value={expenseForm.due_date} onChange={e => setExpenseForm(f => ({ ...f, due_date: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-base sm:text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={savingExpense} className="px-4 py-2 rounded-lg text-white text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}>
                    {savingExpense ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setShowExpenseForm(false)} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancelar</button>
                </div>
              </form>
            )}

            {tableExpenses.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">No hay gastos en este periodo</div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full md:min-w-[400px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                      <th className="text-left px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Gasto</th>
                      <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monto USD</th>
                      <th className="text-right px-5 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monto Bs</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableExpenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3 text-xs text-slate-600">{new Date(exp.due_date).toLocaleDateString('es-VE')}</td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-slate-900">{exp.concept}</p>
                          {exp.notes && <p className="text-[10px] text-slate-400">{EXPENSE_CATEGORIES.find(c => c.value === exp.notes)?.label || exp.notes}</p>}
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-red-500 text-right">-{formatUsd(exp.amount)}</td>
                        <td className="px-5 py-3 text-xs text-slate-400 text-right">{bcvRate ? toBs(exp.amount || 0) : '—'}</td>
                        <td className="px-2 py-3">
                          <button onClick={() => handleDeleteExpense(exp.id)} className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50/50 border-t border-red-100">
                      <td colSpan={2} className="px-5 py-3 text-xs font-bold text-slate-700">Total</td>
                      <td className="px-5 py-3 text-sm font-bold text-red-500 text-right">-{formatUsd(tableTotal)}</td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-500 text-right">{bcvRate ? toBs(tableTotal) : '—'}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ConsultationDetailModal — Modal con TODA la información de una consulta
// (paciente, cita, pago, motivo, diagnóstico, tratamiento, prescripción,
// ejercicios, notas, bloques personalizados…). Inspirado en el "Order detail"
// de Stripe/Shopify: una vista que centraliza el contexto completo de la
// transacción, sin necesidad de navegar a múltiples pestañas.
// ════════════════════════════════════════════════════════════════════════════
function ConsultationDetailModal({
  row, onClose, apptStatusLabel, consultationStatusLabel, paymentStatusLabel, formatDurationCell,
}: {
  row: ConsultationRow
  onClose: () => void
  apptStatusLabel: (s: string | null) => string
  consultationStatusLabel: (s: string | null) => string
  paymentStatusLabel: (s: string | null) => string
  formatDurationCell: (m: number | null | undefined) => string
}) {
  // Helper: obtener valor del bloque desde blocks_data
  const getBlockValue = (key: string): string | null => {
    if (!row.blocks_data) return null
    const v = (row.blocks_data as Record<string, unknown>)[key]
    if (!v) return null
    if (typeof v === 'string') return v.trim() || null
    if (Array.isArray(v)) return v.length > 0 ? v.join(' • ') : null
    if (typeof v === 'object') {
      try { return JSON.stringify(v) } catch { return null }
    }
    return String(v)
  }

  // Si hay snapshot, usamos ese orden; si no, una lista por defecto
  const printableBlocks = (row.blocks_snapshot && row.blocks_snapshot.length > 0)
    ? row.blocks_snapshot.filter(b => b.printable !== false)
    : null

  const apptDate = row.scheduled_at ? new Date(row.scheduled_at) : null
  const consultDate = row.consultation_date ? new Date(row.consultation_date) : null

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{row.consultation_code || '—'}</span>
              {row.appointment_status && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold uppercase tracking-wider">
                  Cita: {apptStatusLabel(row.appointment_status)}
                </span>
              )}
              {row.consultation_status && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold uppercase tracking-wider">
                  Consulta: {consultationStatusLabel(row.consultation_status)}
                </span>
              )}
              {row.payment_status && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  row.payment_status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                  row.payment_status === 'pending' ? 'bg-amber-50 text-amber-700' :
                  'bg-slate-50 text-slate-500'
                }`}>
                  Pago: {paymentStatusLabel(row.payment_status)}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5">{row.patient_name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg shrink-0" aria-label="Cerrar">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body scroll */}
        <div className="overflow-y-auto px-4 sm:px-6 py-5 space-y-5 flex-1">
          {/* Sección 1: Datos del paciente */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Paciente
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 rounded-lg p-3">
              {row.patient_cedula && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Cédula</p>
                  <p className="text-slate-800 font-mono">{row.patient_cedula}</p>
                </div>
              )}
              {row.patient_phone && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Teléfono</p>
                  <p className="text-slate-800">{row.patient_phone}</p>
                </div>
              )}
              {row.patient_email && (
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Email</p>
                  <p className="text-slate-800 truncate">{row.patient_email}</p>
                </div>
              )}
              {!row.patient_cedula && !row.patient_phone && !row.patient_email && (
                <p className="text-slate-400 italic col-span-3">Sin datos de contacto registrados.</p>
              )}
            </div>
          </section>

          {/* Sección 2: Detalle de la cita */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Cita
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-3">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Fecha de la cita</p>
                <p className="text-slate-800">
                  {apptDate
                    ? apptDate.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
                    : consultDate
                    ? consultDate.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Hora</p>
                <p className="text-slate-800">{apptDate ? apptDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Modalidad</p>
                <p className="text-slate-800 capitalize">
                  {row.appointment_mode === 'online' ? '🖥 Online'
                    : row.appointment_mode === 'in_person' ? '🏥 Presencial'
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Duración</p>
                <p className="text-slate-800">{formatDurationCell(row.duration_minutes)}</p>
              </div>
              {row.plan_name && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Plan / Servicio</p>
                  <p className="text-slate-800">{row.plan_name}</p>
                </div>
              )}
            </div>
          </section>

          {/* Sección 3: Pago */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Pago
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-3">
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Monto</p>
                <p className="text-slate-800 font-bold text-base">
                  {row.amount_usd != null ? formatUsd(row.amount_usd) : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Método</p>
                <p className="text-slate-800 capitalize">{row.payment_method?.replace('_', ' ') || '—'}</p>
              </div>
              {row.payment_reference && (
                <div className="col-span-2">
                  <p className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">Referencia</p>
                  <p className="text-slate-800 font-mono">{row.payment_reference}</p>
                </div>
              )}
            </div>
          </section>

          {/* Sección 4: Detalle clínico */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5" /> Información clínica
            </h3>
            <div className="space-y-3 text-sm">
              {row.chief_complaint && (
                <DetailField icon={<MessageCircle className="w-3.5 h-3.5 text-blue-500" />} label="Motivo de consulta" value={row.chief_complaint} />
              )}
              {row.diagnosis && (
                <DetailField icon={<FileText className="w-3.5 h-3.5 text-purple-500" />} label="Diagnóstico" value={row.diagnosis} />
              )}
              {row.treatment && (
                <DetailField icon={<Pill className="w-3.5 h-3.5 text-emerald-500" />} label="Tratamiento" value={row.treatment} />
              )}
              {row.notes && (
                <DetailField icon={<FileText className="w-3.5 h-3.5 text-slate-500" />} label="Notas / Informe" value={row.notes} richText />
              )}

              {/* Bloques dinámicos del snapshot — solo si hay extras además de los campos legacy */}
              {printableBlocks && printableBlocks
                .filter(b => !['chief_complaint', 'diagnosis', 'treatment', 'notes', 'informe'].includes(b.key))
                .map(b => {
                  const value = getBlockValue(b.key)
                  if (!value) return null
                  return (
                    <DetailField
                      key={b.key}
                      icon={<ClipboardList className="w-3.5 h-3.5 text-teal-500" />}
                      label={b.label}
                      value={value}
                    />
                  )
                })
              }

              {!row.chief_complaint && !row.diagnosis && !row.treatment && !row.notes && (
                <div className="text-xs text-slate-400 italic px-3 py-4 bg-slate-50 rounded-lg text-center">
                  Esta consulta aún no tiene información clínica registrada.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg"
          >
            Cerrar
          </button>
          <a
            href={`/doctor/consultations/${row.id}`}
            className="px-4 py-2 text-sm font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-lg flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" /> Abrir consulta completa
          </a>
        </div>
      </div>
    </div>
  )
}

function DetailField({
  icon, label, value, richText,
}: {
  icon: React.ReactNode
  label: string
  value: string
  richText?: boolean
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon} {label}
      </p>
      {richText ? (
        <div className="text-sm text-slate-800 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: value }} />
      ) : (
        <p className="text-sm text-slate-800 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  )
}
