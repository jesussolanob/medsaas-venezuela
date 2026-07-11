'use client';

/**
 * PhoneInput — input de teléfono con selector de prefijo de país.
 *
 * Reemplaza el prefijo fijo '+58' por CountryCodeSelect, que permite
 * elegir cualquier país de Latinoamérica o ingresar un código personalizado.
 * El default sigue siendo Venezuela (+58).
 *
 * Formato canónico de salida (onChange):
 *   - Venezuela (+58): '58' + 10 dígitos que empiezan con 4 → '584141234567'
 *     Solo se emite cuando el número está completo y bien formado (backward-compat).
 *   - Otros países: código (sin '+') + dígitos locales, e.g. '571234567890'
 *     Se emite en cuanto hay al menos un dígito en el campo local.
 *   - Incompleto / vacío: '' (el padre sabe que no hay número válido).
 *
 * Parsing del valor entrante (value prop):
 *   1. Intenta normalizePhoneVE → detecta formatos VE legados ('04141234567', etc.)
 *   2. Intenta match contra códigos conocidos (orden: más largo primero)
 *   3. Fallback: +58 con los dígitos como local
 *
 * Nota sobre waLink/formatPhoneVE: esas utilidades solo manejan VE canonical.
 * Para números de otros países, el enlace wa.me se construye con el valor
 * tal cual (código + local, sin '+'). Los helpers se actualizarán en Fase 5.
 */

import { useEffect, useState } from 'react';
import { normalizePhoneVE } from '@/lib/phone-utils';
import CountryCodeSelect, { LATAM_COUNTRIES } from '@/components/ui/CountryCodeSelect';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Códigos ordenados de mayor a menor longitud para evitar que '+59' (si existiera)
 * consuma el inicio de '+593' (Ecuador). El match más largo gana.
 */
const SORTED_CODES = [...LATAM_COUNTRIES]
  .sort((a, b) => b.code.replace('+', '').length - a.code.replace('+', '').length)
  .map((c) => c.code);

/**
 * Divide un valor de teléfono almacenado en { code, local }.
 *
 * Ejemplos:
 *   '584141234567'  → { code: '+58', local: '4141234567' }
 *   '04141234567'   → { code: '+58', local: '4141234567' } (VE legado)
 *   '571234567890'  → { code: '+57', local: '1234567890' }
 *   '5931234567890' → { code: '+593', local: '1234567890' }
 *   ''              → { code: '+58', local: '' }
 */
function parsePhoneValue(raw: string | null | undefined): { code: string; local: string } {
  // Paso 1: intentar normalización VE para manejar formatos legados
  const veCanonical = normalizePhoneVE(raw);
  if (veCanonical) {
    return { code: '+58', local: veCanonical.slice(2) };
  }

  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return { code: '+58', local: '' };

  // Paso 2: match contra códigos conocidos (más largo primero)
  for (const code of SORTED_CODES) {
    const codeDigits = code.replace('+', '');
    if (digits.startsWith(codeDigits)) {
      return { code, local: digits.slice(codeDigits.length) };
    }
  }

  // Paso 3: fallback — mostrar los dígitos en el campo local con +58
  return { code: '+58', local: digits };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Valor canónico: '584141234567' (VE) / 'CCXXXXXXXXX' (otros). También acepta formatos legados. */
  value: string | null | undefined;
  /** Callback con el canónico. '' cuando el número está incompleto / inválido. */
  onChange: (canonical: string) => void;
  /** Mensaje de error externo (validación del padre). */
  error?: string;
  /** Marca el input de dígitos como required (HTML). */
  required?: boolean;
  /** Placeholder del campo de dígitos locales. */
  placeholder?: string;
  /** Clase extra para el wrapper externo. */
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

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
  const initial = parsePhoneValue(value);
  const [countryCode, setCountryCode] = useState<string>(initial.code);
  const [localDigits, setLocalDigits] = useState<string>(initial.local);

  // Sincronizar cuando el padre actualiza el value externamente
  useEffect(() => {
    const p = parsePhoneValue(value);
    setCountryCode(p.code);
    setLocalDigits(p.local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ── Validación ──────────────────────────────────────────────────────────

  const isVenezuela = countryCode === '+58';

  const veValidationError: string | null = (() => {
    if (!isVenezuela || localDigits.length === 0) return null;
    if (localDigits.length > 10) return 'No debe exceder 10 dígitos';
    if (localDigits.length < 10) return 'El teléfono debe tener 10 dígitos';
    if (!localDigits.startsWith('4')) return 'El teléfono móvil debe iniciar con 4';
    return null;
  })();

  // Validation error for exceeding max digits for non-VE countries.
  // Venezuela's over-limit case is already covered by veValidationError.
  const tooManyDigitsError: string | null =
    !isVenezuela && localDigits.length > 15 ? 'No debe exceder 15 dígitos' : null;

  const displayError = error ?? veValidationError ?? tooManyDigitsError ?? null;

  // ── Emisión del valor canónico ───────────────────────────────────────────

  function emitCanonical(code: string, local: string) {
    if (!local) {
      onChange('');
      return;
    }
    if (code === '+58') {
      // VE: solo emitir cuando está completo y bien formado (backward-compat)
      if (local.length === 10 && local.startsWith('4')) {
        onChange('58' + local);
      } else {
        onChange('');
      }
    } else {
      // Otros países: emitir en cuanto haya dígitos
      onChange(code.replace('+', '') + local);
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleCountryChange(code: string) {
    setCountryCode(code);
    emitCanonical(code, localDigits);
  }

  function handleLocalChange(raw: string) {
    // Strip non-digits but do NOT truncate: let the user type freely so they
    // can see the validation error without the field silently chopping input.
    const digits = raw.replace(/\D/g, '');
    setLocalDigits(digits);
    emitCanonical(countryCode, digits);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const borderCls = displayError
    ? 'border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/10'
    : 'border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/10';

  return (
    <div className={className}>
      <div
        className={`flex items-center border rounded-lg bg-white transition-colors overflow-hidden ${borderCls} ${disabled ? 'opacity-60' : ''}`}
      >
        {/* Selector de código de país — renderiza como Fragment (select + optional input) */}
        <CountryCodeSelect value={countryCode} onChange={handleCountryChange} disabled={disabled} />

        {/* Campo de dígitos locales */}
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          name={name}
          value={localDigits}
          onChange={(e) => handleLocalChange(e.target.value)}
          required={required}
          placeholder={isVenezuela ? placeholder : '…'}
          disabled={disabled}
          autoFocus={autoFocus}
          className="flex-1 px-2 py-2 text-sm bg-transparent outline-none disabled:cursor-not-allowed"
        />
      </div>
      {displayError && <p className="text-[11px] text-red-600 mt-1">{displayError}</p>}
    </div>
  );
}
