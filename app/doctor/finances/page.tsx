'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBcvRate } from '@/lib/useBcvRate'
import { fetchPayments as sharedFetchPayments, formatUsd, formatBs } from '@/lib/finances'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3,
  Plus, Trash2, Loader2, ChevronLeft, ChevronRight, Search, Calendar, Download,
} from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'income' | 'expenses'>('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
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
        .channel('finances-payments-watch')
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

      {/* KPI Cards */}
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

      {/* Chart */}
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

      {/* Tabs + Download all */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {[
            { value: 'overview' as const, label: 'Resumen' },
            { value: 'income' as const, label: 'Ingresos' },
            { value: 'expenses' as const, label: 'Gastos' },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                tab === t.value ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => downloadCSV('all')}
          className="flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-sm font-semibold hover:bg-teal-100 transition-colors"
        >
          <Download className="w-4 h-4" /> Descargar movimientos (CSV)
        </button>
      </div>

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
                  <input type="date" value={incomeDateFrom} onChange={e => setIncomeDateFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
                  <span className="text-xs text-slate-400">a</span>
                  <input type="date" value={incomeDateTo} onChange={e => setIncomeDateTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
                  {(incomeDateFrom || incomeDateTo) && (
                    <button onClick={() => { setIncomeDateFrom(''); setIncomeDateTo('') }} className="text-xs text-teal-600 hover:text-teal-700 font-medium">Limpiar</button>
                  )}
                </div>
              )}
            </div>

            {tableIncomes.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">No hay ingresos en este periodo</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
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
                    <input type="date" value={expenseDateFrom} onChange={e => setExpenseDateFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
                    <span className="text-xs text-slate-400">a</span>
                    <input type="date" value={expenseDateTo} onChange={e => setExpenseDateTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  <input type="date" value={expenseForm.due_date} onChange={e => setExpenseForm(f => ({ ...f, due_date: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
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
