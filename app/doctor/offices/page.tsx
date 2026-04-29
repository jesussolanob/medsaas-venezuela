'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Building2, Plus, Pencil, Trash2, MapPin, Phone, Clock,
  Save, X, Loader2, CheckCircle, ToggleLeft, ToggleRight
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

type Office = {
  id: string
  name: string
  address: string
  city: string
  phone: string
  is_active: boolean
  schedule: DaySchedule[]
  slot_duration: number  // minutes per appointment
  buffer_minutes: number // minutes between appointments
}

type DaySchedule = {
  day: number // 0=Lun ... 6=Dom
  enabled: boolean
  start: string // HH:MM
  end: string   // HH:MM
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const DEFAULT_SCHEDULE: DaySchedule[] = DAYS.map((_, i) => ({
  day: i,
  enabled: i < 5, // Mon-Fri enabled by default
  start: '08:00',
  end: '17:00',
}))

const inp = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white'

export default function OfficesPage() {
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Office | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  // AUDIT FIX 2026-04-28 (C-10): branded ConfirmDialog en lugar de confirm() nativo.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE)
  const [slotDuration, setSlotDuration] = useState(30)
  const [bufferMinutes, setBufferMinutes] = useState(10)

  const fetchOffices = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('doctor_offices')
      .select('*')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: true })

    setOffices((data || []).map(o => ({
      ...o,
      schedule: o.schedule || DEFAULT_SCHEDULE,
      slot_duration: o.slot_duration || 30,
      buffer_minutes: o.buffer_minutes || 10,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchOffices() }, [fetchOffices])

  function openNew() {
    setEditing(null)
    setName('')
    setAddress('')
    setCity('')
    setPhone('')
    setSchedule(DEFAULT_SCHEDULE.map(d => ({ ...d })))
    setSlotDuration(30)
    setBufferMinutes(10)
    setShowForm(true)
  }

  function openEdit(office: Office) {
    setEditing(office)
    setName(office.name)
    setAddress(office.address)
    setCity(office.city)
    setPhone(office.phone)
    setSchedule(office.schedule.map(d => ({ ...d })))
    setSlotDuration(office.slot_duration)
    setBufferMinutes(office.buffer_minutes)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  function updateDay(dayIndex: number, field: keyof DaySchedule, value: any) {
    setSchedule(prev => prev.map((d, i) => i === dayIndex ? { ...d, [field]: value } : d))
  }

  async function handleSave() {
    if (!name.trim() || !address.trim() || !city.trim()) {
      alert('Nombre, dirección y ciudad son obligatorios')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      doctor_id: user.id,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim(),
      schedule,
      slot_duration: slotDuration,
      buffer_minutes: bufferMinutes,
      is_active: true,
    }

    if (editing) {
      await supabase.from('doctor_offices').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('doctor_offices').insert(payload)
    }

    setSaving(false)
    closeForm()
    fetchOffices()
  }

  function handleDelete(id: string) {
    setConfirmDelete(id)
  }

  async function performDelete(id: string) {
    setDeleting(id)
    const supabase = createClient()
    await supabase.from('doctor_offices').delete().eq('id', id)
    setDeleting(null)
    setConfirmDelete(null)
    fetchOffices()
  }

  async function toggleActive(office: Office) {
    const supabase = createClient()
    await supabase.from('doctor_offices').update({ is_active: !office.is_active }).eq('id', office.id)
    fetchOffices()
  }

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
        title="Eliminar consultorio"
        message="¿Estás seguro? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={!!deleting}
        onConfirm={() => confirmDelete && performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Consultorios</h2>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona tus sedes y horarios de atención</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo consultorio
        </button>
      </div>

      {/* Office list */}
      {offices.length === 0 && !showForm ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No tienes consultorios registrados</p>
          <p className="text-xs text-slate-400 mt-1">Agrega tu primer consultorio para vincular horarios</p>
          <button onClick={openNew}
            className="mt-4 text-sm font-semibold text-teal-600 hover:text-teal-700">
            + Agregar consultorio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {offices.map(office => (
            <div key={office.id} className={`bg-white border rounded-xl p-5 transition-all ${office.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{office.name}</h3>
                    {office.is_active ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">Activo</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-200">Inactivo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500">
                    <MapPin className="w-3 h-3" />
                    {office.address}, {office.city}
                  </div>
                  {office.phone && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                      <Phone className="w-3 h-3" />
                      {office.phone}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(office)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title={office.is_active ? 'Desactivar' : 'Activar'}>
                    {office.is_active ? <ToggleRight className="w-5 h-5 text-teal-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => openEdit(office)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(office.id)}
                    disabled={deleting === office.id}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                    {deleting === office.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Slot config summary */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 mb-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span><strong>{office.slot_duration} min</strong> por consulta</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span><strong>{office.buffer_minutes} min</strong> entre consultas</span>
                </div>
              </div>

              {/* Schedule summary */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500">Horarios</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {office.schedule.filter(d => d.enabled).map(d => (
                    <span key={d.day} className="text-[10px] font-medium bg-teal-50 text-teal-700 px-2 py-1 rounded-md border border-teal-100">
                      {DAYS_SHORT[d.day]} {d.start}–{d.end}
                    </span>
                  ))}
                  {office.schedule.filter(d => d.enabled).length === 0 && (
                    <span className="text-[10px] text-slate-400">Sin horarios configurados</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Editar consultorio' : 'Nuevo consultorio'}
              </h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre del consultorio <span className="text-red-400">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Consultorio Principal" className={inp} />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Dirección <span className="text-red-400">*</span></label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Av. Francisco de Miranda, Torre..." className={inp} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Ciudad <span className="text-red-400">*</span></label>
                  <input value={city} onChange={e => setCity(e.target.value)} placeholder="Caracas" className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+58 212 1234567" className={inp} />
                </div>
              </div>

              {/* Slot config */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Duración de consulta (min)</label>
                  <select value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))} className={inp}>
                    {[15, 20, 30, 40, 45, 60, 90].map(m => (
                      <option key={m} value={m}>{m} minutos</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Tiempo entre consultas (min)</label>
                  <select value={bufferMinutes} onChange={e => setBufferMinutes(Number(e.target.value))} className={inp}>
                    {[0, 5, 10, 15, 20, 30].map(m => (
                      <option key={m} value={m}>{m} minutos</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Schedule per day */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Horarios de atención
                </label>
                <div className="space-y-2">
                  {schedule.map((day, i) => (
                    <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${day.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                      <button
                        type="button"
                        onClick={() => updateDay(i, 'enabled', !day.enabled)}
                        className="shrink-0"
                      >
                        {day.enabled
                          ? <ToggleRight className="w-5 h-5 text-teal-500" />
                          : <ToggleLeft className="w-5 h-5 text-slate-300" />
                        }
                      </button>
                      <span className={`text-xs font-medium w-12 ${day.enabled ? 'text-slate-700' : 'text-slate-400'}`}>
                        {DAYS_SHORT[i]}
                      </span>
                      {day.enabled && (
                        <div className="flex items-center gap-1.5 flex-1">
                          {/* F4 (2026-04-29): text-base en mobile evita zoom-in en iOS Safari (input time necesita >=16px) */}
                          <input
                            type="time"
                            value={day.start}
                            onChange={e => updateDay(i, 'start', e.target.value)}
                            className="text-base sm:text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-24"
                          />
                          <span className="text-xs text-slate-400">a</span>
                          <input
                            type="time"
                            value={day.end}
                            onChange={e => updateDay(i, 'end', e.target.value)}
                            className="text-base sm:text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-24"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
                {editing ? 'Guardar cambios' : 'Crear consultorio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
