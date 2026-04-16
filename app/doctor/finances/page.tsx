'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Plus, X, Calendar, Building, Users2, Receipt, BarChart2, Trash2, Check, RefreshCw, CreditCard, Smartphone, ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type IncomeEntry = { id: string; description: string; amount_usd: number; date: string; source: string }
type ExpenseEntry = { id: string; description: string; amount_usd: number; category: string; recurring: boolean; day_of_month?: number }
type PaymentEntry = { id: string; consultation_code: string; patient_name: string; date: string; amount_usd: number; payment_status: string; payment_method?: string }
type InsurancePayment = { consultation_code: string; patient_name: string; amount_usd: number; consultation_date: string; insurance_name: string; credit_days: number; due_date: string; status: 'vigente' | 'vencido' }
type AccountPayable = { id: string; vendor_name: string; concept: string; amount: number; due_date: string; paid: boolean }

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

type Tab = 'overview' | 'income' | 'expenses' | 'pl' | 'payments' | 'insurance'

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
  const [tab, setTab] = useState<Tab>('overview')

  // BCV rate
  const [bcvRate, setBcvRate] = useState<number | null>(null)
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

  // Accounts Payable
  const [accountsPayable, setAccountsPayable] = useState<AccountPayable[]>([])

  // Insurance filter & expansion
  const [selectedInsurance, setSelectedInsurance] = useState<string>('all')
  const [expandedInsurances, setExpandedInsurances] = useState<Set<string>>(new Set())

  // Doctor insurances
  const [doctorInsurances, setDoctorInsurances] = useState<Array<{ id: string; name: string }>>([])

  // Balance filter
  const MONTHS = getMonthOptions()
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0].value)

  const totalIncome = income.reduce((s, i) => s + i.amount_usd, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount_usd, 0)
  const totalAccountsPayable = accountsPayable.reduce((s, ap) => s + ap.amount, 0)
  const netPL = totalIncome - totalExpenses
  const chartData = buildDailyData(income, expenses, selectedMonth)

  // CxC: unpaid + pending_approval consultations
  const totalCxC = allPayments
    .filter(p => p.payment_status === 'unpaid' || p.payment_status === 'pending_approval')
    .reduce((s, p) => s + p.amount_usd, 0)

  useEffect(() => {
    // Fetch BCV rate
    const getBCVRate = async () => {
      try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial')
        const data = await res.json()
        const rate = data.promedio ?? data.precio ?? data.price ?? null
        if (rate) {
          setBcvRate(parseFloat(rate))
        } else {
          throw new Error('No rate found')
        }
      } catch {
        try {
          const res = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv')
          const data = await res.json()
          if (data.price) {
            setBcvRate(parseFloat(data.price))
          } else {
            // TODO: conectar BCV real
            setBcvRate(36.50)
          }
        } catch {
          // TODO: conectar BCV real
          setBcvRate(36.50)
        }
      } finally {
        setBcvLoading(false)
      }
    }
    getBCVRate()

    // Fetch consultations data & doctor insurances
    const loadData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Consultations
      try {
        const { data } = await supabase
          .from('consultations')
          .select('id, consultation_code, consultation_date, payment_status, amount, patients(full_name)')
          .eq('doctor_id', user.id)
          .order('consultation_date', { ascending: false })
        const all: PaymentEntry[] = (data ?? []).map((c: any) => ({
          id: c.id,
          consultation_code: c.consultation_code,
          patient_name: !Array.isArray(c.patients) && c.patients ? c.patients.full_name : 'Paciente',
          date: c.consultation_date,
          amount_usd: Number(c.amount) || 20,
          payment_status: c.payment_status,
          payment_method: undefined,
        }))
        setAllPayments(all)
        setIncome(all.filter(p => p.payment_status === 'approved').map(p => ({
          id: p.id, description: `Consulta ${p.consultation_code}`, amount_usd: p.amount_usd, date: p.date, source: p.patient_name,
        })))
      } catch { /* ignore */ }
      setLoadingIncome(false)

      // Doctor insurances
      try {
        const { data } = await supabase
          .from('doctor_insurances')
          .select('id, name')
          .eq('doctor_id', user.id)
        setDoctorInsurances((data ?? []).map((d: any) => ({ id: d.id, name: d.name })))
      } catch { /* ignore */ }

      // Accounts payable (tabla opcional)
      try {
        const { data: ap } = await supabase
          .from('accounts_payable')
          .select('id, vendor_name, concept, amount, due_date, paid')
          .eq('doctor_id', user.id)
        setAccountsPayable((ap ?? []).map((d: any) => ({
          id: d.id, vendor_name: d.vendor_name, concept: d.concept,
          amount: Number(d.amount), due_date: d.due_date, paid: d.paid,
        })))
      } catch { /* tabla puede no existir aún */ }
    }
    loadData()
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

  function toggleInsuranceExpanded(insuranceName: string) {
    setExpandedInsurances(prev => {
      const newSet = new Set(prev)
      if (newSet.has(insuranceName)) {
        newSet.delete(insuranceName)
      } else {
        newSet.add(insuranceName)
      }
      return newSet
    })
  }

  async function markInsurancePaid(consultationId: string) {
    try {
      const supabase = createClient()
      await supabase
        .from('consultations')
        .update({ payment_status: 'approved', insurance_paid_at: new Date().toISOString() })
        .eq('id', consultationId)

      // Update local state
      setAllPayments(prev => prev.map(p => p.id === consultationId ? { ...p, payment_status: 'approved' } : p))
      setIncome(prev => {
        const p = allPayments.find(x => x.id === consultationId)
        if (p) {
          return [...prev, { id: p.id, description: `Consulta ${p.consultation_code}`, amount_usd: p.amount_usd, date: p.date, source: p.patient_name }]
        }
        return prev
      })
    } catch (error) {
      // Column might not exist, ignore silently
    }
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

      <div className="max-w-6xl space-y-5">
        {/* BCV Banner - Simple single line */}
        <div className="g-bg rounded-xl px-5 py-3.5 flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-white shrink-0" />
          <p className="text-white font-medium text-sm">1 USD = Bs.S {bcvLoading ? '...' : (bcvRate?.toLocaleString('es-VE', { minimumFractionDigits: 2 }) ?? '36.50')}</p>
        </div>

        {/* KPI Cards - 6 in responsive grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Ingresos - Green */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-emerald-600" /><span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Ingresos</span></div>
            <p className="text-xl font-bold text-emerald-700">${totalIncome.toLocaleString()}</p>
          </div>

          {/* Gastos - Red */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-xs font-semibold text-red-500 uppercase tracking-widest">Gastos</span></div>
            <p className="text-xl font-bold text-red-600">${totalExpenses.toLocaleString()}</p>
          </div>

          {/* CxC - Amber */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><Receipt className="w-4 h-4 text-amber-600" /><span className="text-xs font-semibold text-amber-600 uppercase tracking-widest">CxC</span></div>
            <p className="text-xl font-bold text-amber-700">${totalCxC.toLocaleString()}</p>
          </div>

          {/* CxP - Violet */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-violet-600" /><span className="text-xs font-semibold text-violet-600 uppercase tracking-widest">CxP</span></div>
            <p className="text-xl font-bold text-violet-700">${totalAccountsPayable.toLocaleString()}</p>
          </div>

          {/* Estado de Pagos - Slate */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><CreditCard className="w-4 h-4 text-slate-600" /><span className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Estado</span></div>
            <p className="text-xl font-bold text-slate-700">{allPayments.filter(p => p.payment_status === 'approved').length}/{allPayments.length}</p>
          </div>

          {/* P&L - Teal */}
          <div className={`bg-white border rounded-xl p-4 ${netPL >= 0 ? 'border-teal-200' : 'border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2"><BarChart2 className={`w-4 h-4 ${netPL >= 0 ? 'text-teal-600' : 'text-red-600'}`} /><span className={`text-xs font-semibold uppercase tracking-widest ${netPL >= 0 ? 'text-teal-600' : 'text-red-600'}`}>P&L</span></div>
            <p className={`text-xl font-bold ${netPL >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{netPL >= 0 ? '+' : ''}${netPL.toLocaleString()}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {([['overview', 'Resumen'], ['income', 'Ingresos'], ['insurance', 'Seguros'], ['expenses', 'Gastos'], ['pl', 'Balance P&L'], ['payments', 'Estado Pagos']] as [Tab | 'insurance', string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t as Tab)} className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${tab === t ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Resumen financiero</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Ingresos verificados</span>
                  <span className="font-bold text-emerald-600">+${totalIncome.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Gastos totales</span>
                  <span className="font-bold text-red-600">-${totalExpenses.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Cuentas por cobrar (CxC)</span>
                  <span className="font-bold text-amber-600">${totalCxC.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Cuentas por pagar (CxP)</span>
                  <span className="font-bold text-violet-600">${totalAccountsPayable.toLocaleString()}</span>
                </div>
                <div className={`flex items-center justify-between py-3 px-4 rounded-xl ${netPL >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className={`font-bold ${netPL >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>Balance P&L</span>
                  <span className={`text-lg font-extrabold ${netPL >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{netPL >= 0 ? '+' : ''}${netPL.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* INSURANCE PAYMENTS TAB - Accordion Style */}
        {tab === 'insurance' && (
          <div className="space-y-4">
            {/* Insurance Filter Dropdown */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <label className="block text-xs font-medium text-slate-600 mb-2">Filtrar por asegurador</label>
              <select
                value={selectedInsurance}
                onChange={(e) => setSelectedInsurance(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 text-slate-700"
              >
                <option value="all">Todos los aseguradores</option>
                {doctorInsurances.map(ins => (
                  <option key={ins.id} value={ins.name}>{ins.name}</option>
                ))}
              </select>
            </div>

            {/* Accordion List */}
            <div className="space-y-3">
              {doctorInsurances.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
                  <p className="text-slate-500 text-sm">No hay aseguradores registrados</p>
                </div>
              ) : doctorInsurances.map((insurance) => {
                const insurancePayments = allPayments.filter(p => p.patient_name === insurance.name)
                const totalByInsurance = insurancePayments.reduce((s, p) => s + p.amount_usd, 0)

                if (selectedInsurance !== 'all' && selectedInsurance !== insurance.name) return null

                return (
                  <div key={insurance.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {/* Accordion Header */}
                    <button
                      onClick={() => toggleInsuranceExpanded(insurance.name)}
                      className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="text-left">
                        <p className="font-semibold text-slate-800">{insurance.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{insurancePayments.length} consultas · Total: ${totalByInsurance.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-teal-600">${totalByInsurance.toLocaleString()}</span>
                        {expandedInsurances.has(insurance.name) ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {/* Accordion Content */}
                    {expandedInsurances.has(insurance.name) && (
                      <div className="divide-y divide-slate-100">
                        {insurancePayments.length === 0 ? (
                          <div className="px-5 py-4 text-center text-slate-400 text-sm">
                            Sin consultas para este asegurador
                          </div>
                        ) : insurancePayments.map((payment) => (
                          <div key={payment.id} className="px-5 py-4 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800">{payment.consultation_code}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{payment.patient_name} · {new Date(payment.date).toLocaleDateString('es-VE')}</p>
                              <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full mt-1.5 ${payment.payment_status === 'approved' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                                {payment.payment_status === 'approved' ? 'Pagado' : 'Pendiente'}
                              </span>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-2">
                              <p className="text-sm font-bold text-teal-600">${payment.amount_usd}</p>
                              {payment.payment_status !== 'approved' && (
                                <button
                                  onClick={() => markInsurancePaid(payment.id)}
                                  className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-teal-400 bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" /> Pagado
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
