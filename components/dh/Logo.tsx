/**
 * components/dh/Logo.tsx
 *
 * Sistema de logo Delta Salud.
 * Usa los assets PNG del brand kit oficial (brand/logo/).
 *
 * Actualizado 2026-06-13: reemplazado SVG artesanal por PNGs del kit de marca.
 */

type MarkProps = {
  size?: number
  /** Si true, usa la versión blanca del símbolo (para fondos oscuros) */
  white?: boolean
  /** Alias de white para compatibilidad con el uso anterior de bold */
  bold?: boolean
  className?: string
  primary?: string   // ignorado — mantenido por compatibilidad
  accent?: string    // ignorado — mantenido por compatibilidad
}

/**
 * Isotipo / símbolo solo (Δ mark) — usar en sidebars, favicons, espacios pequeños.
 * Renderiza el PNG oficial del brand kit.
 */
export function DeltaMark({
  size = 48,
  white = false,
  bold = false,       // bold se usaba antes, ahora ignorado
  className,
}: MarkProps) {
  const src = white || bold
    ? '/brand/logo/delta-symbol-white.png'
    : '/brand/logo/delta-symbol.png'
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Delta Salud"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', display: 'inline-block' }}
    />
  )
}

type WordmarkProps = {
  size?: number
  /** Si true, usa el logo blanco (para fondos oscuros) */
  white?: boolean
  color?: string    // ignorado — mantenido por compatibilidad
  primary?: string  // ignorado — mantenido por compatibilidad
  accent?: string   // ignorado — mantenido por compatibilidad
  vertical?: boolean
  showSubtitle?: boolean
  subtitle?: string
  className?: string
}

/**
 * Wordmark completo: usa el logo horizontal PNG del brand kit oficial.
 * delta-logo.png → fondos claros | delta-logo-white.png → fondos oscuros.
 * El `subtitle` se renderiza debajo del logo si showSubtitle=true.
 */
export function DeltaWordmark({
  size = 40,
  white = false,
  vertical = false,
  showSubtitle = true,
  subtitle = 'Medical CRM',
  className,
}: WordmarkProps) {
  const src = white ? '/brand/logo/delta-logo-white.png' : '/brand/logo/delta-logo.png'
  const logoHeight = size
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: vertical ? 'center' : 'flex-start',
        gap: 4,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Delta Salud"
        height={logoHeight}
        style={{ objectFit: 'contain', display: 'block' }}
      />
      {showSubtitle && (
        <div
          style={{
            fontFamily: 'var(--dh-font-mono)',
            fontWeight: 600,
            fontSize: `${logoHeight * 0.22}px`,
            color: 'var(--dh-gray-400)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}
