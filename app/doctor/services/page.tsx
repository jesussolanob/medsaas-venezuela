'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBcvRate } from '@/lib/useBcvRate'
import {
  Package, Plus, Pencil, Trash2, DollarSign, Clock,
  Save, X, Loader2, ToggleLeft, ToggleRight, Eye, EyeOff, Tag,
  FileText
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

type ServiceItem = {
  id: string
  name: string
  price_usd: number
  duration_minutes: number
  sessions_count: number
  is_active: boolean
  show_in_booking: boolean
  description: string
  type: 'plan' | 'service'
}


const inp = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white'

export default function ServicesPage() {
  const { rate: bcvRate, toBs } = useBcvRate()
  const [items, setItems] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'plan' | 'service'>('all')
  // AUDIT FIX 2026-04-28 (C-10): branded ConfirmDialog en lugar de confirm() nativo.
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; kind: 'service' } | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [priceUsd, setPriceUsd] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [sessionsCount, setSessionsCount] = useState('1')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'plan' | 'service'>('plan')
  const [showInBooking, setShowInBooking] = useState(true)

  // Quick items (Prescripciones = exams, Recetas = medications)
  // RONDA 31: states de quick items (prescripciones / recetas) removidos.
  // La logica se reestructurara en otra ronda.

  const fetchServices = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: true })

    setItems((data || []).map(d => ({
      ...d,
      show_in_booking: d.show_in_booking ?? true,
      description: d.description || '',
      type: d.type || 'plan',
    })))

    // RONDA 31: fetch de doctor_quick_items removido. Se reestructurara la logica
    // de prescripciones/recetas en una ronda futura.

    setLoading(false)
  }, [])

  useEffect(() => { fetchServices() }, [fetchServices])

  // RONDA 31: addQuickItem/deleteQuickItem removidos en main; el catálogo
  // doctor_quick_items se reestructurará. ConfirmDialog conserva el kind
  // 'quick' por si se reactiva más adelante.

  function openNew(itemType: 'plan' | 'service' = 'plan') {
    setEditing(null)
    setName('')
    setPriceUsd('')
    setDurationMinutes('30')
    setSessionsCount('1')
    setDescription('')
    setType(itemType)
    setShowInBooking(true)
    setShowForm(true)
  }

  function openEdit(item: ServiceItem) {
    setEditing(item)
    setName(item.name)
    setPriceUsd(item.price_usd.toString())
    setDurationMinutes(item.duration_minutes.toString())
    setSessionsCount(item.sessions_count.toString())
    setDescription(item.description)
    setType(item.type)
    setShowInBooking(item.show_in_booking)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  async function handleSave() {
    if (!name.trim() || !priceUsd) {
      alert('Nombre y precio son obligatorios')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      doctor_id: user.id,
      name: name.trim(),
      price_usd: parseFloat(priceUsd) || 0,
      duration_minutes: parseInt(durationMinutes) || 30,
      sessions_count: parseInt(sessionsCount) || 1,
      description: description.trim(),
      type,
      show_in_booking: showInBooking,
      is_active: true,
    }

    if (editing) {
      await supabase.from('pricing_plans').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('pricing_plans').insert(payload)
    }

    setSaving(false)
    closeForm()
    fetchServices()
  }

  function handleDelete(id: string) {
    setConfirmDelete({ id, kind: 'service' })
  }
  async function performDeleteService(id: string) {
    const supabase = createClient()
    await supabase.from('pricing_plans').delete().eq('id', id)
    setConfirmDelete(null)
    fetchServices()
  }

  async function toggleBooking(item: ServiceItem) {
    const supabase = createClient()
    await supabase.from('pricing_plans').update({ show_in_booking: !item.show_in_booking }).eq('id', item.id)
    fetchServices()
  }

  async function toggleActive(item: ServiceItem) {
    const supabase = createClient()
    await supabase.from('pricing_plans').update({ is_active: !item.is_active }).eq('id', item.id)
    fetchServices()
  }

  const filtered = items.filter(i => filter === 'all' || i.type === filter)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar servicio"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => {
          if (!confirmDelete) return
          performDeleteService(confirmDelete.id)
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Servicios y Planes</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configura lo que ofreces en tu consulta y link de booking</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openNew('plan')}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> Plan de consulta
          </button>
          <button onClick={() => openNew('service')}
            className="flex items-center gap-2 border border-teal-200 text-teal-600 hover:bg-teal-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> Servicio extra
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5 w-fit">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'plan', label: 'Planes' },
          { key: 'service', label: 'Servicios' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No tienes servicios configurados</p>
          <p className="text-xs text-slate-400 mt-1">Agrega planes de consulta o servicios extras</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <div key={item.id} className={`bg-white border rounded-xl p-5 transition-all ${item.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      item.type === 'plan'
                        ? 'bg-teal-50 text-teal-600 border border-teal-200'
                        : 'bg-purple-50 text-purple-600 border border-purple-200'
                    }`}>
                      {item.type === 'plan' ? 'Plan' : 'Servicio'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-2">{item.name}</h3>
                  {item.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
              </div>

              {/* L4 (2026-04-29): cuando es paquete (sessions_count > 1) mostramos
                  desglose precio unitario × sesiones = total para que quede claro
                  que el paciente paga el total, no solo el precio unitario. */}
              <div className="mb-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-teal-600">${item.price_usd.toFixed(2)}</span>
                  <span className="text-xs text-slate-400">USD</span>
                  {item.sessions_count > 1 && (
                    <span className="text-xs text-slate-500 ml-1">
                      × {item.sessions_count} = <span className="font-semibold text-slate-700">${(item.price_usd * item.sessions_count).toFixed(2)}</span>
                    </span>
                  )}
                </div>
                {bcvRate && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.sessions_count > 1
                      ? `Total: ${toBs(item.price_usd * item.sessions_count)}`
                      : toBs(item.price_usd)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.duration_minutes} min
                </div>
                {item.sessions_count > 1 && (
                  <div className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {item.sessions_count} sesiones — ${(item.price_usd * item.sessions_count).toFixed(2)} total
                  </div>
                )}
              </div>

              {/* Booking toggle */}
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  {item.show_in_booking ? <Eye className="w-3.5 h-3.5 text-teal-500" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="text-xs font-medium text-slate-600">Visible en booking</span>
                </div>
                <button onClick={() => toggleBooking(item)}>
                  {item.show_in_booking
                    ? <ToggleRight className="w-5 h-5 text-teal-500" />
                    : <ToggleLeft className="w-5 h-5 text-slate-300" />
                  }
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => toggleActive(item)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    item.is_active
                      ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                      : 'text-slate-400 bg-slate-50 hover:bg-slate-100'
                  }`}>
                  {item.is_active ? 'Activo' : 'Inactivo'}
                </button>
                <div className="flex-1" />
                <button onClick={() => openEdit(item)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RONDA 31: secciones de Prescripciones (examenes frecuentes) y Recetas (medicamentos
          frecuentes) removidas. Esa logica se va a reestructurar. La data en BD
          (tabla doctor_quick_items) se mantiene intacta por si se reactiva en el futuro. */}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Editar' : 'Nuevo'} {type === 'plan' ? 'plan de consulta' : 'servicio'}
              </h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'plan', label: 'Plan de consulta', desc: 'Consulta médica' },
                    { value: 'service', label: 'Servicio extra', desc: 'Limpieza, examen, etc.' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value as any)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        type === opt.value
                          ? 'border-teal-400 bg-teal-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className={`text-xs font-bold ${type === opt.value ? 'text-teal-700' : 'text-slate-700'}`}>{opt.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre <span className="text-red-400">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder={type === 'plan' ? 'Consulta general' : 'Limpieza dental'}
                  className={inp} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Precio USD <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="number" step="0.01" value={priceUsd} onChange={e => setPriceUsd(e.target.value)}
                      placeholder="30.00" className={inp + ' pl-9'} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Duración (min)</label>
                  <select value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} className={inp}>
                    {[15, 20, 30, 45, 60, 90, 120].map(d => (
                      <option key={d} value={d}>{d} minutos</option>
                    ))}
                  </select>
                </div>
              </div>

              {type === 'plan' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Sesiones incluidas</label>
                  <input type="number" min="1" value={sessionsCount} onChange={e => setSessionsCount(e.target.value)}
                    placeholder="1" className={inp} />
                  <p className="text-[10px] text-slate-400 mt-1">Si es un paquete, pon el número de sesiones que incluye</p>
                  {/* L4 (2026-04-29): preview del total del paquete en tiempo real
                      cuando hay >1 sesion. Asi el doctor ve cuanto cobrara en total. */}
                  {(() => {
                    const p = parseFloat(priceUsd) || 0
                    const s = parseInt(sessionsCount) || 1
                    if (s > 1 && p > 0) {
                      const total = p * s
                      return (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-100">
                          <p className="text-xs font-semibold text-teal-700">
                            Total del paquete: ${total.toFixed(2)}{' '}
                            <span className="font-normal text-teal-600">(= ${p.toFixed(2)} USD × {s} sesiones)</span>
                          </p>
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Descripción</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Describe brevemente el servicio..."
                  rows={2}
                  className={inp + ' resize-none'} />
              </div>

              {/* Booking visibility */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Mostrar en link de booking</p>
                  <p className="text-[10px] text-slate-400">Los pacientes podrán seleccionarlo al agendar</p>
                </div>
                <button type="button" onClick={() => setShowInBooking(!showInBooking)}>
                  {showInBooking
                    ? <ToggleRight className="w-6 h-6 text-teal-500" />
                    : <ToggleLeft className="w-6 h-6 text-slate-300" />
                  }
                </button>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 rounded-b-2xl">
              <button onClick={closeForm}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Guardar cambios' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
