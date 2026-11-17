'use client';

import { useState } from 'react';

const CUSTOM = 'custom';

interface DurationSelectProps {
  /** Current value in minutes. */
  value: number;
  onChange: (minutes: number) => void;
  /** Preset choices shown in the list. */
  options: readonly number[];
  /** Bounds for a custom value (the backend validates the same range). */
  min: number;
  max: number;
  /** Suffix for each option: "min" or "minutos". */
  unit?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
  /** Presets that cannot be chosen (e.g. longer than the office block). */
  isOptionDisabled?: (minutes: number) => boolean;
}

/**
 * Duration picker: the usual presets plus "Otro…", which reveals a number input
 * so a specialist can set any duration (e.g. 25 or 50 min) instead of being
 * limited to the list.
 */
export default function DurationSelect({
  value,
  onChange,
  options,
  min,
  max,
  unit = 'min',
  className = '',
  id,
  'aria-label': ariaLabel,
  isOptionDisabled,
}: DurationSelectProps) {
  const isPreset = options.includes(value);
  const [customMode, setCustomMode] = useState(!isPreset);
  // Raw text while typing, so the field can be emptied before writing a new number.
  const [draft, setDraft] = useState(String(value));
  const showCustom = customMode || !isPreset;

  function commit(raw: string) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || raw.trim() === '') return;
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    onChange(clamped);
  }

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={showCustom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustomMode(true);
            setDraft(String(value));
            return;
          }
          setCustomMode(false);
          onChange(Number(e.target.value));
        }}
        aria-label={ariaLabel}
        className={className}
      >
        {options.map((m) => (
          <option key={m} value={m} disabled={isOptionDisabled?.(m) ?? false}>
            {m} {unit}
          </option>
        ))}
        <option value={CUSTOM}>Otro…</option>
      </select>
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value.trim() !== '' && n >= min && n <= max) onChange(Math.round(n));
            }}
            onBlur={(e) => commit(e.target.value)}
            aria-label={ariaLabel ? `${ariaLabel} (minutos)` : 'Minutos'}
            className={className}
          />
          <span className="text-xs text-slate-500 whitespace-nowrap">
            min ({min}–{max})
          </span>
        </div>
      )}
    </div>
  );
}
