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
  Building2,
} from 'lucide-react'
import { createClinic, type CreateClinicInput } from './actions'

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
  'Centro de Salud',
  'Clínica General',
  'Otra',
]

type FormState = CreateClinicInput & { confirmPassword: string }

const defaultForm: FormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  address: '',
  city: '',
  state: '',
  phone: '',
  specialty: '',
  max_doctors: 10,
  admin_name: '',
}

type FormErrors = Partial<Record<keyof FormState, string>>

interface NewClinicModalProps {
  onSuccess?: () => void
}

export default function NewClinicModal({ onSuccess }: NewClinicModalProps) {
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
    if (success) {
      router.refresh()
      onSuccess?.()
    }
  }

  function handleChange(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const e: FormErrors = {}

    if (!form.name.trim()) e.name = 'El nombre de la clínica es obligatorio'

    if (!form.admin_name.trim()) e.admin_name = 'El nombre del administrador es obligatorio'

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

    if (!form.city.trim()) e.city = 'La ciudad es obligatoria'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setServerError(null)

    startTransition(async () => {
      const { confirmPassword, ...input } = form
      const result = await createClinic(input)
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
        Nueva clínica
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
                <h2 className="text-lg font-semibold text-slate-900">Nueva clínica</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Completa los datos para crear la clínica
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
                  clinicName={form.name}
                  adminName={form.admin_name}
                  email={form.email}
                  onClose={handleClose}
                />
              ) : (
                <form id="new-clinic-form" onSubmit={handleSubmit} className="space-y-4">
                  {serverError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                      {serverError}
                    </div>
                  )}

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Datos de la clínica
                    </legend>

                    <Field label="Nombre de la clínica" required error={errors.name}>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="Ej. Clínica San Carlos"
                        className={inputClass(!!errors.name)}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Ciudad" required error={errors.city}>
                        <input
                          type="text"
                          value={form.city}
                          onChange={(e) => handleChange('city', e.target.value)}
                          placeholder="Ej: Caracas"
                          className={inputClass(!!errors.city)}
                        />
                      </Field>

                      <Field label="Estado" error={errors.state}>
                        <input
                          type="text"
                          value={form.state}
                          onChange={(e) => handleChange('state', e.target.value)}
                          placeholder="Ej: Distrito Capital"
                          className={inputClass(false)}
                        />
                      </Field>
                    </div>

                    <Field label="Dirección" error={errors.address}>
                      <input
                        type="text"
                        value={form.address}
                        onChange={(e) => handleChange('address', e.target.value)}
                        placeholder="Av. Principal, Edificio X, Piso Y"
                        className={inputClass(false)}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Teléfono" error={errors.phone}>
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => handleChange('phone', e.target.value)}
                          placeholder="+58 212 000 0000"
                          className={inputClass(false)}
                        />
                      </Field>

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
                    </div>

                    <Field label="Máximo de médicos" error={errors.max_doctors}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={form.max_doctors}
                        onChange={(e) => handleChange('max_doctors', parseInt(e.target.value) || 10)}
                        className={inputClass(false)}
                      />
                    </Field>
                  </fieldset>

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Administrador de la clínica
                    </legend>

                    <Field label="Nombre del administrador" required error={errors.admin_name}>
                      <input
                        type="text"
                        value={form.admin_name}
                        onChange={(e) => handleChange('admin_name', e.target.value)}
                        placeholder="Ej. Dra. María González"
                        className={inputClass(!!errors.admin_name)}
                      />
                    </Field>

                    <Field label="Email" required error={errors.email}>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="admin@clinica.com"
                        className={inputClass(!!errors.email)}
                      />
                    </Field>
                  </fieldset>

                  <fieldset className="space-y-4">
                    <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-1">
                      Credenciales de acceso
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
                  form="new-clinic-form"
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 hover:bg-teal-600 rounded-lg transition-colors disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creando clínica...
                    </>
                  ) : (
                    'Crear clínica'
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
  label,
  required,
  error,
  children,
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
  clinicName,
  adminName,
  email,
  onClose,
}: {
  clinicName: string
  adminName: string
  email: string
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-2">
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900">¡Clínica creada exitosamente!</h3>
        <p className="text-sm text-slate-500">
          La clínica <span className="font-medium text-slate-700">{clinicName}</span> está lista para usar.
        </p>
      </div>
      <div className="w-full bg-slate-50 rounded-xl border border-slate-200 p-4 text-left space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resumen</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-slate-400">Clínica</span>
          <span className="font-medium text-slate-700 text-right truncate">{clinicName}</span>
          <span className="text-slate-400">Administrador</span>
          <span className="font-medium text-slate-700 text-right truncate">{adminName}</span>
          <span className="text-slate-400">Email</span>
          <span className="font-medium text-slate-700 text-right truncate">{email}</span>
        </div>
      </div>
      <p className="text-xs text-slate-400 px-2">
        El administrador puede iniciar sesión con el email y la contraseña definida.
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
