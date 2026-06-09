/* ============================================================
   Delta Health Tech — Especialista · Shell
   Sidebar + topbar compartido por todas las pantallas de esp.
   ============================================================ */

const ESP_NAV = [
  { id: "agenda",        label: "Agenda",         icon: "calendar", href: "Delta Health Tech - Esp · Agenda.html" },
  { id: "pacientes",     label: "Pacientes",      icon: "user",     href: "Delta Health Tech - Esp · Pacientes.html", badge: 2 },
  { id: "historias",     label: "Historias",      icon: "clipboard",href: "Delta Health Tech - Esp · Historia.html" },
  { id: "recetas",       label: "Recetas",        icon: "pill",     href: "Delta Health Tech - Esp · Recetas.html" },
  { id: "disponibilidad",label: "Disponibilidad", icon: "bell",     href: "Delta Health Tech - Esp · Disponibilidad.html" },
  { id: "ingresos",      label: "Ingresos",       icon: "sparkle",  href: "Delta Health Tech - Esp · Ingresos.html" },
  { id: "configuracion", label: "Configuración",  icon: "shield",   href: "#" },
];

const EspShell = ({ active, crumb, children }) => (
  <div className="app" data-screen-label={`Especialista · ${crumb}`}>
    <aside className="side">
      <div className="side-head">
        <Wordmark size={32}/>
        <div className="role">Especialista</div>
      </div>
      {ESP_NAV.map(n => (
        <a key={n.id} href={n.href} className={`nav-item ${n.id === active ? "active" : ""}`}>
          <Icon name={n.icon} size={18}/>
          <span>{n.label}</span>
          {n.badge && <span className="badge">{n.badge}</span>}
        </a>
      ))}
      <div className="side-foot">
        <Avatar initials="MR" color="var(--dh-turquoise)" size={36}/>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 13, fontWeight: 600}}>Dra. María Rivas</div>
          <div style={{fontSize: 11, color: "var(--dh-gray-400)"}}>Psicología clínica</div>
        </div>
      </div>
    </aside>

    <div className="main">
      <header className="topbar">
        <div className="crumb">
          Especialista <span style={{margin: "0 8px", color: "var(--dh-gray-400)"}}>›</span>
          <strong>{crumb}</strong>
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 14}}>
          <div style={{display: "flex", alignItems: "center", gap: 10, background: "var(--dh-gray-50)", borderRadius: 999, padding: "8px 16px", minWidth: 280}}>
            <Icon name="sparkle" size={14} color="var(--dh-gray-400)"/>
            <input placeholder="Buscar paciente, receta, nota..." style={{border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13, fontFamily: "inherit"}}/>
          </div>
          <div style={{position: "relative", padding: 8, cursor: "pointer"}}>
            <Icon name="bell" size={18} color="var(--dh-gray-600)"/>
            <span style={{position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 999, background: "var(--dh-coral)"}}/>
          </div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>
);

/* Shared button styles (same visual language as agenda) */
const espBtnPrimary = {
  background: "var(--dh-ink)", color: "#fff", border: "none",
  padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 7,
};
const espBtnSecondary = {
  background: "#fff", color: "var(--dh-ink)", border: "1.5px solid var(--dh-gray-200)",
  padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 7,
};
const espBtnGhost = {
  background: "transparent", color: "var(--dh-gray-600)", border: "none",
  padding: "8px 12px", borderRadius: 999, fontSize: 13, fontWeight: 500,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 7,
};

/* Shared MiniStat */
const EspMiniStat = ({ label, value, sub, icon, tone }) => (
  <div style={{
    background: tone === "turquoise" ? "var(--dh-turquoise-50)" : tone === "coral" ? "rgba(255,138,101,.08)" : "#fff",
    border: tone === "turquoise" ? "1px solid var(--dh-turquoise-100)" : tone === "coral" ? "1px solid rgba(255,138,101,.2)" : "1px solid var(--dh-gray-100)",
    borderRadius: "var(--dh-r-lg)", padding: 20,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em",
        color: tone === "turquoise" ? "var(--dh-turquoise-700)" : tone === "coral" ? "var(--dh-coral-600)" : "var(--dh-gray-400)",
        textTransform: "uppercase", fontWeight: 500 }}>{label}</span>
      <Icon name={icon} size={15} color={tone === "turquoise" ? "var(--dh-turquoise-700)" : tone === "coral" ? "var(--dh-coral-600)" : "var(--dh-gray-400)"}/>
    </div>
    <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 30, fontWeight: 700,
      letterSpacing: "-.02em", lineHeight: 1, color: "var(--dh-ink)" }}>{value}</div>
    <div style={{ fontSize: 11, color: "var(--dh-gray-600)", marginTop: 6 }}>{sub}</div>
  </div>
);

/* Page header (title + subtitle + actions) */
const EspPageHeader = ({ eyebrow, title, highlight, subtitle, actions }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 20 }}>
    <div style={{ minWidth: 0 }}>
      {eyebrow && <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
        letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>{eyebrow}</div>}
      <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)", fontSize: 36, fontWeight: 700, letterSpacing: "-.022em" }}>
        {title}{highlight && <span style={{ color: "var(--dh-turquoise-700)" }}> {highlight}</span>}
      </h1>
      {subtitle && <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--dh-gray-600)" }}>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>{actions}</div>}
  </div>
);

Object.assign(window, { EspShell, ESP_NAV, espBtnPrimary, espBtnSecondary, espBtnGhost, EspMiniStat, EspPageHeader });
