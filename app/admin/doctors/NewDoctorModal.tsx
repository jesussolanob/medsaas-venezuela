'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  Stethoscope,
  Zap,
} from 'lucide-react'
import { createDoctor, type CreateDoctorInput } from './actions'

const ESPECIALIDADES = [
  'Cardiología',
  'Dermatología',
  'Endocrinología',
  'Gastroenterología',
  'Ginecología y Obstetricia',
  'Medicina General',
  'Medicina Interna',
  'Nefrología',
  'Neurología',
  'Oftalmología',
  'Ortopedia y Traumatología',
  'Otorrinolaringología',
  'Pediatría',
  'Psicología',
  'Psiquiatría',
  'Reumatología',
  'Urología',
  'Otra',
]

const PLANES: {
  value: 'basic' | 'professional'
  label: string
  badge: string
  description: string
  price: string
  icon: React.ReactNode
  color: string
  selected: string
}[] = [
  {
    value: 'basic',
    label: 'Basic',
    badge: 'Trial',
    description: '30 días gratis para explorar la plataforma',
    price: '$0 / mes',
    icon: <Stethoscope className="w-4 h-4" />,
    color: 'text-slate-500',
    selected: 'border-slate-400 bg-slate-50 ring-1 ring-slate-300',
  },
  {
    value: 'professional',
    label: 'Professional',
    badge: 'Recomendado',
    description: 'CRM completo, agenda, finanzas e IA',
    price: '$30 USD / mes',
    icon: <Zap className="w-4 h-4" />,
    color: 'text-teal-600',
    selected: 'border-teal-500 bg-teal-50 ring-1 ring-teal-400/40',
  },
]

type FormState = CreateDoctorInput & { confirmPassword: string; cedula: string }

const defaultForm: FormState = {
  full_name: '',
  cedula: '',
  email: '',
  password: '',
  confirmPassword: '',
  specialty: '',
  phone: '',
  plan: 'basic',
}

type FormErrors = Partial<Record<keyof FormState, string>>

