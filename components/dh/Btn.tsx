/**
 * components/dh/Btn.tsx
 *
 * Botón Delta Health Tech con 5 variantes según el design system del handoff:
 *   - primary    → ink negro azul, CTA principal (hover: turquesa)
 *   - secondary  → blanco con borde, acción secundaria
 *   - ghost      → transparente, acciones terciarias
 *   - danger     → rojo suave para acciones destructivas
 *   - turquoise  → turquesa (acción positiva / branding)
 *
 * Pill radius (999px), Plus Jakarta Sans semibold.
 */

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'turquoise' | 'accent'
type BtnSize = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant
  size?: BtnSize
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  children?: ReactNode
}

const VARIANTS: Record<BtnVariant, string> = {
  primary:   'bg-[var(--dh-ink)] text-white border-transparent hover:bg-[var(--dh-turquoise-700)] hover:-translate-y-px',
  secondary: 'bg-white text-[var(--dh-ink)] border-[1.5px] border-[var(--dh-gray-200)] hover:border-[var(--dh-ink)]',
  ghost:     'bg-transparent text-[var(--dh-gray-600)] border-transparent hover:bg-[var(--dh-gray-50)] hover:text-[var(--dh-ink)]',
  danger:    'bg-[#FEF2F2] text-[#B91C1C] border-[1.5px] border-[#FEE2E2] hover:bg-[#FEE2E2]',
  turquoise: 'bg-[var(--dh-turquoise)] text-white border-transparent hover:bg-[var(--dh-turquoise-700)]',
  accent:    'bg-[var(--dh-coral)] text-white border-transparent hover:bg-[var(--dh-coral-600)]',
}

const SIZES: Record<BtnSize, string> = {
  sm: 'text-xs py-2 px-3.5',
  md: 'text-[13px] py-2.5 px-4.5',
  lg: 'text-[15px] py-3.5 px-7',
}

export const Btn = forwardRef<HTMLButtonElement, Props>(function Btn(
  { variant = 'primary', size = 'md', icon, iconPosition = 'left', className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon && iconPosition === 'left' && icon}
      {children}
      {icon && iconPosition === 'right' && icon}
    </button>
  )
})
