'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Shield, Bell, Database,
  CreditCard, Plus, Trash2, Save,
  Loader2, Banknote, CheckCircle2,
  FileText, RefreshCw, Building2,
  ChevronDown, ChevronUp,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type PaymentAccount = {
  id: string
  type: 'pago_movil' | 'bank_transfer' | 'zelle' | 'otro'
  bank_name: string
  account_holder: string
  phone: string
  rif: string
  notes: string
}

type SettingsData = {
  doctors: number
  patients: number
  appointments: number
  region: string
  supabaseUrl: string
}

type BillingData = {
  razon_social: string
  rif: string
  domicilio_fiscal: string
  telefono: string
  email: string
  codigo_actividad: string
  iva_percent: number
  igtf_percent: number
  control_prefix: string
  next_control_number: number
  moneda_base: string
  nota_legal_iva: string
  nota_legal_igtf: string
}

const DEFAULT_BILLING: BillingData = {
  razon_social: 'Delta Medical CRM, C.A.',
  rif: 'J-50000000-0',
  domicilio_fiscal: 'Av. Francisco de Miranda, Torre Delta, Piso 5, Of. 5-A, Urb. El Rosal, Caracas, Miranda, Zona Postal 1060',
  telefono: '+58 212 000 0000',
  email: 'facturacion@deltamedical.ve',
  codigo_actividad: '6201',
  iva_percent: 16,
  igtf_percent: 3,
  control_prefix: '00-',
  next_control_number: 1,
  moneda_base: 'USD',
  nota_legal_iva: 'Este documento se expresa en Bolívares con su equivalencia en divisas al tipo de cambio corriente del mercado a la fecha de su emisión, según lo establecido en el artículo 13 numeral 14 de la Providencia Administrativa SNAT/2011/0071 en concordancia con el artículo 128 de la Ley del Banco Central de Venezuela (BCV).',
  nota_legal_igtf: 'Este pago estará sujeto al cobro adicional del 3% del Impuesto a las Grandes Transacciones Financieras (IGTF), de conformidad con la Providencia Administrativa SNAT/2022/000013 publicada en la G.O. N° 42.339 del 17-03-2022, en caso de ser cancelado en divisas.',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-teal-500' : 'bg-slate-200'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${enabled ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  bank_transfer: 'Transferencia Bancaria',
  zelle: 'Zelle',
  otro: 'Otro',
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 py-2.5 border-b border-slate-50 last:border-0">
      <label className="text-xs font-medium text-slate-500 sm:pt-2">{label}</label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SettingsPage() {
  // Datos del sistema
  const [settingsData, setSettingsData] = useState<SettingsData | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  // Reminder toggles (local state - requires Edge Functions to persist)
  const [rem7d, setRem7d]   = useState(true)
  const [rem24h, setRem24h] = useState(true)
  const [rem3h, setRem3h]   = useState(true)
  const [rem1h, setRem1h]   = useState(false)

  // Cuentas de cobro
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccount, setNewAccount] = useState<Omit<PaymentAccount, 'id'>>({
    type: 'pago_movil', bank_name: '', account_holder: '', phone: '', rif: '', notes: '',
  })
  const [savingAccount, setSavingAccount] = useState(false)

  // Datos de facturación
  const [billing, setBilling] = useState<BillingData>(DEFAULT_BILLING)
  const [savingBilling, setSavingBilling] = useState(false)
  const [billingSaved, setBillingSaved] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)

  // Tasa BCV
  const [bcvRate, setBcvRate] = useState<number | null>(null)
  const [bcvDate, setBcvDate] = useState<string>('')
  const [loadingBcv, setLoadingBcv] = useState(false)
  const [manualRate, setManualRate] = useState('')

  // Fetch settings data on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings-data')
        if (res.ok) {
          const data = await res.json()
          setSettingsData(data)
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        setLoadingData(false)
      }
    }
    fetchSettings()
  }, [])

  // Fetch BCV rate on mount
  useEffect(() => {
    fetchBcvRate()
  }, [])

  async function fetchBcvRate() {
    setLoadingBcv(true)
    try {
      const res = await fetch('/api/admin/bcv-rate')
      if (res.ok) {
        const data = await res.json()
        setBcvRate(data.rate)
        setBcvDate(data.date)
        setManualRate(data.rate?.toString() || '')
      }
    } catch (error) {
      console.error('Failed to fetch BCV rate:', error)
    } finally {
      setLoadingBcv(false)
    }
  }

  function updateBilling(field: keyof BillingData, value: string | number) {
    setBilling(prev => ({ ...prev, [field]: value }))
    setBillingSaved(false)
  }

  function saveBillingData() {
    setSavingBilling(true)
    // Save to localStorage for now (in production this would be an API call to Supabase)
    setTimeout(() => {
      try {
        localStorage.setItem('delta_billing_data', JSON.stringify(billing))
        setBillingSaved(true)
      } catch { /* SSR safety */ }
      setSavingBilling(false)
    }, 500)
  }

  // Load billing from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('delta_billing_data')
      if (stored) {
        setBilling({ ...DEFAULT_BILLING, ...JSON.parse(stored) })
      }
    } catch { /* SSR safety */ }
  }, [])

  function addAccount() {
    if (!newAccount.account_holder) return
    setSavingAccount(true)
    setTimeout(() => {
      setAccounts(prev => [...prev, { ...newAccount, id: Date.now().toString() }])
      setNewAccount({ type: 'pago_movil', bank_name: '', account_holder: '', phone: '', rif: '', notes: '' })
      setShowAddAccount(false)
      setSavingAccount(false)
    }, 600)
  }

  function removeAccount(id: string) {
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-5xl px-4 sm:px-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Configuración</h2>
        <p className="text-slate-400 text-xs sm:text-sm mt-1">Información del sistema, facturación y ajustes de plataforma</p>
      </div>

      {/* ── Datos de Facturación (Delta) — Collapsible ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setBillingOpen(!billingOpen)}
          className="w-full flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0 text-left">
              <h3 className="text-sm font-semibold text-slate-900">Datos de Facturación — Emisor</h3>
              <p className="text-xs text-slate-400 truncate">Datos fiscales de Delta que aparecen como remitente en las facturas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {!billingOpen && (
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full hidden sm:inline">{billing.rif}</span>
            )}
            {billingOpen ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </button>

        {billingOpen && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 border-t border-slate-100">
          {/* Save button */}
          <div className="flex justify-end pt-3">
            <button
              onClick={saveBillingData}
              disabled={savingBilling}
              className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {savingBilling ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...</>
              ) : billingSaved ? (
                <><CheckCircle2 className="w-3.5 h-3.5" /> Guardado</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> Guardar cambios</>
              )}
            </button>
          </div>

          {/* Datos fiscales del emisor */}
          <div className="space-y-0">
          <FieldRow label="Razón Social *">
            <input
              type="text"
              value={billing.razon_social}
              onChange={e => updateBilling('razon_social', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
            />
          </FieldRow>

          <FieldRow label="RIF *">
            <input
              type="text"
              value={billing.rif}
              onChange={e => updateBilling('rif', e.target.value)}
              placeholder="J-12345678-9"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
            />
          </FieldRow>

          <FieldRow label="Domicilio Fiscal *">
            <textarea
              value={billing.domicilio_fiscal}
              onChange={e => updateBilling('domicilio_fiscal', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white resize-none"
            />
          </FieldRow>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <FieldRow label="Teléfono">
              <input
                type="text"
                value={billing.telefono}
                onChange={e => updateBilling('telefono', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              />
            </FieldRow>
            <FieldRow label="Email Facturación">
              <input
                type="email"
                value={billing.email}
                onChange={e => updateBilling('email', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              />
            </FieldRow>
          </div>

          <FieldRow label="Código de Actividad">
            <input
              type="text"
              value={billing.codigo_actividad}
              onChange={e => updateBilling('codigo_actividad', e.target.value)}
              placeholder="6201"
              className="w-full max-w-[120px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
            />
          </FieldRow>
        </div>

        {/* Impuestos */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Impuestos</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">IVA (%)</label>
              <input
                type="number"
                value={billing.iva_percent}
                onChange={e => updateBilling('iva_percent', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">IGTF (%)</label>
              <input
                type="number"
                value={billing.igtf_percent}
                onChange={e => updateBilling('igtf_percent', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Moneda base</label>
              <select
                value={billing.moneda_base}
                onChange={e => updateBilling('moneda_base', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              >
                <option value="USD">USD (Dólar)</option>
                <option value="VES">VES (Bolívares)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Numeración de control */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Numeración de Control</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Prefijo N° de Control</label>
              <input
                type="text"
                value={billing.control_prefix}
                onChange={e => updateBilling('control_prefix', e.target.value)}
                placeholder="00-"
                className="w-full max-w-[120px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Próximo N° de Control</label>
              <input
                type="number"
                value={billing.next_control_number}
                onChange={e => updateBilling('next_control_number', parseInt(e.target.value) || 1)}
                className="w-full max-w-[180px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Siguiente: {billing.control_prefix}{String(billing.next_control_number).padStart(8, '0')}</p>
            </div>
          </div>
        </div>

        {/* Notas legales */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Notas Legales (pie de factura)</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Nota IVA / BCV</label>
              <textarea
                value={billing.nota_legal_iva}
                onChange={e => updateBilling('nota_legal_iva', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white resize-none text-slate-600"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Nota IGTF</label>
              <textarea
                value={billing.nota_legal_igtf}
                onChange={e => updateBilling('nota_legal_igtf', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white resize-none text-slate-600"
              />
            </div>
          </div>
        </div>
        </div>
        )}
      </div>

      {/* ── Tasa BCV ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">Tasa de Cambio BCV</h3>
              <p className="text-xs text-slate-400 truncate">Se usa al emitir facturas para convertir USD → Bolívares</p>
            </div>
          </div>
          <button
            onClick={fetchBcvRate}
            disabled={loadingBcv}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-teal-600 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBcv ? 'animate-spin' : ''}`} /> Actualizar tasa
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
            <p className="text-xs font-medium text-emerald-600 mb-1">Tasa BCV actual</p>
            <p className="text-3xl font-extrabold text-emerald-700">
              {loadingBcv ? (
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
              ) : bcvRate ? (
                <>Bs. {bcvRate.toFixed(4)}</>
              ) : (
                <span className="text-lg text-slate-400">No disponible</span>
              )}
            </p>
            {bcvDate && <p className="text-xs text-emerald-500 mt-1">{bcvDate}</p>}
          </div>

          <div className="sm:col-span-2 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Tasa manual (si el BCV no responde)</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 font-medium">1 USD =</span>
                <input
                  type="number"
                  step="0.0001"
                  value={manualRate}
                  onChange={e => setManualRate(e.target.value)}
                  placeholder="0.0000"
                  className="w-40 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white font-mono"
                />
                <span className="text-sm text-slate-500 font-medium">Bs.</span>
                <button
                  onClick={() => {
                    const rate = parseFloat(manualRate)
                    if (rate > 0) {
                      setBcvRate(rate)
                      setBcvDate('Manual — ' + new Date().toLocaleDateString('es-VE'))
                    }
                  }}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 px-2 py-1.5 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <p className="text-xs text-amber-700">
                <strong>Nota:</strong> La tasa de cambio se incluirá automáticamente al emitir una factura.
                Los montos en Bs. se calcularán multiplicando el monto USD por la tasa vigente al momento de emisión.
              </p>
            </div>

            {bcvRate && (
              <div className="text-xs text-slate-400 space-y-1">
                <p>Ejemplo: Plan Professional $30 USD = <strong className="text-slate-700">Bs. {(30 * bcvRate).toFixed(2)}</strong></p>
                <p>Ejemplo: Plan Enterprise $100 USD = <strong className="text-slate-700">Bs. {(100 * bcvRate).toFixed(2)}</strong></p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Previsualización de factura ── */}
      {bcvRate && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-rose-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Previsualización de Factura</h3>
              <p className="text-xs text-slate-400">Así se verá una factura emitida (ejemplo: Plan Professional $30)</p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 sm:p-6 bg-slate-50 text-xs space-y-4 font-mono max-w-2xl">
            {/* Header emisor */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-teal-700">DELTA MEDICAL CRM</p>
                <p className="text-slate-500 mt-0.5">{billing.razon_social}</p>
                <p className="text-slate-500">{billing.rif}</p>
                <p className="text-slate-400 max-w-[250px]">{billing.domicilio_fiscal}</p>
                <p className="text-slate-400">{billing.telefono}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm font-bold text-slate-900">FACTURA</p>
                <p className="text-slate-500">N° de Documento: <span className="font-semibold text-slate-700">FAC-20260417-0001</span></p>
                <p className="text-slate-500">Fecha: <span className="font-semibold text-slate-700">{new Date().toLocaleDateString('es-VE')}</span></p>
                <p className="text-slate-500">N° de Control: <span className="font-semibold text-slate-700">{billing.control_prefix}{String(billing.next_control_number).padStart(8, '0')}</span></p>
                <p className="text-slate-500">Tasa BCV: <span className="font-semibold text-slate-700">Bs. {bcvRate.toFixed(4)}</span></p>
                <p className="text-slate-500">Moneda: <span className="font-semibold text-slate-700">{billing.moneda_base}</span></p>
              </div>
            </div>

            {/* Destinatario */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Destinatario</p>
              <p className="text-slate-700 font-semibold">Dr. Carlos Ramírez</p>
              <p className="text-slate-500">V-12345678</p>
              <p className="text-slate-400">Consultorio Cardio Center, Caracas</p>
              <p className="text-slate-400">carlos@email.com</p>
            </div>

            {/* Tabla */}
            <div className="border-t border-slate-200 pt-3">
              <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-200">
                <div className="col-span-1">Cód.</div>
                <div className="col-span-5">Descripción</div>
                <div className="col-span-2 text-right">Cant.</div>
                <div className="col-span-2 text-right">P. Unit.</div>
                <div className="col-span-2 text-right">Monto</div>
              </div>
              <div className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100">
                <div className="col-span-1 text-slate-500">001</div>
                <div className="col-span-5 text-slate-700">Suscripción Plan Professional — Delta Medical CRM (1 mes)</div>
                <div className="col-span-2 text-right text-slate-500">1,00</div>
                <div className="col-span-2 text-right text-slate-500">$30,00</div>
                <div className="col-span-2 text-right font-semibold text-slate-700">$30,00</div>
              </div>
            </div>

            {/* Totales */}
            <div className="border-t border-slate-200 pt-3 flex justify-end">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base Imponible:</span>
                  <span className="text-slate-700">$30,00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Base Imponible (Bs.):</span>
                  <span className="text-slate-700">Bs. {(30 * bcvRate).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IVA {billing.iva_percent}%:</span>
                  <span className="text-slate-700">Bs. {(30 * bcvRate * billing.iva_percent / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IGTF {billing.igtf_percent}% (pago en divisas):</span>
                  <span className="text-slate-700">Bs. {(30 * bcvRate * billing.igtf_percent / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-300 text-sm font-bold">
                  <span className="text-slate-900">Total a Pagar:</span>
                  <span className="text-teal-700">Bs. {(30 * bcvRate * (1 + billing.iva_percent / 100 + billing.igtf_percent / 100)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Equivalente USD:</span>
                  <span>${(30 * (1 + billing.iva_percent / 100 + billing.igtf_percent / 100)).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Nota legal */}
            <div className="border-t border-slate-200 pt-3 text-[9px] text-slate-400 space-y-1">
              <p>{billing.nota_legal_igtf}</p>
              <p>{billing.nota_legal_iva}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Fila superior: Sistema + Seguridad ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

        {/* Sistema */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0"><Settings className="w-4 h-4 text-teal-600" /></div>
            <h3 className="text-sm font-semibold text-slate-900">Sistema</h3>
          </div>
          <div className="space-y-2">
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-xs font-medium text-slate-500 block mb-1">Plataforma</p>
              <p className="text-sm font-semibold text-slate-900">MedSaaS Venezuela</p>
            </div>
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-xs font-medium text-slate-500 block mb-1">Email de soporte</p>
              <p className="text-sm text-slate-700 font-mono">soporte@medsaas.ve</p>
            </div>
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-xs font-medium text-slate-500 block mb-1">Moneda</p>
              <p className="text-sm font-semibold text-slate-900">USD</p>
            </div>
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-xs font-medium text-slate-500 block mb-1">Proveedor</p>
              <p className="text-sm font-semibold text-slate-900">Supabase</p>
            </div>
          </div>
        </div>

        {/* Seguridad */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Shield className="w-4 h-4 text-blue-600" /></div>
            <h3 className="text-sm font-semibold text-slate-900">Seguridad</h3>
          </div>
          <div className="space-y-2">
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-sm font-medium text-slate-700">Autenticación</p>
              <p className="text-xs text-slate-400">Supabase Auth con contraseña</p>
              <p className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium mt-1 inline-block">Activa</p>
            </div>
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-sm font-medium text-slate-700">Row Level Security (RLS)</p>
              <p className="text-xs text-slate-400">Aislamiento de datos por tenant</p>
              <p className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-medium mt-1 inline-block">Siempre activo</p>
            </div>
            <div className="py-3 border-b border-slate-50 last:border-0">
              <p className="text-sm font-medium text-slate-700">Estado</p>
              <p className="flex items-center gap-1.5 text-teal-600 text-xs font-medium mt-1"><span className="w-2 h-2 rounded-full bg-teal-500" />Saludable</p>
            </div>
          </div>
        </div>

        {/* Base de datos */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0"><Database className="w-4 h-4 text-violet-600" /></div>
            <h3 className="text-sm font-semibold text-slate-900">Base de datos</h3>
          </div>
          {loadingData ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="py-3 border-b border-slate-50 last:border-0">
                <p className="text-sm text-slate-600">Médicos activos</p>
                <span className="text-sm font-semibold text-slate-900">{settingsData?.doctors || 0}</span>
              </div>
              <div className="py-3 border-b border-slate-50 last:border-0">
                <p className="text-sm text-slate-600">Pacientes</p>
                <span className="text-sm font-semibold text-slate-900">{settingsData?.patients || 0}</span>
              </div>
              <div className="py-3 border-b border-slate-50 last:border-0">
                <p className="text-sm text-slate-600">Citas registradas</p>
                <span className="text-sm font-semibold text-slate-900">{settingsData?.appointments || 0}</span>
              </div>
              <div className="py-3 border-b border-slate-50 last:border-0">
                <p className="text-sm text-slate-600">Región</p>
                <span className="text-sm font-semibold text-slate-900">{settingsData?.region || 'Cargando...'}</span>
              </div>
              <div className="py-3 border-b border-slate-50 last:border-0">
                <p className="text-sm text-slate-600">RLS</p>
                <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-medium">Activas</span>
              </div>
            </div>
          )}
        </div>

        {/* Recordatorios */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Bell className="w-4 h-4 text-amber-600" /></div>
            <h3 className="text-sm font-semibold text-slate-900">Recordatorios</h3>
          </div>
          <div className="text-xs text-slate-400 bg-amber-50 border border-amber-100 rounded-lg p-2 mb-2">Requieren configuración de Edge Functions en Supabase</div>
          <div className="space-y-2">
            {[
              { label: '7 días antes', desc: 'Recordatorio temprano', val: rem7d, set: () => setRem7d(!rem7d) },
              { label: '24 horas antes', desc: 'Mayor tasa de confirmación', val: rem24h, set: () => setRem24h(!rem24h) },
              { label: '3 horas antes', desc: 'Confirmación inminente', val: rem3h, set: () => setRem3h(!rem3h) },
              { label: '1 hora antes', desc: 'Opcional · alta demanda', val: rem1h, set: () => setRem1h(!rem1h) },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                <div><p className="text-sm font-medium text-slate-700">{item.label}</p><p className="text-xs text-slate-400">{item.desc}</p></div>
                <Toggle enabled={item.val} onChange={item.set} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Cuentas de Cobro ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
              <Banknote className="w-4 h-4 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">Cuentas de Cobro</h3>
              <p className="text-xs text-slate-400 truncate">Los médicos verán estas cuentas al registrarse con Plan Pro</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddAccount(!showAddAccount)}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar cuenta
          </button>
        </div>

        {/* Lista de cuentas */}
        {accounts.length === 0 && !showAddAccount && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400">No hay cuentas configuradas todavía</p>
            <p className="text-xs text-slate-300 mt-1">Agrega Pago Móvil, transferencias o Zelle</p>
          </div>
        )}

        {accounts.map(acc => (
          <div key={acc.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full whitespace-nowrap">{ACCOUNT_TYPE_LABELS[acc.type] ?? acc.type}</span>
                {acc.bank_name && <span className="text-xs text-slate-500">{acc.bank_name}</span>}
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{acc.account_holder}</p>
              {acc.phone && <p className="text-xs text-slate-500 font-mono truncate">{acc.phone}</p>}
              {acc.rif && <p className="text-xs text-slate-400">RIF/CI: {acc.rif}</p>}
              {acc.notes && <p className="text-xs text-slate-400 italic">{acc.notes}</p>}
            </div>
            <button onClick={() => removeAccount(acc.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1 shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* Formulario agregar cuenta */}
        {showAddAccount && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 sm:p-5 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nueva cuenta</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Tipo</label>
                <select
                  value={newAccount.type}
                  onChange={e => setNewAccount(p => ({ ...p, type: e.target.value as PaymentAccount['type'] }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                >
                  <option value="pago_movil">Pago Móvil</option>
                  <option value="bank_transfer">Transferencia Bancaria</option>
                  <option value="zelle">Zelle</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Banco</label>
                <input
                  type="text"
                  value={newAccount.bank_name}
                  onChange={e => setNewAccount(p => ({ ...p, bank_name: e.target.value }))}
                  placeholder="Ej. Banesco"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Titular <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={newAccount.account_holder}
                  onChange={e => setNewAccount(p => ({ ...p, account_holder: e.target.value }))}
                  placeholder="Nombre completo"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Teléfono / Número de cuenta</label>
                <input
                  type="text"
                  value={newAccount.phone}
                  onChange={e => setNewAccount(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+58 412 000 0000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">RIF / Cédula</label>
                <input
                  type="text"
                  value={newAccount.rif}
                  onChange={e => setNewAccount(p => ({ ...p, rif: e.target.value }))}
                  placeholder="J-12345678-9 / V-12345678"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Notas adicionales</label>
                <input
                  type="text"
                  value={newAccount.notes}
                  onChange={e => setNewAccount(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej. Solo USD"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <button onClick={() => setShowAddAccount(false)} className="py-2 px-4 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={addAccount} disabled={savingAccount || !newAccount.account_holder} className="py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors disabled:opacity-60">
                {savingAccount ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</> : <><Save className="w-4 h-4" />Guardar cuenta</>}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
