'use client'

/**
 * PatientForm — formulario UNICO para crear y editar pacientes (RONDA 19b).
 *
 * Comportamiento:
 *   - Si recibe `initialData` con id → modo EDICION (UPDATE en BD)
 *   - Si NO recibe initialData → modo CREACION (INSERT en BD)
 *
 * Cubre TODOS los campos clinicos basicos de la tabla `patients`:
 *   identidad: full_name, cedula, email, phone
 *   demograficos: birth_date, age, sex, blood_type
 *   ubicacion: address, city
 *   clinicos: allergies, chronic_conditions
 *   contacto emergencia: emergency_contact_name, emergency_contact_phone
 */

import { useState, useEffect } from 'react'
import {
  X, User, Mail, Phone, Hash, Calendar, MapPin, Heart, AlertTriangle,
  Droplet, UserCheck, Save, Loader2,
} from 'lucide-react'
// L6 (2026-04-29): inputs reutilizables con prefijo dropdown / +58 fijo
import CedulaInput from '@/components/shared/CedulaInput'
import PhoneInput from '@/components/shared/PhoneInput'

export type PatientFormData = {
  id?: string
  full_name: string
  cedula?: string | null
  email?: string | null
  phone?: string | null
  birth_date?: string | null
  age?: number | null
  sex?: 'male' | 'female' | 'other' | '' | null
  blood_type?: string | null
  address?: string | null
  city?: string | null
  allergies?: string | null
  chronic_conditions?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  source?: string | null
  notes?: string | null
}

type Props = {
  /** Si se pasa, formulario entra en modo EDICION */
  initialData?: PatientFormData | null
  /** Llamado cuando el form se envia. Recibe el payload listo para Supabase */
  onSubmit: (data: PatientFormData) => Promise<void> | void
  onCancel?: () => void
  submitting?: boolean
  /** Texto custom para el boton de submit. Default cambia segun modo */
  submitLabel?: string
}

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
const SEX_OPTIONS = [
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Otro' },
]

const fi = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
const lbl = 'flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5'

