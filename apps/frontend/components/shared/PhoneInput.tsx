'use client'

// L6 (2026-04-29): componente reutilizable de telefono venezolano.
//
// Almacena el valor en formato canonico '584XXXXXXXXX' (12 digitos).
// El parent recibe el canonico via onChange, listo para wa.me/api.whatsapp.com.
//
// Display: prefijo +58 fijo a la izquierda + input para los 10 digitos restantes.
// Si el value externo viene en otro formato (ej '0414-1234567'), se parsea.

import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { normalizePhoneVE } from '@/lib/phone-utils'

type Props = {
  /** Valor canonico '584141234567' (12 digitos). Tambien acepta legacy. */
  value: string | null | undefined
  /** Callback con el canonico de 12 digitos. Si esta incompleto, devuelve '' */
  onChange: (canonical: string) => void
  /** Mensaje de error externo (validacion del padre) */
  error?: string
  /** Marca el input como required (HTML) */
  required?: boolean
  /** Placeholder del input local */
  placeholder?: string
  /** Clase del wrapper */
  className?: string
  /** Deshabilita el input */
  disabled?: boolean
  /** AutoFocus */
  autoFocus?: boolean
  /** Nombre del input */
  name?: string
}

/** Extrae los 10 digitos locales (sin '58') a partir de cualquier formato. */
function parseLocal(raw: string | null | undefined): string {
  const canonical = normalizePhoneVE(raw)
  if (canonical) return canonical.slice(2) // quita '58'
  // Si no se pudo normalizar, intenta extraer hasta 10 digitos crudos
  const digits = (raw ?? '').toString().replace(/\D/g, '')
  // Si arranca con 58 incompleto, lo quitamos para que el usuario edite el local
  if (digits.startsWith('58')) return digits.slice(2, 12)
  if (digits.startsWith('0')) return digits.slice(1, 11)
  return digits.slice(0, 10)
}

export default function PhoneInput({
  value,
  onChange,
  error,
  required,
  placeholder = '4141234567',
  className = '',
  disabled,
  autoFocus,
  name,
}: Props) {
  const [local, setLocal] = useState<string>(() => parseLocal(value))

  // Sync con value externo
  useEffect(() => {
    setLocal(parseLocal(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Validacion: 10 digitos, arrancando con 4 (operadores VE: 412, 414, 416, 424, 426)
  const localOk = local.length === 0 || (local.length === 10 && local.startsWith('4'))
  const showError =
    error ||
    (local.length > 0 && local.length < 10 ? 'Teléfono debe tener 10 dígitos' : '') ||
    (local.length === 10 && !local.startsWith('4') ? 'Teléfono móvil debe iniciar con 4' : '')

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    setLocal(digits)
    // Solo emite canonico cuando el numero esta completo y bien formado
    if (digits.length === 10 && digits.startsWith('4')) {
      onChange('58' + digits)
    } else {
      // Numero incompleto: parent recibe '' (asi sabe que no esta listo)
      onChange('')
    }
  }

  return (
    <div className={className}>
      <div className={`flex items-stretch border rounded-lg bg-white transition-colors overflow-hidden ${
        showError ? 'border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/10'
                  : 'border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/10'
      } ${disabled ? 'bg-slate-50 opacity-60' : ''}`}>
        <div className="flex items-center gap-1 px-2.5 bg-slate-50 border-r border-slate-200 text-sm font-semibold text-slate-700">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span>+58</span>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          name={name}
          value={local}
          onChange={e => handleChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="flex-1 px-2 py-2 text-sm bg-transparent outline-none disabled:cursor-not-allowed"
        />
      </div>
      {showError && <p className="text-[11px] text-red-600 mt-1">{showError}</p>}
    </div>
  )
}
