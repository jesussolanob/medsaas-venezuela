'use client'

// L6 (2026-04-29): componente reutilizable de cedula con prefijo dropdown.
//
// Almacena el valor en formato canonico 'V-12345678' (prefijo + guion + numero).
// El parent recibe siempre ese formato via onChange.
//
// Acepta como input inicial (parsea):
//   'V-12345678' → V + 12345678
//   'V12345678'  → V + 12345678
//   '12345678'   → V + 12345678 (default V)
//   ''           → V + ''

import { useEffect, useState } from 'react'
import { Hash } from 'lucide-react'

type Prefix = 'V' | 'E' | 'J' | 'G'
const PREFIXES: Prefix[] = ['V', 'E', 'J', 'G']

type Props = {
  /** Valor canonico, ej 'V-12345678' */
  value: string | null | undefined
  /** Callback con el canonico ya formado (ej 'V-12345678'). Si numero vacio, devuelve '' */
  onChange: (canonical: string) => void
  /** Mensaje de error opcional (ej validacion del padre) */
  error?: string
  /** Si true, marca el input como required */
  required?: boolean
  /** Placeholder del input numerico */
  placeholder?: string
  /** Clase opcional aplicada al wrapper */
  className?: string
  /** Deshabilita el input */
  disabled?: boolean
  /** Para autoFocus en formularios */
  autoFocus?: boolean
  /** Nombre del input (para autofill / formularios) */
  name?: string
}

/** Parsea cualquier string a {prefix, number}. Default prefix = 'V'. */
function parseCedula(raw: string | null | undefined): { prefix: Prefix; number: string } {
  const s = (raw ?? '').toString().trim().toUpperCase()
  if (!s) return { prefix: 'V', number: '' }
  // Detect prefix
  let prefix: Prefix = 'V'
  let rest = s
  if (PREFIXES.includes(s.charAt(0) as Prefix)) {
    prefix = s.charAt(0) as Prefix
    rest = s.slice(1)
    if (rest.startsWith('-')) rest = rest.slice(1)
  }
  // Strip non-digits from the rest
  const digits = rest.replace(/\D/g, '').slice(0, 10)
  return { prefix, number: digits }
}

/** Construye el canonico a partir del prefijo + numero. */
function buildCanonical(prefix: Prefix, number: string): string {
  if (!number) return ''
  return `${prefix}-${number}`
}

export default function CedulaInput({
  value,
  onChange,
  error,
  required,
  placeholder = '12345678',
  className = '',
  disabled,
  autoFocus,
  name,
}: Props) {
  // Estado interno solo para que el dropdown y el numero sean independientes
  const initial = parseCedula(value)
  const [prefix, setPrefix] = useState<Prefix>(initial.prefix)
  const [number, setNumber] = useState<string>(initial.number)

  // Sync cuando cambia el value externo (ej al cargar datos del paciente)
  useEffect(() => {
    const parsed = parseCedula(value)
    setPrefix(parsed.prefix)
    setNumber(parsed.number)
    // Solo cuando cambia el value externo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Validacion local: el numero debe tener 6-10 digitos
  const numberOk = number.length === 0 || (number.length >= 6 && number.length <= 10)
  const showError = error || (number.length > 0 && !numberOk ? 'Cédula debe tener entre 6 y 10 dígitos' : '')

  function handlePrefixChange(next: Prefix) {
    setPrefix(next)
    onChange(buildCanonical(next, number))
  }

  function handleNumberChange(raw: string) {
    // Solo digitos, max 10
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    setNumber(digits)
    onChange(buildCanonical(prefix, digits))
  }

  return (
    <div className={className}>
      <div className={`flex items-stretch border rounded-lg bg-white transition-colors overflow-hidden ${
        showError ? 'border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/10'
                  : 'border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/10'
      } ${disabled ? 'bg-slate-50 opacity-60' : ''}`}>
        <select
          value={prefix}
          onChange={e => handlePrefixChange(e.target.value as Prefix)}
          disabled={disabled}
          aria-label="Tipo de documento"
          className="px-2 py-2 text-sm font-semibold text-slate-700 bg-slate-50 border-r border-slate-200 outline-none cursor-pointer disabled:cursor-not-allowed"
        >
          {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex items-center pl-2 text-slate-400">
          <Hash className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          name={name}
          value={number}
          onChange={e => handleNumberChange(e.target.value)}
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
