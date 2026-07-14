/**
 * components/dh/Logo.tsx
 *
 * Sistema de logo Delta Health Tech.
 * Isotipo oficial: lazo coral + turquesa (delta entrelazada).
 *
 * Origen: brand kit oficial 2026-06 (images/delta-iso). El isotipo es un PNG
 * transparente de alta resolución; lo servimos optimizado desde /logos.
 * Para la variante en blanco (sobre fondos de color) aplicamos un filtro CSS
 * de silueta, así no necesitamos un asset aparte ni cambiar los call sites.
 */

import Image from 'next/image';

const ISO_SRC = '/logos/delta-iso-512.png';

/**
 * Detecta si el caller pidió el isotipo en blanco (uso sobre fondos de color),
 * preservando la API previa basada en `primary`.
 */
function isWhiteRequest(primary: string): boolean {
  const v = primary.trim().toLowerCase();
  return v === '#fff' || v === '#ffffff' || v === 'white';
}

type MarkProps = {
  size?: number;
  /** '#fff' | 'white' → renderiza el isotipo en blanco (sobre fondos de color) */
  primary?: string;
  /** Reservado por compat con la API previa; el isotipo oficial trae su color */
  accent?: string;
  /** Reservado por compat con la API previa */
  bold?: boolean;
  className?: string;
};

/**
 * Isotipo principal — lazo coral + turquesa (variante PRIMARIA del brand kit)
 */
export function DeltaMark({ size = 48, primary = 'var(--dh-turquoise)', className }: MarkProps) {
  const white = isWhiteRequest(primary);
  return (
    <Image
      src={ISO_SRC}
      alt="Delta Health Tech"
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{
        objectFit: 'contain',
        // Silueta blanca para uso sobre fondos de color (ej. hero turquesa)
        filter: white ? 'brightness(0) invert(1)' : undefined,
      }}
    />
  );
}

type WordmarkProps = {
  size?: number;
  color?: string;
  primary?: string;
  accent?: string;
  vertical?: boolean;
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
};

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
  const fontSize = size * 0.52;
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
        Delta <span style={{ color: 'var(--dh-turquoise)' }}>Salud</span>
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
  );
}
