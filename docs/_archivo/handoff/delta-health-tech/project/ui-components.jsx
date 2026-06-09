/* ============================================================
   Delta Health Tech — UI Components
   ============================================================ */

const Icon = ({ name, size = 24, stroke = 1.8, color = "currentColor" }) => {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    chat: <path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12z"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 5-6 8-6s7 2 8 6"/></>,
    shield: <path d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3z"/>,
    heart: <path d="M12 21s-7-4.5-9.5-9.5C.5 7 4 3 7.5 4.5 9.5 5.4 12 8 12 8s2.5-2.6 4.5-3.5C20 3 23.5 7 21.5 11.5 19 16.5 12 21 12 21z"/>,
    sparkle: <path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16z"/>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
    check: <path d="M5 12l5 5L20 7"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    stethoscope: <><path d="M6 4v6a4 4 0 0 0 8 0V4"/><path d="M10 14v3a4 4 0 0 0 8 0v-1"/><circle cx="18" cy="11" r="2"/></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></>,
    pill: <><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-30 12 12)"/><path d="M8.5 7.5l7 7" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

const Button = ({ children, variant = "primary", icon, size = "md", onClick }) => {
  const sizes = {
    sm: { padding: "10px 18px", fontSize: 14 },
    md: { padding: "16px 28px", fontSize: 16 },
    lg: { padding: "20px 36px", fontSize: 18 },
  };
  return (
    <button className={`dh-btn dh-btn-${variant}`} style={sizes[size]} onClick={onClick}>
      {children}
      {icon && <Icon name={icon} size={18} stroke={2.2} />}
    </button>
  );
};

const Input = ({ label, placeholder, icon, value, type = "text" }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "var(--dh-font-body)" }}>
    {label && (
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dh-gray-800)" }}>{label}</span>
    )}
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--dh-white)",
      border: "1.5px solid var(--dh-gray-200)",
      borderRadius: "var(--dh-r-md)",
      padding: "14px 18px",
    }}>
      {icon && <Icon name={icon} size={18} color="var(--dh-gray-400)" />}
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        style={{
          border: "none", outline: "none", flex: 1, fontSize: 16,
          fontFamily: "inherit", color: "var(--dh-ink)", background: "transparent",
        }}
      />
    </div>
  </label>
);

const Badge = ({ children, tone = "turquoise" }) => {
  const tones = {
    turquoise: { bg: "var(--dh-turquoise-100)", fg: "var(--dh-turquoise-700)" },
    coral:     { bg: "var(--dh-coral-100)",      fg: "var(--dh-coral-600)" },
    gray:      { bg: "var(--dh-gray-100)",       fg: "var(--dh-gray-800)" },
    success:   { bg: "#D1FAE5",                  fg: "#047857" },
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px",
      borderRadius: "var(--dh-r-pill)",
      background: tones.bg,
      color: tones.fg,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: ".02em",
    }}>{children}</span>
  );
};

const Card = ({ children, accent = false, style }) => (
  <div style={{
    background: "var(--dh-white)",
    border: `1px solid var(--dh-gray-100)`,
    borderRadius: "var(--dh-r-lg)",
    padding: 28,
    boxShadow: accent ? "var(--dh-shadow-lg)" : "var(--dh-shadow-sm)",
    ...style,
  }}>{children}</div>
);

const Avatar = ({ initials, color = "var(--dh-turquoise)", size = 40 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    background: color, color: "var(--dh-white)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: size * 0.38,
    fontFamily: "var(--dh-font-display)",
  }}>{initials}</div>
);

Object.assign(window, { Icon, Button, Input, Badge, Card, Avatar });
