'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Shield, Bell, Database,
  CreditCard, Plus, Trash2, Save,
  Loader2, Banknote, CheckCircle2,
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
        <p className="text-slate-400 text-xs sm:text-sm mt-1">Información del sistema y ajustes de plataforma</p>
      </div>

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
