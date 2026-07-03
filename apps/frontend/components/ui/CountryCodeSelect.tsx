'use client';

/**
 * CountryCodeSelect — selector de código de discado internacional.
 *
 * Muestra un <select> con países de Latinoamérica + España + EE.UU.
 * El default es Venezuela (+58). Permite además ingresar un prefijo
 * personalizado mediante la opción "Otro…" que habilita un <input> editable.
 *
 * Renderiza como un Fragment (sin div wrapper) para que el componente padre
 * (PhoneInput) lo componga directamente dentro de su contenedor flex sin
 * niveles de anidamiento extra.
 *
 * Props:
 *   value    — código actual, e.g. '+58', '+57', '+49' (custom)
 *   onChange — callback con el nuevo código cuando cambia
 *   disabled — deshabilita selección e ingreso
 */

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Datos de países
// ---------------------------------------------------------------------------

export type CountryOption = {
  code: string; // e.g. '+58'
  flag: string; // emoji de bandera
  name: string; // nombre en español
};

/**
 * Lista de países de Latinoamérica + España + EE.UU./Rep. Dom.
 * Exportada para que otros módulos (PhoneInput) puedan usarla en el parser.
 */
export const LATAM_COUNTRIES: CountryOption[] = [
  { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+1', flag: '🇺🇸', name: 'EE.UU. / Rep. Dom.' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
];

export const KNOWN_CODES = new Set(LATAM_COUNTRIES.map((c) => c.code));

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Props = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

// Valor interno del <select> cuando el usuario elige "Otro…"
const CUSTOM_VALUE = '__custom__';

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Limpia la entrada del campo personalizado: garantiza que empiece con '+' y
 * solo contenga dígitos después del '+'.
 */
function sanitizeCustomCode(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? '+' + digits : '+';
}

export default function CountryCodeSelect({ value, onChange, disabled }: Props) {
  const isKnown = KNOWN_CODES.has(value);

  // Modo "personalizado": cuando el valor entrante no está en la lista conocida,
  // o cuando el usuario seleccionó "Otro…".
  const [showCustom, setShowCustom] = useState<boolean>(!isKnown);
  // Buffer del input personalizado (solo relevante cuando showCustom === true).
  const [customInput, setCustomInput] = useState<string>(!isKnown ? value : '');

  // Sincronizar cuando el padre cambia el valor externamente.
  useEffect(() => {
    if (KNOWN_CODES.has(value)) {
      setShowCustom(false);
      setCustomInput('');
    } else {
      setShowCustom(true);
      setCustomInput(value);
    }
  }, [value]);

  const selectValue = showCustom ? CUSTOM_VALUE : value;

  function handleSelectChange(selected: string) {
    if (selected === CUSTOM_VALUE) {
      // Pre-llenamos el input con el valor actual para que el usuario lo edite.
      setShowCustom(true);
      setCustomInput(isKnown ? '' : value);
    } else {
      setShowCustom(false);
      setCustomInput('');
      onChange(selected);
    }
  }

  function handleCustomChange(raw: string) {
    const clean = sanitizeCustomCode(raw);
    setCustomInput(clean);
    // Solo notificamos al padre cuando hay al menos un dígito después del '+'.
    if (clean.length >= 2) {
      onChange(clean);
    }
  }

  const selectCls = [
    'bg-slate-50 text-sm font-semibold text-slate-700',
    'py-2 pl-2.5 pr-1',
    'border-r border-slate-200',
    'outline-none transition-colors',
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-100',
  ].join(' ');

  return (
    <>
      <select
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        disabled={disabled}
        aria-label="Código de país"
        className={selectCls}
      >
        {LATAM_COUNTRIES.map((c) => (
          // Usamos code+name como key porque +1 puede tener múltiples entradas
          // en teoría; aquí es único pero la clave explícita evita warnings de React.
          <option key={`${c.code}-${c.name}`} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Otro…</option>
      </select>

      {showCustom && (
        <input
          type="text"
          value={customInput}
          onChange={(e) => handleCustomChange(e.target.value)}
          disabled={disabled}
          placeholder="+49"
          maxLength={6}
          aria-label="Código de país personalizado"
          className={[
            'w-14 py-2 px-1.5',
            'text-sm font-semibold text-slate-700 text-center',
            'bg-slate-50 border-r border-slate-200',
            'outline-none focus:bg-white transition-colors',
            disabled ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
        />
      )}
    </>
  );
}
