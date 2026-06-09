/* ============================================================
   Delta Health Tech — Logo system
   Concepto: lazo asimétrico — uno guía (especialista),
   otro recibe (paciente). Curvas orgánicas y fluidas.
   ============================================================ */

/**
 * Isotipo principal — Variación 1 (PRIMARIO):
 * Dos curvas asimétricas que se entrelazan formando un nudo abierto.
 * La curva turquesa (especialista) abraza y guía; la coral (paciente)
 * descansa dentro del abrazo.
 * Trazos más gruesos + relleno sutil = mayor presencia visual.
 */
const Mark = ({ size = 120, primary = "var(--dh-turquoise)", accent = "var(--dh-coral)", bold = false }) => {
  const sw = bold ? 16 : 14;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-label="Delta Health Tech">
      <defs>
        <linearGradient id={`dh-grad-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={primary} stopOpacity="0.18" />
          <stop offset="100%" stopColor={primary} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Halo sutil que da cuerpo al isotipo sin ensuciarlo */}
      <path
        d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56"
        stroke={`url(#dh-grad-${size})`}
        strokeWidth={sw + 14}
        strokeLinecap="round"
        fill="none"
      />
      {/* Curva guía — especialista (más larga, envolvente) */}
      <path
        d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56"
        stroke={primary}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Curva receptiva — paciente (más corta, contenida) */}
      <path
        d="M58 92 C 78 92, 92 78, 88 60"
        stroke={accent}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Punto de encuentro — ancla el lazo y le da peso */}
      <circle cx="78" cy="72" r="4.5" fill={accent} />
    </svg>
  );
};

/** Variación 2 — Lazo cerrado (nudo infinito asimétrico) */
const MarkV2 = ({ size = 120, primary = "var(--dh-turquoise)", accent = "var(--dh-coral)" }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <path
      d="M60 60 C 30 30, 18 60, 36 76 C 54 92, 78 70, 60 60"
      stroke={primary}
      strokeWidth="10"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M60 60 C 90 90, 102 60, 84 44 C 66 28, 42 50, 60 60"
      stroke={accent}
      strokeWidth="10"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

/** Variación 3 — Gota guía + gota receptora (más orgánico) */
const MarkV3 = ({ size = 120, primary = "var(--dh-turquoise)", accent = "var(--dh-coral)" }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <path
      d="M30 60 C 30 30, 60 18, 78 36 C 96 54, 84 84, 60 84 C 42 84, 30 76, 30 60 Z"
      fill={primary}
    />
    <circle cx="74" cy="62" r="14" fill={accent} />
  </svg>
);

/** Variación 4 — Triángulo Delta formado por dos curvas que se abrazan */
const MarkV4 = ({ size = 120, primary = "var(--dh-turquoise)", accent = "var(--dh-coral)" }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <path
      d="M22 92 C 30 60, 48 32, 60 22 C 72 32, 90 60, 98 92"
      stroke={primary}
      strokeWidth="11"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M40 92 C 50 80, 70 80, 80 92"
      stroke={accent}
      strokeWidth="11"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

/** Wordmark — tipografía + isotipo */
const Wordmark = ({ size = 56, color = "var(--dh-ink)", primary, accent, vertical = false }) => {
  const fontSize = size * 0.52;
  return (
    <div style={{
      display: "inline-flex",
      flexDirection: vertical ? "column" : "row",
      alignItems: "center",
      gap: vertical ? size * 0.22 : size * 0.28,
    }}>
      <Mark size={size} primary={primary} accent={accent} bold />
      <div style={{
        fontFamily: "var(--dh-font-display)",
        fontWeight: 800,
        fontSize: `${fontSize}px`,
        color,
        lineHeight: 1,
        letterSpacing: "-0.035em",
        textAlign: vertical ? "center" : "left",
      }}>
        Delta<span style={{ color: "var(--dh-turquoise)" }}>.</span>
        <div style={{
          fontWeight: 600,
          fontSize: `${fontSize * 0.38}px`,
          color: "var(--dh-gray-400)",
          letterSpacing: "0.22em",
          marginTop: vertical ? 8 : 6,
          textTransform: "uppercase",
        }}>
          Health Tech
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Mark, MarkV2, MarkV3, MarkV4, Wordmark });
