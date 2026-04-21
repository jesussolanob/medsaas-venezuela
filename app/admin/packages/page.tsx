'use client'

import { useEffect, useState } from 'react'
import { Package, Plus, Trash2, Edit2, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'

type Template = {
  id: string
  name: string
  description: string | null
  sessions_count: number
  price_usd: number
  specialty: string | null
  doctor_id: string | null
  is_active: boolean
  doctor?: { full_name: string; email: string; specialty: string | null } | null
}

const SPECIALTIES = [
  'Medicina General','Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología y Obstetricia','Medicina Interna','Nefrología','Neurología','Oftalmología',
  'Ortopedia y Traumatología','Otorrinolaringología','Pediatría','Psicología','Psiquiatría',
  'Reumatología','Fisioterapia','Urología','Nutrición',
]

export default function AdminPackagesPage() {
  const [list, setList] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', sessions_count: 4, price_usd: 80,
    specialty: '', doctor_id: '',
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/admin/packages', { cache: 'no-store' })
    const j = await r.json()
    if (r.ok) setList(j.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm({ name: '', description: '', sessions_count: 4, price_usd: 80, specialty: '', doctor_id: '' })
    setFormOpen(true)
  }
  function openEdit(t: Template) {
    setEditing(t)
    setForm({
      name: t.name,
      description: t.description || '',
      sessions_count: t.sessions_count,
      price_usd: t.price_usd,
      specialty: t.specialty || '',
      doctor_id: t.doctor_id || '',
    })
    setFormOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(null)
    try {
      const url = editing ? `/api/admin/packages?id=${editing.id}` : '/api/admin/packages'
      const method = editing ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          sessions_count: Number(form.sessions_count),
          price_usd: Number(form.price_usd),
          specialty: form.specialty || null,
          doctor_id: form.doctor_id || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error')
      setMsg({ kind: 'ok', text: editing ? 'Paquete actualizado' : 'Paquete creado' })
      setFormOpen(false)
      load()
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: Template) {
    if (!confirm(`¿Desactivar el paquete "${t.name}"? Los paquetes ya asignados a pacientes no se ven afectados.`)) return
    const r = await fetch(`/api/admin/packages?id=${t.id}`, { method: 'DELETE' })
    if (r.ok) { setMsg({ kind: 'ok', text: 'Paquete desactivado' }); load() }
    else { const j = await r.json(); setMsg({ kind: 'err', text: j.error }) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paquetes de Consultas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Plantillas de paquetes que los pacientes pueden adquirir
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg"
        >
          <Plus className="w-4 h-4" /> Nuevo paquete
        </button>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
          msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No hay paquetes creados</p>
            <button onClick={openNew} className="mt-3 text-sm font-semibold text-teal-600 hover:text-teal-700">
              Crear el primero →
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="text-left px-5 py-3">Nombre</th>
                <th className="text-right px-5 py-3">Sesiones</th>
                <th className="text-right px-5 py-3">Precio</th>
                <th className="text-left px-5 py-3">Especialidad</th>
                <th className="text-left px-5 py-3">Doctor</th>
                <th className="text-center px-5 py-3">Estado</th>
                <th className="text-right px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(t => (
                <tr key={t.id} className={!t.is_active ? 'opacity-50' : 'hover:bg-slate-50'}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{t.sessions_count}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">${Number(t.price_usd).toFixed(2)}</td>
                  <td className="px-5 py-3 text-slate-600">{t.specialty || '—'}</td>
                  <td className="px-5 py-3 text-slate-600 text-xs">{t.doctor?.full_name || (t.doctor_id ? '—' : 'Cualquiera')}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {t.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(t)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500" title="Desactivar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal formulario */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <form onSubmit={save}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Editar paquete' : 'Nuevo paquete'}</h2>
                <button type="button" onClick={() => setFormOpen(false)} className="p-1 hover:bg-slate-100 rounded">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nombre *</label>
                  <input
                    type="text" required value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej. Paquete 4 sesiones terapia"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    placeholder="Opcional"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Sesiones *</label>
                    <input
                      type="number" required min={1} value={form.sessions_count}
                      onChange={e => setForm({ ...form, sessions_count: Number(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Precio USD *</label>
                    <input
                      type="number" required min={0} step="0.01" value={form.price_usd}
                      onChange={e => setForm({ ...form, price_usd: Number(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Especialidad</label>
                  <select
                    value={form.specialty}
                    onChange={e => setForm({ ...form, specialty: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">— Cualquiera —</option>
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Paquete genérico por especialidad. Déjalo vacío si aplica a todas.
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                  <strong>Política:</strong> Los paquetes <span className="font-semibold text-teal-700">no vencen</span>.
                  El saldo se consume al agendar citas. Si el paciente cancela una cita,
                  la sesión se restituye automáticamente.
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {editing ? 'Guardar cambios' : 'Crear paquete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
