/**
 * components/dh/Logo.tsx
 *
 * Sistema de logo Delta Health Tech.
 * Concepto: lazo asimétrico — uno guía (especialista, turquesa),
 * otro recibe (paciente, coral). Curvas orgánicas y fluidas.
 *
 * Origen: handoff bundle 2026-05-02 (claude.ai/design)
 */

type MarkProps = {
  size?: number
  primary?: string
  accent?: string
  bold?: boolean
  className?: string
}

/**
 * Isotipo principal — lazo asimétrico (variante PRIMARIA del brand kit)
 */
export function DeltaMark({
  size = 48,
  primary = 'var(--dh-turquoise)',
  accent = 'var(--dh-coral)',
  bold = false,
  className,
}: MarkProps) {
  const sw = bold ? 16 : 14
  const gradientId = `dh-grad-${size}-${bold ? 'b' : 'r'}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      aria-label="Delta Health Tech"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={primary} stopOpacity="0.18" />
          <stop offset="100%" stopColor={primary} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Halo sutil que da cuerpo al isotipo */}
      <path
        d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56"
        stroke={`url(#${gradientId})`}
        strokeWidth={sw + 14}
        strokeLinecap="round"
        fill="none"
      />
      {/* Curva guía — especialista */}
      <path
        d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56"
        stroke={primary}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Curva receptiva — paciente */}
      <path
        d="M58 92 C 78 92, 92 78, 88 60"
        stroke={accent}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Punto de encuentro */}
      <circle cx="78" cy="72" r="4.5" fill={accent} />
    </svg>
  )
}

type WordmarkProps = {
  size?: number
  color?: string
  primary?: string
  accent?: string
  vertical?: boolean
  showSubtitle?: boolean
  subtitle?: string
  className?: string
}

/**
 * Wordmark completo: isotipo + tipografía "Delta." con punto turquesa
 * + opcional "Health Tech" en uppercase con tracking ancho.
 */
export function DeltaWordmark({
  size = 40,
  color = 'var(--dh-ink)',
  primary,
  accent,
  vertical = false,
  showSubtitle = true,
  subtitle = 'Medical CRM',
  className,
}: WordmarkProps) {
  const fontSize = size * 0.52
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: vertical ? size * 0.22 : size * 0.28,
      }}
    >
      <DeltaMark size={size} primary={primary} accent={accent} bold />
      <div
        style={{
          fontFamily: 'var(--dh-font-display)',
          fontWeight: 800,
          fontSize: `${fontSize}px`,
          color,
          lineHeight: 1,
          letterSpacing: '-0.035em',
          textAlign: vertical ? 'center' : 'left',
        }}
      >
        Delta<span style={{ color: 'var(--dh-turquoise)' }}>.</span>
        {showSubtitle && (
          <div
            style={{
              fontWeight: 600,
              fontSize: `${fontSize * 0.38}px`,
              color: 'var(--dh-gray-400)',
              letterSpacing: '0.22em',
              marginTop: vertical ? 8 : 6,
              textTransform: 'uppercase',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}
