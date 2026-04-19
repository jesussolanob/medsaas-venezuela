'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3,
  Plus, Trash2, Loader2, ChevronLeft, ChevronRight,
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

  const supabase = createClient()

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load approved consultation payments as income
      const { data: payments } = await supabase
        .from('consultation_payments')
        .select('id, patient_name, amount_usd, payment_method, date, consultation_code')
        .eq('doctor_id', user.id)
        .eq('payment_status', 'approved')
        .order('date', { ascending: false })

      setIncomes(payments || [])

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
          <p className="text-2xl font-bold text-emerald-600">${filteredData.totalIncome.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">{filteredData.filteredIncomes.length} pagos aprobados</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gastos</p>
          </div>
          <p className="text-2xl font-bold text-red-500">${filteredData.totalExpenses.toFixed(2)}</p>
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
            ${filteredData.balance.toFixed(2)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Ingresos - Gastos</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-5">
          <BarChart3 className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700">Tendencia</h3>
          <div className="flex items-center gap-4 ml-auto">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-3 rounded-sm bg-emerald-400" /> Ingresos
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-3 rounded-sm bg-red-400" /> Gastos
            </span>
          </div>
        </div>
        <div className="flex items-end gap-3 h-40">
          {chartData.map((p, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-1 items-end h-32">
                <div className="flex-1 flex flex-col justify-end">
                  <div
                    className="w-full bg-emerald-400 rounded-t-md transition-all duration-300 min-h-[2px]"
                    style={{ height: `${(p.income / maxChartVal) * 100}%` }}
                    title={`$${p.income.toFixed(2)}`}
                  />
                </div>
                <div className="flex-1 flex flex-col justify-end">
                  <div
                    className="w-full bg-red-400 rounded-t-md transition-all duration-300 min-h-[2px]"
                    style={{ height: `${(p.expenses / maxChartVal) * 100}%` }}
                    title={`$${p.expenses.toFixed(2)}`}
                  />
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
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

      {/* Income Table */}
      {(tab === 'overview' || tab === 'income') && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Ingresos (Pagos aprobados)</h3>
            <span className="text-xs text-slate-400">{filteredData.filteredIncomes.length} registros</span>
          </div>
          {filteredData.filteredIncomes.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">
              No hay ingresos en este periodo
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredData.filteredIncomes.slice(0, tab === 'overview' ? 5 : undefined).map(inc => (
                <div key={inc.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{inc.patient_name}</p>
                      <p className="text-xs text-slate-400">{new Date(inc.date).toLocaleDateString('es-VE')} · {inc.payment_method || 'N/A'}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">+${inc.amount_usd?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expenses Table */}
      {(tab === 'overview' || tab === 'expenses') && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Gastos del consultorio</h3>
            <button
              onClick={() => setShowExpenseForm(!showExpenseForm)}
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar gasto
            </button>
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
                <input
                  type="text"
                  placeholder="Concepto"
                  value={expenseForm.concept}
                  onChange={e => setExpenseForm(f => ({ ...f, concept: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Monto USD"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
                <input
                  type="date"
                  value={expenseForm.due_date}
                  onChange={e => setExpenseForm(f => ({ ...f, due_date: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingExpense}
                  className="px-4 py-2 rounded-lg text-white text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
                >
                  {savingExpense ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {filteredData.filteredExpenses.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">
              No hay gastos en este periodo
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredData.filteredExpenses.slice(0, tab === 'overview' ? 5 : undefined).map(exp => (
                <div key={exp.id} className="px-5 py-3 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{exp.concept}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(exp.due_date).toLocaleDateString('es-VE')}
                        {exp.notes && ` · ${EXPENSE_CATEGORIES.find(c => c.value === exp.notes)?.label || exp.notes}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-500">-${exp.amount?.toFixed(2)}</span>
                    <button
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
