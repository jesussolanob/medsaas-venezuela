'use client';

// L6 (2026-04-29): componente reutilizable de cedula/pasaporte con prefijo dropdown.
//
// Almacena el valor en formato canonico 'V-12345678' / 'E-12345678' / 'P-AB123456'.
// El parent recibe siempre ese formato via onChange.
//
// Prefijos disponibles:
//   V — Venezolano (solo dígitos, 4-15 caracteres)
//   E — Extranjero (solo dígitos, 4-15 caracteres)
//   P — Pasaporte  (alfanumérico, 5-20 caracteres)
//
// Acepta como input inicial (parsea):
//   'V-12345678' → V + 12345678
//   'V12345678'  → V + 12345678
//   '12345678'   → V + 12345678 (default V)
//   ''           → V + ''

import { useEffect, useState } from 'react';
import { Hash } from 'lucide-react';

type Prefix = 'V' | 'E' | 'P';
const PREFIXES: Prefix[] = ['V', 'E', 'P'];

/** Pasaporte: permite alfanumérico, 5-20 caracteres */
const PASSPORT_MAX = 20;
const PASSPORT_MIN = 5;
/** Cédula venezolana/extranjera: solo dígitos, 4-15 caracteres */
const CEDULA_MAX = 15;
const CEDULA_MIN = 4;

type Props = {
  /** Valor canonico, ej 'V-12345678' */
  value: string | null | undefined;
  /** Callback con el canonico ya formado (ej 'V-12345678'). Si numero vacio, devuelve '' */
  onChange: (canonical: string) => void;
  /** Mensaje de error opcional (ej validacion del padre) */
  error?: string;
  /** Si true, marca el input como required */
  required?: boolean;
  /** Placeholder del input numerico */
  placeholder?: string;
  /** Clase opcional aplicada al wrapper */
  className?: string;
  /** Deshabilita el input */
  disabled?: boolean;
  /** Para autoFocus en formularios */
  autoFocus?: boolean;
  /** Nombre del input (para autofill / formularios) */
  name?: string;
};

/** Parsea cualquier string a {prefix, number}. Default prefix = 'V'. */
function parseCedula(raw: string | null | undefined): { prefix: Prefix; number: string } {
  const s = (raw ?? '').toString().trim().toUpperCase();
  if (!s) return { prefix: 'V', number: '' };
  // Detect prefix
  let prefix: Prefix = 'V';
  let rest = s;
  if (PREFIXES.includes(s.charAt(0) as Prefix)) {
    prefix = s.charAt(0) as Prefix;
    rest = s.slice(1);
    if (rest.startsWith('-')) rest = rest.slice(1);
  }
  if (prefix === 'P') {
    // Pasaporte: alfanumérico (letras y dígitos), máximo PASSPORT_MAX
    const alphanumeric = rest.replace(/[^A-Z0-9]/g, '').slice(0, PASSPORT_MAX);
    return { prefix, number: alphanumeric };
  }
  // Cédula V/E: solo dígitos, máximo CEDULA_MAX
  const digits = rest.replace(/\D/g, '').slice(0, CEDULA_MAX);
  return { prefix, number: digits };
}

/** Construye el canonico a partir del prefijo + numero. */
function buildCanonical(prefix: Prefix, number: string): string {
  if (!number) return '';
  return `${prefix}-${number}`;
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
  const initial = parseCedula(value);
  const [prefix, setPrefix] = useState<Prefix>(initial.prefix);
  const [number, setNumber] = useState<string>(initial.number);

  // Sync cuando cambia el value externo (ej al cargar datos del paciente)
  useEffect(() => {
    const parsed = parseCedula(value);
    setPrefix(parsed.prefix);
    setNumber(parsed.number);
    // Solo cuando cambia el value externo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Validacion local segun prefijo
  const numberOk =
    number.length === 0 ||
    (prefix === 'P'
      ? number.length >= PASSPORT_MIN && number.length <= PASSPORT_MAX
      : number.length >= CEDULA_MIN && number.length <= CEDULA_MAX);
  const showError =
    error ||
    (number.length > 0 && !numberOk
      ? prefix === 'P'
        ? `Pasaporte debe tener entre ${PASSPORT_MIN} y ${PASSPORT_MAX} caracteres`
        : `Cédula debe tener entre ${CEDULA_MIN} y ${CEDULA_MAX} dígitos`
      : '');

  function handlePrefixChange(next: Prefix) {
    // When switching between numeric (V/E) and alphanumeric (P), clear the number
    // to avoid invalid characters carrying over.
    const wasPassport = prefix === 'P';
    const willBePassport = next === 'P';
    const shouldClear = wasPassport !== willBePassport;
    const nextNumber = shouldClear ? '' : number;
    setPrefix(next);
    setNumber(nextNumber);
    onChange(buildCanonical(next, nextNumber));
  }

  function handleNumberChange(raw: string) {
    let clean: string;
    if (prefix === 'P') {
      // Pasaporte: alfanumérico en mayúsculas, máximo PASSPORT_MAX
      clean = raw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, PASSPORT_MAX);
    } else {
      // Cédula V/E: solo dígitos, máximo CEDULA_MAX
      clean = raw.replace(/\D/g, '').slice(0, CEDULA_MAX);
    }
    setNumber(clean);
    onChange(buildCanonical(prefix, clean));
  }

  return (
    <div className={className}>
      <div
        className={`flex items-stretch border rounded-lg bg-white transition-colors overflow-hidden ${
          showError
            ? 'border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/10'
            : 'border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/10'
        } ${disabled ? 'bg-slate-50 opacity-60' : ''}`}
      >
        <select
          value={prefix}
          onChange={(e) => handlePrefixChange(e.target.value as Prefix)}
          disabled={disabled}
          aria-label="Tipo de documento"
          className="px-2 py-2 text-sm font-semibold text-slate-700 bg-slate-50 border-r border-slate-200 outline-none cursor-pointer disabled:cursor-not-allowed"
        >
          {PREFIXES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="flex items-center pl-2 text-slate-400">
          <Hash className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          inputMode={prefix === 'P' ? 'text' : 'numeric'}
          pattern={prefix === 'P' ? '[A-Za-z0-9]*' : '[0-9]*'}
          name={name}
          value={number}
          onChange={(e) => handleNumberChange(e.target.value)}
          required={required}
          placeholder={prefix === 'P' ? 'AB1234567' : placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="flex-1 px-2 py-2 text-sm bg-transparent outline-none disabled:cursor-not-allowed"
        />
      </div>
      {showError && <p className="text-[11px] text-red-600 mt-1">{showError}</p>}
    </div>
  );
}
