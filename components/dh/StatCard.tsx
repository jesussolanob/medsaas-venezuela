/**
 * components/dh/StatCard.tsx
 *
 * KPI card del Delta Health Tech design system.
 * Layout: label en monospace uppercase + ícono pill turquesa | valor display
 * grande | delta opcional con flecha y color semantic.
 *
 * Origen: handoff bundle 2026-05-02.
 */

import type { ReactNode } from 'react'

type Props = {
  /** Label superior — mono caps */
  label: string
  /** Valor principal — display large */
  value: string | number
  /** Subtítulo opcional debajo del valor */
  subtitle?: string
  /** Texto delta (ej: "+12% vs mes anterior") */
  delta?: string
  /** Color del delta — default verde success */
  deltaColor?: 'success' | 'error' | 'neutral' | 'turquoise'
  /** Ícono lucide o SVG, mostrado en la pill turquesa arriba derecha */
  icon?: ReactNode
  className?: string
}

const DELTA_COLOR_MAP = {
  success:   'text-[var(--dh-success)]',
  error:     'text-[var(--dh-error)]',
  neutral:   'text-[var(--dh-gray-600)]',
  turquoise: 'text-[var(--dh-turquoise-700)]',
}

export function StatCard({
  label, value, subtitle, delta, deltaColor = 'success', icon, className = '',
}: Props) {
  return (
    <div
      className={`bg-white rounded-[var(--dh-r-lg)] border border-[var(--dh-gray-100)] p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-[11px] font-mono tracking-wider uppercase text-[var(--dh-gray-400)]">
          {label}
        </span>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-[var(--dh-turquoise-50)] text-[var(--dh-turquoise-700)] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>
      <div
        className="font-semibold tracking-tight leading-none text-[var(--dh-ink)]"
        style={{ fontSize: 'clamp(28px, 4vw, 36px)' }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-[13px] text-[var(--dh-gray-600)] mt-1.5">{subtitle}</div>
      )}
      {delta && (
        <div className={`text-xs font-semibold mt-3 ${DELTA_COLOR_MAP[deltaColor]}`}>
          {delta}
        </div>
      )}
    </div>
  )
}