export default function NewDoctorModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState>(defaultForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  function handleOpen() {
    setOpen(true)
    setForm(defaultForm)
    setErrors({})
    setServerError(null)
    setSuccess(false)
    setShowPassword(false)
    setShowConfirm(false)
  }

  function handleClose() {
    if (isPending) return
    setOpen(false)
    if (success) router.refresh()
  }

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const e: FormErrors = {}

    if (!form.full_name.trim()) e.full_name = 'El nombre es obligatorio'

    if (!form.cedula.trim()) {
      e.cedula = 'La cédula es obligatoria'
    } else if (!/^[VEve]-?\d{6,8}$/.test(form.cedula.trim())) {
      e.cedula = 'Formato inválido. Ej: V-12345678'
    }

    if (!form.email.trim()) {
      e.email = 'El email es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Email inválido'
    }

    if (!form.password) {
      e.password = 'La contraseña es obligatoria'
    } else if (form.password.length < 8) {
      e.password = 'Mínimo 8 caracteres'
    }

    if (!form.confirmPassword) {
      e.confirmPassword = 'Confirma la contraseña'
    } else if (form.password !== form.confirmPassword) {
      e.confirmPassword = 'Las contraseñas no coinciden'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setServerError(null)

    startTransition(async () => {
      const { confirmPassword, ...input } = form
      const result = await createDoctor(input)
      if (result.success) {
        setSuccess(true)
      } else {
        setServerError(result.error)
      }
    })
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nuevo médico
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nuevo médico</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Completa los datos para crear la cuenta
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={isPending}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto">
              {success ? (
                <SuccessView
                  doctorName={form.full_name}
                  email={form.email}
                  plan={form.plan}
                  onClose={handleClose}
                />
              ) : (
                <form id="new-doctor-form" onSubmit={handleSubmit} className="space-y-4">
                  {serverError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                      {serverError}
                    </div>
                  )}

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Datos personales
                    </legend>

                    <Field label="Nombre completo" required error={errors.full_name}>
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={(e) => handleChange('full_name', e.target.value)}
                        placeholder="Ej. Dr. Carlos Ramírez"
                        className={inputClass(!!errors.full_name)}
                      />
                    </Field>

                    <Field label="Cédula de Identidad" required error={errors.cedula}>
                      <input
                        type="text"
                        value={form.cedula}
                        onChange={(e) => handleChange('cedula', e.target.value)}
                        placeholder="Ej: V-12345678"
                        className={inputClass(!!errors.cedula)}
                      />
                    </Field>

                    <Field label="Email" required error={errors.email}>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="doctor@ejemplo.com"
                        className={inputClass(!!errors.email)}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Especialidad" error={errors.specialty}>
                        <select
                          value={form.specialty}
                          onChange={(e) => handleChange('specialty', e.target.value)}
                          className={selectClass(false)}
                        >
                          <option value="">Seleccionar...</option>
                          {ESPECIALIDADES.map((esp) => (
                            <option key={esp} value={esp}>
                              {esp}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Teléfono" error={errors.phone}>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => handleChange('phone', e.target.value)}
                          placeholder="+58 412 000 0000"
                          className={inputClass(false)}
                        />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Contraseña de acceso
                    </legend>

                    <Field label="Contraseña" required error={errors.password}>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => handleChange('password', e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          className={inputClass(!!errors.password) + ' pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>

                    <Field label="Confirmar contraseña" required error={errors.confirmPassword}>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={form.confirmPassword}
                          onChange={(e) => handleChange('confirmPassword', e.target.value)}
                          placeholder="Repite la contraseña"
                          className={inputClass(!!errors.confirmPassword) + ' pr-10'}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">
                      Plan de suscripción
                    </legend>
                    <div className="grid grid-cols-2 gap-3">
                      {PLANES.map((plan) => {
                        const isSelected = form.plan === plan.value
                        return (
                          <button
                            key={plan.value}
                            type="button"
                            onClick={() => handleChange('plan', plan.value)}
                            className={`relative flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition-all
                              ${isSelected ? plan.selected : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'}`}
                          >
                            <span className={`absolute top-2.5 right-2.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                              ${plan.value === 'professional' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                              {plan.badge}
                            </span>
                            <span className={`flex items-center gap-1.5 font-semibold text-sm ${isSelected ? plan.color : 'text-slate-700'}`}>
                              <span className={isSelected ? plan.color : 'text-slate-400'}>
                                {plan.icon}
                              </span>
                              {plan.label}
                            </span>
                            <span className={`text-base font-bold ${isSelected ? plan.color : 'text-slate-600'}`}>
                              {plan.price}
                            </span>
                            <span className="text-xs text-slate-400 leading-snug pr-8">
                              {plan.description}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                </form>
              )}
            </div>

            {!success && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 shrink-0 bg-white">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="new-doctor-form"
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creando cuenta...
                    </>
                  ) : (
                    'Crear médico'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label, required, error, children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 text-sm rounded-lg border transition-colors outline-none
    focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500
    ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`
}

function selectClass(hasError: boolean) {
  return `w-full px-3 py-2 text-sm rounded-lg border transition-colors outline-none
    focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-700
    ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`
}

function SuccessView({
  doctorName, email, plan, onClose,
}: {
  doctorName: string
  email: string
  plan: 'basic' | 'professional'
  onClose: () => void
}) {
  const planLabel = plan === 'professional' ? 'Professional · $30 USD/mes' : 'Basic · 30 días trial'
  const planColor = plan === 'professional' ? 'text-teal-600 bg-teal-50' : 'text-slate-600 bg-slate-100'

  return (
    <div className="flex flex-col items-center text-center gap-5 py-2">
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900">¡Médico creado exitosamente!</h3>
        <p className="text-sm text-slate-500">
          La cuenta de <span className="font-medium text-slate-700">{doctorName}</span> está lista para usar.
        </p>
      </div>
      <div className="w-full bg-slate-50 rounded-xl border border-slate-200 p-4 text-left space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resumen</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-slate-400">Nombre</span>
          <span className="font-medium text-slate-700 text-right truncate">{doctorName}</span>
          <span className="text-slate-400">Email</span>
          <span className="font-medium text-slate-700 text-right truncate">{email}</span>
          <span className="text-slate-400">Plan</span>
          <span className="text-right">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planColor}`}>
              {planLabel}
            </span>
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-400 px-2">
        Ya puede iniciar sesión con el email y la contraseña que definiste.
      </p>
      <button
        onClick={onClose}
        className="w-full px-4 py-2.5 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors"
      >
        Listo
      </button>
    </div>
  )
}