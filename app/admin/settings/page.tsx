'use client'

import { useEffect, useState } from 'react'
import {
  Shield, Plus, Trash2, Loader2, DollarSign,
  RefreshCw, CheckCircle2, AlertCircle, UserPlus,
} from 'lucide-react'

type Admin = {
  id: string
  email: string
  full_name: string
  phone: string | null
  created_at: string
}

export default function AdminSettingsPage() {
  // ── Administradores ────────────────────────────────────────────────────────
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(true)
  const [newAdminOpen, setNewAdminOpen] = useState(false)
  const [newAdmin, setNewAdmin] = useState({ email: '', full_name: '', phone: '', password: '' })
  const [savingAdmin, setSavingAdmin] = useState(false)
  const [adminMsg, setAdminMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // ── BCV ─────────────────────────────────────────────────────────────────────
  const [bcvRate, setBcvRate] = useState<number | null>(null)
  const [bcvUpdated, setBcvUpdated] = useState<string | null>(null)
  const [bcvLoading, setBcvLoading] = useState(false)
  const [bcvMsg, setBcvMsg] = useState<string | null>(null)

  async function loadAdmins() {
    setLoadingAdmins(true)
    try {
      const r = await fetch('/api/admin/admins')
      const j = await r.json()
      if (r.ok) setAdmins(j.data || [])
    } finally {
      setLoadingAdmins(false)
    }
  }

  async function loadBCV() {
    setBcvLoading(true)
    setBcvMsg(null)
    try {
      const r = await fetch('/api/admin/bcv-rate', { cache: 'no-store' })
      const j = await r.json()
      if (j.rate) {
        setBcvRate(j.rate)
        setBcvUpdated(j.updated || j.date || null)
      } else {
        setBcvMsg('No se pudo obtener la tasa BCV')
      }
    } catch {
      setBcvMsg('Error al consultar BCV')
    } finally {
      setBcvLoading(false)
    }
  }

  useEffect(() => {
    loadAdmins()
    loadBCV()
  }, [])

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault()
    setSavingAdmin(true)
    setAdminMsg(null)
    try {
      const r = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin),
      })
      const j = await r.json()
      if (!r.ok) {
        setAdminMsg({ kind: 'err', text: j.error || 'Error al crear admin' })
      } else {
        setAdminMsg({ kind: 'ok', text: `Admin ${newAdmin.email} creado` })
        setNewAdmin({ email: '', full_name: '', phone: '', password: '' })
        setNewAdminOpen(false)
        loadAdmins()
      }
    } catch (err: any) {
      setAdminMsg({ kind: 'err', text: err?.message || 'Error' })
    } finally {
      setSavingAdmin(false)
    }
  }

  async function revokeAdmin(id: string, email: string) {
    if (!confirm(`¿Revocar acceso de super_admin a ${email}? Será degradado a doctor.`)) return
    const r = await fetch(`/api/admin/admins?id=${id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!r.ok) {
      setAdminMsg({ kind: 'err', text: j.error || 'Error al revocar' })
    } else {
      setAdminMsg({ kind: 'ok', text: `Acceso revocado para ${email}` })
      loadAdmins()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">Administradores y tasa de cambio BCV</p>
      </div>

      {/* ── Administradores ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-slate-900">Super administradores</h2>
          </div>
          <button
            onClick={() => setNewAdminOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Agregar admin
          </button>
        </div>

        {adminMsg && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
            adminMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {adminMsg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {adminMsg.text}
          </div>
        )}

        {loadingAdmins ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No hay administradores</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {admins.map(a => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{a.full_name || '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{a.email}</p>
                  {a.phone && <p className="text-xs text-slate-400">{a.phone}</p>}
                </div>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-1 rounded-full bg-teal-50 text-teal-700">
                  Super admin
                </span>
                <button
                  onClick={() => revokeAdmin(a.id, a.email)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Revocar acceso"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Formulario nuevo admin */}
        {newAdminOpen && (
          <form onSubmit={createAdmin} className="mt-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                placeholder="Email"
                required
                value={newAdmin.email}
                onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Nombre completo"
                required
                value={newAdmin.full_name}
                onChange={e => setNewAdmin({ ...newAdmin, full_name: e.target.value })}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <input
                type="tel"
                placeholder="Teléfono (opcional)"
                value={newAdmin.phone}
                onChange={e => setNewAdmin({ ...newAdmin, phone: e.target.value })}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <input
                type="password"
                placeholder="Password (min 8 caracteres)"
                required
                minLength={8}
                value={newAdmin.password}
                onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setNewAdminOpen(false); setAdminMsg(null) }}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingAdmin}
                className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                {savingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear admin
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── Tasa BCV ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-slate-900">Tasa de cambio BCV</h2>
          </div>
          <button
            onClick={loadBCV}
            disabled={bcvLoading}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {bcvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>
        </div>

        <div className="bg-slate-50 rounded-lg p-6">
          {bcvRate !== null ? (
            <>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">USD → BsS</p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {bcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </p>
              {bcvUpdated && (
                <p className="text-xs text-slate-400 mt-2">
                  Actualizado: {new Date(bcvUpdated).toLocaleString('es-VE')}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-3">
                Fuente: Banco Central de Venezuela (bcv.org.ve). Se consulta automáticamente
                al cargar la página. Esta tasa se usa para convertir precios USD→BsS en
                citas, facturas y reportes.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              {bcvMsg || 'Cargando tasa…'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
