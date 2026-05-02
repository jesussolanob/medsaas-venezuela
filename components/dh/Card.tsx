/**
 * components/dh/Card.tsx
 *
 * Card base del design system Delta Health Tech.
 * - Border 1px gray-100 + radius 22px (var --dh-r-lg)
 * - Shadow sm por default; lg cuando accent=true
 * - Padding 28px default; ajustable
 */

import type { ReactNode, CSSProperties } from 'react'

type Props = {
  children: ReactNode
  accent?: boolean
  /** Padding personalizado en px (default 28). Use 0 para sin padding (ej: tablas full-width). */
  padding?: number | string
  className?: string
  style?: CSSProperties
}

export function Card({ children, accent = false, padding = 28, className = '', style }: Props) {
  return (
    <div
      className={`bg-white border border-[var(--dh-gray-100)] ${className}`}
      style={{
        borderRadius: 'var(--dh-r-lg)',
        padding: typeof padding === 'number' ? `${padding}px` : padding,
        boxShadow: accent ? 'var(--dh-shadow-lg)' : 'var(--dh-shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