export default function PatientForm({ initialData, onSubmit, onCancel, submitting, submitLabel }: Props) {
  const isEditMode = !!initialData?.id
  const [data, setData] = useState<PatientFormData>(() => ({
    full_name: '',
    cedula: '',
    email: '',
    phone: '',
    birth_date: '',
    age: null,
    sex: '',
    blood_type: '',
    address: '',
    city: '',
    allergies: '',
    chronic_conditions: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    source: 'manual',
    notes: '',
    ...(initialData ?? {}),
  }))
  const [error, setError] = useState('')

  // Auto-calcular edad cuando cambia birth_date
  useEffect(() => {
    if (!data.birth_date) return
    const birth = new Date(data.birth_date)
    if (isNaN(birth.getTime())) return
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    if (age >= 0 && age <= 130 && age !== data.age) {
      setData(d => ({ ...d, age }))
    }
  }, [data.birth_date])

  function set<K extends keyof PatientFormData>(key: K, value: PatientFormData[K]) {
    setData(d => ({ ...d, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!data.full_name?.trim()) {
      setError('El nombre completo es obligatorio')
      return
    }
    try {
      // Limpiar strings vacios a null para no ensuciar BD
      const cleaned: PatientFormData = { ...data }
      ;(['cedula', 'email', 'phone', 'birth_date', 'sex', 'blood_type', 'address', 'city', 'allergies', 'chronic_conditions', 'emergency_contact_name', 'emergency_contact_phone'] as const).forEach(k => {
        if (cleaned[k] === '') (cleaned as any)[k] = null
      })
      await onSubmit(cleaned)
    } catch (err: any) {
      setError(err?.message || 'Error al guardar')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* === IDENTIDAD === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <User className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Identidad</h3>
        </div>

        <div>
          <label className={lbl}><User className="w-3 h-3" /> Nombre completo <span className="text-red-500">*</span></label>
          <input value={data.full_name} onChange={e => set('full_name', e.target.value)} required className={fi} placeholder="Juan Pérez González" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}><Hash className="w-3 h-3" /> Cédula</label>
            {/* L6 (2026-04-29): dropdown V/E/J/G + numero canonico */}
            <CedulaInput value={data.cedula ?? ''} onChange={v => set('cedula', v)} placeholder="12345678" />
          </div>
          <div>
            <label className={lbl}><Mail className="w-3 h-3" /> Email</label>
            <input type="email" value={data.email ?? ''} onChange={e => set('email', e.target.value)} className={fi} placeholder="paciente@correo.com" />
          </div>
        </div>

        <div>
          <label className={lbl}><Phone className="w-3 h-3" /> Teléfono</label>
          {/* L6 (2026-04-29): prefijo +58 fijo + 10 digitos. Devuelve canonico 584XXXXXXXXX */}
          <PhoneInput value={data.phone ?? ''} onChange={v => set('phone', v)} />
        </div>
      </section>

      {/* === DEMOGRAFICOS — fix layout: 3 columnas iguales === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Calendar className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Datos demográficos</h3>
        </div>

        {/* RONDA 19b: layout horizontal forzado con grid de 3 columnas iguales para
            que "Fecha de nacimiento" no salte de linea con Edad/Sexo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className={lbl}><Calendar className="w-3 h-3" /> Fecha de nacimiento</label>
            <input type="date" value={data.birth_date ?? ''} onChange={e => set('birth_date', e.target.value)} className={fi} />
          </div>
          <div className="flex flex-col">
            <label className={lbl}>Edad</label>
            <input
              type="number" min="0" max="130"
              value={data.age ?? ''}
              onChange={e => set('age', e.target.value === '' ? null : parseInt(e.target.value))}
              className={fi}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col">
            <label className={lbl}>Sexo</label>
            <select value={data.sex ?? ''} onChange={e => set('sex', e.target.value as any)} className={fi}>
              <option value="">Seleccionar…</option>
              {SEX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={lbl}><Droplet className="w-3 h-3 text-red-500" /> Tipo de sangre</label>
          <select value={data.blood_type ?? ''} onChange={e => set('blood_type', e.target.value)} className={fi}>
            <option value="">No registrado</option>
            {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </section>

      {/* === UBICACION === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <MapPin className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Ubicación</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={lbl}>Dirección</label>
            <input value={data.address ?? ''} onChange={e => set('address', e.target.value)} className={fi} placeholder="Av. principal, edif..." />
          </div>
          <div>
            <label className={lbl}>Ciudad</label>
            <input value={data.city ?? ''} onChange={e => set('city', e.target.value)} className={fi} placeholder="Caracas" />
          </div>
        </div>
      </section>

      {/* === DATOS CLINICOS === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Heart className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Datos clínicos</h3>
        </div>
        <div>
          <label className={lbl}><AlertTriangle className="w-3 h-3 text-amber-500" /> Alergias</label>
          <textarea
            value={data.allergies ?? ''}
            onChange={e => set('allergies', e.target.value)}
            rows={2}
            className={fi + ' resize-none'}
            placeholder="Penicilina, mariscos..."
          />
        </div>
        <div>
          <label className={lbl}><Heart className="w-3 h-3 text-red-500" /> Antecedentes / Enfermedades crónicas</label>
          <textarea
            value={data.chronic_conditions ?? ''}
            onChange={e => set('chronic_conditions', e.target.value)}
            rows={2}
            className={fi + ' resize-none'}
            placeholder="Diabetes tipo 2, hipertensión..."
          />
        </div>
      </section>

      {/* === CONTACTO DE EMERGENCIA === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <UserCheck className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Contacto de emergencia</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Nombre</label>
            <input value={data.emergency_contact_name ?? ''} onChange={e => set('emergency_contact_name', e.target.value)} className={fi} placeholder="Maria Pérez (madre)" />
          </div>
          <div>
            <label className={lbl}><Phone className="w-3 h-3" /> Teléfono</label>
            {/* L6 (2026-04-29): canonico para contacto de emergencia tambien */}
            <PhoneInput value={data.emergency_contact_phone ?? ''} onChange={v => set('emergency_contact_phone', v)} />
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-slate-100">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <X className="w-3.5 h-3.5 inline mr-1" />
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
          ) : (
            <><Save className="w-4 h-4" /> {submitLabel || (isEditMode ? 'Guardar cambios' : 'Crear paciente')}</>
          )}
        </button>
      </div>
    </form>
  )
}
