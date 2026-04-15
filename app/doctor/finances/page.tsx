'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Plus, X, Calendar, Building, Users2, Receipt, BarChart2, Trash2, Check, RefreshCw, CreditCard, Smartphone, ArrowRightLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type IncomeEntry = { id: string; description: string; amount_usd: number; date: string; source: string }
type ExpenseEntry = { id: string; description: string; amount_usd: number; category: string; recurring: boolean; day_of_month?: number }
type PaymentEntry = { id: string; consultation_code: string; patient_name: string; date: string; amount_usd: number; payment_status: string; payment_method?: string }
type InsurancePayment = { consultation_code: string; patient_name: string; amount_usd: number; consultation_date: string; insurance_name: string; credit_days: number; due_date: string; status: 'vigente' | 'vencido' }

const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Alquiler', icon: <Building className="w-3.5 h-3.5" /> },
  { value: 'staff', label: 'Personal/RRHH', icon: <Users2 className="w-3.5 h-3.5" /> },
  { value: 'taxes', label: 'Impuestos', icon: <Receipt className="w-3.5 h-3.5" /> },
  { value: 'supplies', label: 'Insumos médicos', icon: <Plus className="w-3.5 h-3.5" /> },
  { value: 'other', label: 'Otros', icon: <DollarSign className="w-3.5 h-3.5" /> },
]
const CAT_COLORS: Record<string, string> = { rent: 'bg-blue-50 text-blue-600', staff: 'bg-purple-50 text-purple-600', taxes: 'bg-orange-50 text-orange-600', supplies: 'bg-teal-50 text-teal-600', other: 'bg-slate-100 text-slate-600' }

const PAYMENT_METHODS = [
  { value: 'pago_movil', label: 'Pago Móvil', icon: <Smartphone className="w-3.5 h-3.5" /> },
  { value: 'transfer', label: 'Transferencia', icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
  { value: 'cash', label: 'Efectivo', icon: <DollarSign className="w-3.5 h-3.5" /> },
  { value: 'zelle', label: 'Zelle', icon: <CreditCard className="w-3.5 h-3.5" /> },
  { value: 'other', label: 'Otro', icon: <Receipt className="w-3.5 h-3.5" /> },
]

type Tab = 'income' | 'expenses' | 'pl' | 'payments' | 'insurance'

function getMonthOptions() {
  const now = new Date()
  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) })
  }
  return months
}

function buildDailyData(income: IncomeEntry[], expenses: ExpenseEntry[], month: string) {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const data = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayIncome = income.filter(i => i.date.startsWith(dateStr)).reduce((s, i) => s + i.amount_usd, 0)
    const dayExpenses = expenses.filter(e => {
      if (!e.recurring) return false
      return e.day_of_month === d
    }).reduce((s, e) => s + e.amount_usd, 0)
    if (dayIncome > 0 || dayExpenses > 0) data.push({ dia: String(d), Ingresos: dayIncome, Gastos: dayExpenses })
  }
  return data
}

