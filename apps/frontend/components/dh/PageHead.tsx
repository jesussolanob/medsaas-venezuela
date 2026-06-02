/**
 * components/dh/PageHead.tsx
 *
 * Header consistente para páginas de admin/doctor.
 * Title display 34px Plus Jakarta + subtítulo opcional + acciones derecha.
 */

import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function PageHead({ title, subtitle, actions, className = '' }: Props) {
  return (
    <div className={`flex items-end justify-between gap-4 mb-6 sm:mb-7 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1
          className="font-semibold tracking-tight text-[var(--dh-ink)] m-0 leading-tight"
          style={{ fontFamily: 'var(--dh-font-display)', fontSize: 'clamp(22px, 3.2vw, 34px)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[15px] text-[var(--dh-gray-600)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  )
}