export default function DoctorFinancesPage() {
  const [tab, setTab] = useState<Tab>('income')

  // BCV rate
  const [bcvRate, setBcvRate] = useState<number | null>(null)
  const [bcvUpdated, setBcvUpdated] = useState<string | null>(null)
  const [bcvLoading, setBcvLoading] = useState(true)

  const [income, setIncome] = useState<IncomeEntry[]>([])
  const [loadingIncome, setLoadingIncome] = useState(true)
  const [allPayments, setAllPayments] = useState<PaymentEntry[]>([])
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([
    { id: '1', description: 'Alquiler consultorio', amount_usd: 200, category: 'rent', recurring: true, day_of_month: 1 },
    { id: '2', description: 'Asistente médico', amount_usd: 150, category: 'staff', recurring: true, day_of_month: 1 },
  ])
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [newExp, setNewExp] = useState({ description: '', amount_usd: '', category: 'rent', recurring: true, day_of_month: '1' })

  // Balance filter
  const MONTHS = getMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0].value)

  const totalIncome = income.reduce((s, i) => s + i.amount_usd, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount_usd, 0)
  const netPL = totalIncome - totalExpenses
  const chartData = buildDailyData(income, expenses, selectedMonth)

  useEffect(() => {
    // Fetch BCV rate
    fetch('https://ve.dolarapi.com/v1/dolares/oficial')
      .then(r => r.json())
      .then(d => {
        const rate = d.promedio ?? d.precio ?? d.price ?? null
        if (rate) { setBcvRate(parseFloat(rate)); setBcvUpdated(d.fechaActualizacion ?? null) }
      })
      .catch(() => {
        fetch('https://pydolarve.org/api/v1/dollar?page=bcv')
          .then(r => r.json())
          .then(d => { if (d.price) setBcvRate(parseFloat(d.price)) })
          .catch(() => {})
      })
      .finally(() => setBcvLoading(false))

    // Fetch consultations data
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('consultations')
        .select('id, consultation_code, consultation_date, payment_status, patients(full_name)')
        .eq('doctor_id', user.id)
        .order('consultation_date', { ascending: false })
        .then(({ data }) => {
          const all: PaymentEntry[] = (data ?? []).map(c => ({
            id: c.id,
            consultation_code: c.consultation_code,
            patient_name: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string }).full_name : 'Paciente',
            date: c.consultation_date,
            amount_usd: 20,
            payment_status: c.payment_status,
            payment_method: undefined,
          }))
          setAllPayments(all)
          setIncome(all.filter(p => p.payment_status === 'approved').map(p => ({
            id: p.id, description: `Consulta ${p.consultation_code}`, amount_usd: p.amount_usd, date: p.date, source: p.patient_name,
          })))
          setLoadingIncome(false)
        })
    })
  }, [])

  function addExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!newExp.description || !newExp.amount_usd) return
    setExpenses(prev => [...prev, { id: Date.now().toString(), description: newExp.description, amount_usd: parseFloat(newExp.amount_usd), category: newExp.category, recurring: newExp.recurring, day_of_month: newExp.recurring ? parseInt(newExp.day_of_month) : undefined }])
    setNewExp({ description: '', amount_usd: '', category: 'rent', recurring: true, day_of_month: '1' })
    setShowExpenseForm(false)
  }

  async function updatePaymentMethod(id: string, method: string) {
    setAllPayments(prev => prev.map(p => p.id === id ? { ...p, payment_method: method } : p))
  }

  const filteredPayments = paymentFilter === 'all' ? allPayments : allPayments.filter(p => p.payment_status === paymentFilter)

  const STATUS_STYLE: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700',
    pending_approval: 'bg-amber-100 text-amber-700',
    unpaid: 'bg-red-100 text-red-600',
  }
  const STATUS_LABEL: Record<string, string> = { approved: 'Pagado', pending_approval: 'Pendiente', unpaid: 'No pagado' }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-5">
        {/* BCV Banner */}
        <div className="g-bg rounded-xl px-5 py-3.5 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">Tasa BCV oficial del día</p>
              {bcvLoading ? (
                <div className="flex items-center gap-1.5 text-white"><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="text-sm">Cargando...</span></div>
              ) : bcvRate ? (
                <p className="text-xl font-bold text-white">Bs. {bcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} <span className="text-sm font-normal text-white/70">/ USD</span></p>
              ) : (
                <p className="text-sm text-white/70">No disponible</p>
              )}
            </div>
          </div>
          {bcvRate && (
            <div className="ml-4 pl-4 border-l border-white/20 flex gap-4">
              <div><p className="text-xs text-white/60">$20 USD =</p><p className="text-sm font-bold text-white">Bs. {(20 * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</p></div>
              <div><p className="text-xs text-white/60">$50 USD =</p><p className="text-sm font-bold text-white">Bs. {(50 * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</p></div>
            </div>
          )}
          {bcvUpdated && <p className="ml-auto text-xs text-white/50">Actualizado: {bcvUpdated}</p>}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-emerald-600" /><span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Ingresos</span></div>
            <p className="text-2xl font-bold text-emerald-700">${totalIncome.toLocaleString()}</p>
            <p className="text-xs text-emerald-500 mt-0.5">{income.length} consultas pagadas</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-xs font-semibold text-red-500 uppercase tracking-widest">Gastos</span></div>
            <p className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString()}</p>
            <p className="text-xs text-red-400 mt-0.5">{expenses.length} rubros de gasto</p>
          </div>
          <div className={`border rounded-xl p-5 ${netPL >= 0 ? 'bg-teal-50 border-teal-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-center gap-2 mb-2"><BarChart2 className={`w-4 h-4 ${netPL >= 0 ? 'text-teal-600' : 'text-orange-500'}`} /><span className={`text-xs font-semibold uppercase tracking-widest ${netPL >= 0 ? 'text-teal-600' : 'text-orange-500'}`}>Resultado neto</span></div>
            <p className={`text-2xl font-bold ${netPL >= 0 ? 'text-teal-700' : 'text-orange-600'}`}>{netPL >= 0 ? '+' : ''}${netPL.toLocaleString()}</p>
            <p className={`text-xs mt-0.5 ${netPL >= 0 ? 'text-teal-500' : 'text-orange-400'}`}>{netPL >= 0 ? 'Ganancia' : 'Pérdida'} neta</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {([['income', 'Ingresos'], ['insurance', 'Por cobrar'], ['expenses', 'Gastos'], ['pl', 'Balance P&L'], ['payments', 'Estado de Pagos']] as [Tab | 'insurance', string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t as Tab)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
          ))}
        </div>

        {/* INCOME TAB */}
        {tab === 'income' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Ingresos por consultas</p>
              <span className="text-xs text-slate-400">Solo consultas con pago verificado</span>
            </div>
            {loadingIncome ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Cargando ingresos...</div>
            ) : income.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <DollarSign className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-slate-500 font-semibold text-sm">Sin ingresos aún</p>
                <p className="text-slate-400 text-xs mt-1">Los ingresos aparecen cuando marcas consultas como &ldquo;Pago verificado&rdquo;</p>
              </div>
            ) : income.map((item, i) => (
              <div key={item.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < income.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><DollarSign className="w-4 h-4 text-emerald-500" /></div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.description}</p>
                  <p className="text-xs text-slate-400">{item.source} · {new Date(item.date).toLocaleDateString('es-VE')}</p>
                </div>
                <span className="font-bold text-emerald-600 text-sm">+${item.amount_usd}</span>
                {bcvRate && <span className="text-xs text-slate-400 font-medium">Bs.{(item.amount_usd * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</span>}
              </div>
            ))}
          </div>
        )}

        {/* INSURANCE PAYMENTS TAB */}
        {tab === 'insurance' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Por cobrar a aseguradoras</p>
                <span className="text-xs text-slate-400">Consultas con pago vía seguro</span>
              </div>

              <div className="p-5 space-y-4">
                {/* Mock insurance data for demo */}
                {[
                  { insurer: 'Seguros Mercantil', consultations: 3, total: 60, items: [
                    { code: 'CON-20260401-1234', patient: 'María González', amount: 20, date: '2026-04-01', due: '2026-04-11', status: 'vigente' },
                    { code: 'CON-20260402-5678', patient: 'Juan Pérez', amount: 20, date: '2026-04-02', due: '2026-04-12', status: 'vigente' },
                    { code: 'CON-20260405-9012', patient: 'Carlos López', amount: 20, date: '2026-04-05', due: '2026-04-15', status: 'vigente' }
                  ]},
                  { insurer: 'Mapfre', consultations: 2, total: 40, items: [
                    { code: 'CON-20260330-3456', patient: 'Ana Rodríguez', amount: 20, date: '2026-03-30', due: '2026-04-14', status: 'vigente' },
                    { code: 'CON-20260325-7890', patient: 'Isabel García', amount: 20, date: '2026-03-25', due: '2026-04-09', status: 'vencido' }
                  ]},
                ].map((group) => (
                  <div key={group.insurer} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{group.insurer}</p>
                        <p className="text-xs text-slate-500">{group.consultations} consultas · Total: ${group.total} USD</p>
                      </div>
                      <span className="text-lg font-bold text-teal-600">${group.total}</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {group.items.map((item: any) => (
                        <div key={item.code} className="px-4 py-3 flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{item.code}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{item.patient} · {new Date(item.date).toLocaleDateString('es-VE')}</p>
                            <p className="text-xs text-slate-400 mt-1">Vencimiento: {new Date(item.due).toLocaleDateString('es-VE')}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-teal-600">${item.amount}</p>
                            <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full mt-1 ${item.status === 'vigente' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                              {item.status === 'vigente' ? 'Vigente' : 'Vencido'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-teal-600 uppercase">Total por cobrar</p>
                <p className="text-2xl font-bold text-teal-700 mt-1">$100</p>
                <p className="text-xs text-teal-600 mt-1">5 consultas</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-emerald-600 uppercase">Vigente</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">$80</p>
                <p className="text-xs text-emerald-600 mt-1">4 consultas</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-red-600 uppercase">Vencido</p>
                <p className="text-2xl font-bold text-red-600 mt-1">$20</p>
                <p className="text-xs text-red-600 mt-1">1 consulta</p>
              </div>
            </div>
          </div>
        )}

        {/* EXPENSES TAB */}
        {tab === 'expenses' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Gastos del consultorio</p>
                <button onClick={() => setShowExpenseForm(true)} className="g-bg flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90"><Plus className="w-3.5 h-3.5" /> Agregar gasto</button>
              </div>
              {expenses.map((exp, i) => {
                const cat = EXPENSE_CATEGORIES.find(c => c.value === exp.category)
                return (
                  <div key={exp.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < expenses.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${CAT_COLORS[exp.category]}`}>{cat?.icon}{cat?.label}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{exp.description}</p>
                      <p className="text-xs text-slate-400">{exp.recurring ? `Recurrente · día ${exp.day_of_month} de cada mes` : 'Único'}</p>
                    </div>
                    <span className="font-bold text-red-500 text-sm">-${exp.amount_usd}</span>
                    <button onClick={() => setExpenses(p => p.filter(e => e.id !== exp.id))} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                )
              })}
            </div>
            {showExpenseForm && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Nuevo gasto</p>
                  <button onClick={() => setShowExpenseForm(false)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-500" /></button>
                </div>
                <form onSubmit={addExpense} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label><input value={newExp.description} onChange={e => setNewExp(p => ({ ...p, description: e.target.value }))} placeholder="Ej: Alquiler consultorio" className={finput} required /></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Monto (USD)</label><input type="number" min="0" step="0.01" value={newExp.amount_usd} onChange={e => setNewExp(p => ({ ...p, amount_usd: e.target.value }))} placeholder="100" className={finput} required /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
                      <select value={newExp.category} onChange={e => setNewExp(p => ({ ...p, category: e.target.value }))} className={finput}>
                        {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                      <div className="flex gap-2 h-[38px]">
                        <button type="button" onClick={() => setNewExp(p => ({ ...p, recurring: true }))} className={`flex-1 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${newExp.recurring ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500'}`}><Calendar className="w-3.5 h-3.5" />Recurrente</button>
                        <button type="button" onClick={() => setNewExp(p => ({ ...p, recurring: false }))} className={`flex-1 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${!newExp.recurring ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500'}`}><Check className="w-3.5 h-3.5" />Único</button>
                      </div>
                    </div>
                  </div>
                  {newExp.recurring && <div><label className="block text-xs font-medium text-slate-600 mb-1">Día del mes</label><input type="number" min="1" max="31" value={newExp.day_of_month} onChange={e => setNewExp(p => ({ ...p, day_of_month: e.target.value }))} className={finput} /></div>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setShowExpenseForm(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">Cancelar</button>
                    <button type="submit" className="flex-1 g-bg py-2 rounded-xl text-xs font-bold text-white">Guardar gasto</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* P&L TAB */}
        {tab === 'pl' && (
          <div className="space-y-4">
            {/* Month filter */}
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-sm font-medium text-slate-600">Filtrar por mes:</span>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-teal-400 text-slate-700 capitalize">
                {MONTHS.map(m => <option key={m.value} value={m.value} className="capitalize">{m.label}</option>)}
              </select>
            </div>

            {/* Daily chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Ingresos vs. Gastos por día</p>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Sin datos para este mes</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip formatter={(v) => [`$${v as number}`, '']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gastos" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* P&L breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><p className="text-sm font-semibold text-slate-700">Desglose del período</p></div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-slate-100"><span className="text-sm font-medium text-slate-600">Total ingresos</span><span className="font-bold text-emerald-600">+${totalIncome.toLocaleString()}</span></div>
                {EXPENSE_CATEGORIES.map(cat => {
                  const catTotal = expenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.amount_usd, 0)
                  if (catTotal === 0) return null
                  return <div key={cat.value} className="flex items-center justify-between py-2 pl-4"><span className="text-sm text-slate-500 flex items-center gap-1.5">{cat.icon}{cat.label}</span><span className="text-sm text-red-500">-${catTotal.toLocaleString()}</span></div>
                })}
                <div className="flex items-center justify-between py-3 border-t border-slate-100"><span className="text-sm font-medium text-slate-600">Total gastos</span><span className="font-bold text-red-500">-${totalExpenses.toLocaleString()}</span></div>
                <div className={`flex items-center justify-between py-4 px-4 rounded-xl ${netPL >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className={`font-bold ${netPL >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>Resultado neto</span>
                  <span className={`text-xl font-extrabold ${netPL >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{netPL >= 0 ? '+' : ''}${netPL.toLocaleString()}</span>
                </div>
                {bcvRate && <p className="text-xs text-slate-400 text-center">Equivalente: Bs. {(netPL * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</p>}
              </div>
            </div>
          </div>
        )}

        {/* PAYMENTS STATUS TAB */}
        {tab === 'payments' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'approved', label: 'Pagados', color: 'bg-emerald-50 border-emerald-200 text-emerald-700', count: allPayments.filter(p => p.payment_status === 'approved').length },
                { key: 'pending_approval', label: 'Pendientes', color: 'bg-amber-50 border-amber-200 text-amber-700', count: allPayments.filter(p => p.payment_status === 'pending_approval').length },
                { key: 'unpaid', label: 'No pagados', color: 'bg-red-50 border-red-200 text-red-600', count: allPayments.filter(p => p.payment_status === 'unpaid').length },
              ].map(s => (
                <button key={s.key} onClick={() => setPaymentFilter(paymentFilter === s.key ? 'all' : s.key)}
                  className={`border rounded-xl p-4 text-center transition-all ${s.color} ${paymentFilter === s.key ? 'ring-2 ring-offset-1 ring-teal-400' : ''}`}>
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-xs font-semibold mt-0.5">{s.label}</p>
                </button>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Todas las consultas</p>
                <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-teal-400 text-slate-600">
                  <option value="all">Todos los estados</option>
                  <option value="approved">Pagados</option>
                  <option value="pending_approval">Pendientes</option>
                  <option value="unpaid">No pagados</option>
                </select>
              </div>

              {filteredPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Receipt className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-slate-400 text-sm">Sin consultas en este filtro</p>
                </div>
              ) : filteredPayments.map((p, i) => (
                <div key={p.id} className={`flex items-start gap-4 px-5 py-4 ${i < filteredPayments.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-800">{p.consultation_code}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.payment_status]}`}>{STATUS_LABEL[p.payment_status]}</span>
                    </div>
                    <p className="text-xs text-slate-400">{p.patient_name} · {new Date(p.date).toLocaleDateString('es-VE')}</p>

                    {/* Payment method selector */}
                    {p.payment_status === 'approved' && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {PAYMENT_METHODS.map(m => (
                          <button key={m.value} onClick={() => updatePaymentMethod(p.id, m.value)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${p.payment_method === m.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            {m.icon}{m.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${p.payment_status === 'approved' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {p.payment_status === 'approved' ? `+$${p.amount_usd}` : `$${p.amount_usd}`}
                    </p>
                    {p.payment_method && <p className="text-[10px] text-slate-400 mt-0.5">{PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const finput = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
