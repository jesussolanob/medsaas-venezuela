/* ============================================================
   Delta Health Tech — Product Screens
   Super Admin · Especialista · Paciente
   ============================================================ */

/* ---------- Shared chrome ---------- */
const AppShell = ({ role, nav, active, user, children, notifBadge = 0 }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    height: "100%",
    background: "var(--dh-bone)",
    fontFamily: "var(--dh-font-body)",
    color: "var(--dh-ink)",
  }}>
    {/* Sidebar */}
    <aside style={{
      background: "var(--dh-white)",
      borderRight: "1px solid var(--dh-gray-100)",
      padding: "28px 20px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ padding: "0 8px 24px", borderBottom: "1px solid var(--dh-gray-100)", marginBottom: 20 }}>
        <Wordmark size={36} />
        <div style={{ marginTop: 10, fontSize: 11, fontFamily: "var(--dh-font-mono)",
          color: "var(--dh-turquoise-700)", letterSpacing: ".08em", textTransform: "uppercase" }}>
          {role}
        </div>
      </div>
      {nav.map((item) => (
        <div key={item.label} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "11px 14px", borderRadius: "var(--dh-r-md)",
          background: active === item.label ? "var(--dh-turquoise-50)" : "transparent",
          color: active === item.label ? "var(--dh-turquoise-700)" : "var(--dh-gray-600)",
          fontSize: 14, fontWeight: active === item.label ? 600 : 500,
          cursor: "pointer",
        }}>
          <Icon name={item.icon} size={18} />
          <span>{item.label}</span>
          {item.badge && (
            <span style={{
              marginLeft: "auto",
              background: "var(--dh-coral)", color: "#fff",
              fontSize: 10, fontWeight: 700,
              padding: "2px 7px", borderRadius: 999,
            }}>{item.badge}</span>
          )}
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "16px 8px 0", borderTop: "1px solid var(--dh-gray-100)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar initials={user.initials} color={user.color} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "var(--dh-gray-400)" }}>{user.sub}</div>
          </div>
        </div>
      </div>
    </aside>

    {/* Main */}
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Topbar */}
      <header style={{
        padding: "20px 40px", borderBottom: "1px solid var(--dh-gray-100)",
        background: "var(--dh-white)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--dh-gray-50)", borderRadius: "var(--dh-r-pill)",
          padding: "10px 18px", minWidth: 360,
        }}>
          <Icon name="sparkle" size={16} color="var(--dh-gray-400)" />
          <input placeholder="Buscar..." style={{
            border: "none", outline: "none", background: "transparent", flex: 1,
            fontSize: 14, fontFamily: "inherit", color: "var(--dh-ink)",
          }}/>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ position: "relative", padding: 10, borderRadius: 999, cursor: "pointer" }}>
            <Icon name="bell" size={18} color="var(--dh-gray-600)" />
            {notifBadge > 0 && <span style={{
              position: "absolute", top: 6, right: 6,
              width: 8, height: 8, borderRadius: 999, background: "var(--dh-coral)",
            }}/>}
          </div>
        </div>
      </header>
      <main style={{ padding: 40, overflow: "auto", flex: 1 }}>
        {children}
      </main>
    </div>
  </div>
);

const StatCard = ({ label, value, delta, deltaColor = "var(--dh-success)", icon }) => (
  <div style={{
    background: "var(--dh-white)", borderRadius: "var(--dh-r-lg)",
    border: "1px solid var(--dh-gray-100)", padding: 22,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em",
        color: "var(--dh-gray-400)", textTransform: "uppercase" }}>{label}</span>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--dh-turquoise-50)",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dh-turquoise-700)" }}>
        <Icon name={icon} size={16} />
      </div>
    </div>
    <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 36, fontWeight: 700,
      letterSpacing: "-.02em", lineHeight: 1, color: "var(--dh-ink)" }}>{value}</div>
    {delta && <div style={{ fontSize: 12, color: deltaColor, marginTop: 8, fontWeight: 600 }}>{delta}</div>}
  </div>
);

/* ============================================================
   SCREEN 1 — SUPER ADMIN · Dashboard
   ============================================================ */
const ScreenSuperAdmin = () => (
  <AppShell
    role="Super Admin"
    user={{ initials: "DH", color: "var(--dh-ink)", name: "Delta Admin", sub: "admin@delta.health" }}
    active="Dashboard"
    notifBadge={3}
    nav={[
      { label: "Dashboard",     icon: "sparkle" },
      { label: "Especialistas", icon: "user" },
      { label: "Aprobaciones",  icon: "check", badge: 7 },
      { label: "Pacientes",     icon: "heart" },
      { label: "Finanzas",      icon: "clipboard" },
      { label: "Sugerencias",   icon: "chat" },
      { label: "Configuración", icon: "shield" },
    ]}
  >
    {/* Hero — usa el lazo grande como fondo */}
    <div style={{
      background: "linear-gradient(135deg, var(--dh-turquoise-700) 0%, var(--dh-turquoise) 100%)",
      borderRadius: "var(--dh-r-xl)",
      padding: "36px 40px",
      color: "#fff",
      position: "relative",
      overflow: "hidden",
      marginBottom: 24,
    }}>
      <div style={{ position: "absolute", right: -80, top: -40, opacity: .15 }}>
        <Mark size={340} primary="#fff" accent="var(--dh-coral)" />
      </div>
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)",
          letterSpacing: ".1em", textTransform: "uppercase", opacity: .7, marginBottom: 10 }}>
          Lunes · 20 de abril, 2026
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)",
          fontSize: 42, fontWeight: 700, letterSpacing: "-.025em" }}>
          Buenas tardes, Delta.
        </h1>
        <p style={{ margin: "10px 0 24px", fontSize: 16, opacity: .85, maxWidth: 520, lineHeight: 1.5 }}>
          7 aprobaciones pendientes, 2 especialistas nuevos esta semana y +100% de crecimiento MoM.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{
            background: "#fff", color: "var(--dh-turquoise-700)", border: "none",
            padding: "12px 22px", borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
            fontFamily: "inherit",
          }}>Revisar aprobaciones →</button>
          <button style={{
            background: "rgba(255,255,255,.15)", color: "#fff",
            border: "1px solid rgba(255,255,255,.25)",
            padding: "12px 22px", borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
            fontFamily: "inherit",
          }}>Ver especialistas</button>
        </div>
      </div>
    </div>

    {/* Stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
      <StatCard label="Especialistas activos" value="124" delta="+12 este mes" icon="user" />
      <StatCard label="Consultas hoy" value="38" delta="Tiempo real" deltaColor="var(--dh-turquoise-700)" icon="calendar" />
      <StatCard label="Consultas este mes" value="1.284" delta="+18% vs. mes anterior" icon="heart" />
      <StatCard label="Ingresos MTD" value="$8.420" delta="+100% MoM" icon="clipboard" />
    </div>

    {/* Bottom grid: chart + aprobaciones */}
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
      {/* Chart */}
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Consultas · últimos 7 meses</div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-400)", marginTop: 2 }}>Crecimiento estable</div>
          </div>
          <Badge tone="success">↑ +18%</Badge>
        </div>
        {/* Simple SVG chart */}
        <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* grid lines */}
          {[40, 90, 140].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#E8ECF0" strokeDasharray="3,4"/>)}
          <path d="M 20 160 L 110 140 L 200 128 L 290 110 L 380 85 L 470 55 L 560 28 L 560 180 L 20 180 Z" fill="url(#chart-grad)"/>
          <path d="M 20 160 L 110 140 L 200 128 L 290 110 L 380 85 L 470 55 L 560 28" stroke="#06B6D4" strokeWidth="2.5" fill="none"/>
          {[[20,160],[110,140],[200,128],[290,110],[380,85],[470,55],[560,28]].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#06B6D4" strokeWidth="2"/>
          ))}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dh-gray-400)", marginTop: 10, fontFamily: "var(--dh-font-mono)" }}>
          {["Oct","Nov","Dic","Ene","Feb","Mar","Abr"].map(m => <span key={m}>{m}</span>)}
        </div>
      </div>

      {/* Aprobaciones pendientes */}
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Aprobaciones pendientes</div>
          <Badge tone="coral">7 nuevas</Badge>
        </div>
        {[
          ["María Rivas", "Psicología clínica", "MR", "var(--dh-turquoise)"],
          ["Carlos Díaz", "Cardiología", "CD", "var(--dh-coral)"],
          ["Ana Parra", "Nutrición", "AP", "var(--dh-gray-800)"],
          ["Luis Montes", "Odontología", "LM", "var(--dh-turquoise-700)"],
        ].map(([name, spec, init, color], i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 0", borderBottom: i < 3 ? "1px solid var(--dh-gray-100)" : "none",
          }}>
            <Avatar initials={init} color={color} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 11, color: "var(--dh-gray-400)" }}>{spec}</div>
            </div>
            <div style={{
              padding: "6px 10px", background: "var(--dh-turquoise-50)",
              color: "var(--dh-turquoise-700)", borderRadius: 999,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>Revisar</div>
          </div>
        ))}
      </div>
    </div>
  </AppShell>
);

/* ============================================================
   SCREEN 2 — ESPECIALISTA · Agenda del día
   ============================================================ */
const ScreenEspecialista = () => (
  <AppShell
    role="Especialista"
    user={{ initials: "MR", color: "var(--dh-turquoise)", name: "Dra. María Rivas", sub: "Psicología clínica" }}
    active="Agenda"
    notifBadge={2}
    nav={[
      { label: "Agenda",         icon: "calendar" },
      { label: "Pacientes",      icon: "user" },
      { label: "Historias",      icon: "clipboard" },
      { label: "Recetas",        icon: "pill" },
      { label: "Disponibilidad", icon: "bell" },
      { label: "Ingresos",       icon: "sparkle" },
      { label: "Configuración",  icon: "shield" },
    ]}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
          letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Lunes · 20 abril</div>
        <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)", fontSize: 36, fontWeight: 700,
          letterSpacing: "-.022em" }}>Buenos días, María.</h1>
        <div style={{ fontSize: 15, color: "var(--dh-gray-600)", marginTop: 6 }}>
          Tienes <strong style={{ color: "var(--dh-turquoise-700)" }}>5 consultas</strong> hoy · próxima en 25 min
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button style={{
          background: "var(--dh-white)", border: "1.5px solid var(--dh-gray-200)",
          padding: "12px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", color: "var(--dh-ink)",
          display: "flex", alignItems: "center", gap: 8,
        }}><Icon name="bell" size={16}/>Disponibilidad</button>
        <button style={{
          background: "var(--dh-ink)", color: "#fff", border: "none",
          padding: "12px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 8,
        }}><Icon name="plus" size={16}/>Nueva consulta</button>
      </div>
    </div>

    {/* Stats row */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
      <StatCard label="Consultas hoy" value="5" delta="2 completadas" deltaColor="var(--dh-turquoise-700)" icon="calendar" />
      <StatCard label="Pacientes activos" value="48" delta="+3 este mes" icon="user" />
      <StatCard label="Recetas emitidas" value="23" delta="Esta semana" deltaColor="var(--dh-gray-600)" icon="pill" />
      <StatCard label="Ingresos del mes" value="$1.840" delta="+22% vs. anterior" icon="sparkle" />
    </div>

    {/* Bottom: agenda + próxima */}
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
      {/* Agenda timeline */}
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Agenda de hoy</div>
          <div style={{ display: "flex", gap: 4, fontSize: 12, fontFamily: "var(--dh-font-mono)" }}>
            <span style={{ padding: "4px 10px", background: "var(--dh-ink)", color: "#fff", borderRadius: 999 }}>Día</span>
            <span style={{ padding: "4px 10px", color: "var(--dh-gray-600)" }}>Semana</span>
            <span style={{ padding: "4px 10px", color: "var(--dh-gray-600)" }}>Mes</span>
          </div>
        </div>
        {[
          { time: "09:00", name: "Andrea Soto",   type: "Seguimiento",  status: "done",    init: "AS", color: "var(--dh-gray-400)" },
          { time: "10:30", name: "Pedro Méndez",  type: "Sesión inicial", status: "done",  init: "PM", color: "var(--dh-gray-400)" },
          { time: "11:30", name: "Laura Castro",  type: "Videoconsulta", status: "next",   init: "LC", color: "var(--dh-turquoise)" },
          { time: "14:00", name: "Jorge Ramírez", type: "Seguimiento",  status: "upcoming", init: "JR", color: "var(--dh-ink)" },
          { time: "16:30", name: "Silvia Núñez",  type: "Sesión inicial", status: "upcoming", init: "SN", color: "var(--dh-coral)" },
        ].map((c, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 14, alignItems: "center",
            padding: "14px 0", borderBottom: i < 4 ? "1px solid var(--dh-gray-100)" : "none",
            opacity: c.status === "done" ? .5 : 1,
          }}>
            <div style={{ fontFamily: "var(--dh-font-mono)", fontSize: 13, color: "var(--dh-gray-600)", fontWeight: 500 }}>{c.time}</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Avatar initials={c.init} color={c.color} size={36} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, textDecoration: c.status === "done" ? "line-through" : "none" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--dh-gray-400)" }}>{c.type}</div>
              </div>
            </div>
            {c.status === "next" && <Badge tone="success">En 25 min</Badge>}
            {c.status === "upcoming" && <span style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>Pendiente</span>}
            {c.status === "done" && <span style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>✓ Completada</span>}
          </div>
        ))}
      </div>

      {/* Próxima consulta card */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{
          background: "linear-gradient(135deg, var(--dh-ink) 0%, #1a2740 100%)",
          color: "#fff", borderRadius: "var(--dh-r-lg)", padding: 24, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", right: -40, bottom: -40, opacity: .1 }}>
            <Mark size={220} primary="#fff" accent="var(--dh-coral)" />
          </div>
          <div style={{ position: "relative", zIndex: 2 }}>
            <Badge tone="coral">Próxima · 11:30</Badge>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 16, marginBottom: 18 }}>
              <Avatar initials="LC" color="var(--dh-turquoise)" size={52} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Laura Castro</div>
                <div style={{ fontSize: 13, opacity: .7 }}>32 años · Videoconsulta</div>
              </div>
            </div>
            <button style={{
              width: "100%", background: "var(--dh-turquoise)", color: "#fff", border: "none",
              padding: "14px", borderRadius: 999, fontWeight: 600, fontSize: 15, cursor: "pointer",
              fontFamily: "inherit", display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
            }}><Icon name="video" size={18}/>Iniciar consulta</button>
            <button style={{
              width: "100%", background: "transparent", color: "#fff",
              border: "1px solid rgba(255,255,255,.2)",
              padding: "12px", borderRadius: 999, fontWeight: 500, fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", marginTop: 8,
            }}>Ver historia clínica</button>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20 }}>
          <div style={{ fontSize: 13, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
            letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Accesos rápidos</div>
          {[
            { label: "Escribir receta",    icon: "pill" },
            { label: "Nueva nota clínica", icon: "clipboard" },
            { label: "Ver ingresos",       icon: "sparkle" },
          ].map(a => (
            <div key={a.label} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 0", cursor: "pointer",
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--dh-turquoise-50)",
                color: "var(--dh-turquoise-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={a.icon} size={16}/>
              </div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{a.label}</span>
              <Icon name="arrow" size={14} color="var(--dh-gray-400)" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </AppShell>
);

/* ============================================================
   SCREEN 3 — ESPECIALISTA · Historia clínica + Receta
   ============================================================ */
const ScreenHistoria = () => (
  <AppShell
    role="Especialista"
    user={{ initials: "MR", color: "var(--dh-turquoise)", name: "Dra. María Rivas", sub: "Psicología clínica" }}
    active="Historias"
    nav={[
      { label: "Agenda",         icon: "calendar" },
      { label: "Pacientes",      icon: "user" },
      { label: "Historias",      icon: "clipboard" },
      { label: "Recetas",        icon: "pill" },
      { label: "Disponibilidad", icon: "bell" },
      { label: "Ingresos",       icon: "sparkle" },
      { label: "Configuración",  icon: "shield" },
    ]}
  >
    <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
      letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>
      Pacientes › Laura Castro › Historia
    </div>

    {/* Patient header */}
    <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)",
      padding: 24, marginBottom: 16, display: "flex", gap: 20, alignItems: "center" }}>
      <Avatar initials="LC" color="var(--dh-turquoise)" size={72} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "var(--dh-font-display)", letterSpacing: "-.015em" }}>
            Laura Castro
          </h2>
          <Badge tone="turquoise">Activa</Badge>
        </div>
        <div style={{ fontSize: 13, color: "var(--dh-gray-600)", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <span>32 años</span>
          <span>V-18.456.782</span>
          <span>laura.castro@email.com</span>
          <span>+58 414 555 1234</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ background: "var(--dh-white)", border: "1.5px solid var(--dh-gray-200)",
          padding: "10px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="chat" size={14}/>Mensaje
        </button>
        <button style={{ background: "var(--dh-turquoise)", color: "#fff", border: "none",
          padding: "10px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={14}/>Nueva nota
        </button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
      {/* Nota de hoy + historial */}
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Nota clínica · 20 abril 2026</div>
        <div style={{ fontSize: 12, color: "var(--dh-gray-400)", marginBottom: 18, fontFamily: "var(--dh-font-mono)" }}>Sesión #8 · Videoconsulta</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--dh-turquoise-700)", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Motivo</div>
          <div style={{ fontSize: 14, color: "var(--dh-gray-800)", lineHeight: 1.5 }}>Seguimiento de ansiedad generalizada. Paciente reporta mejora leve desde la sesión anterior.</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--dh-turquoise-700)", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Evolución</div>
          <div style={{ fontSize: 14, color: "var(--dh-gray-800)", lineHeight: 1.5 }}>Duerme mejor (6-7h continuas). Ha retomado ejercicio 3x/sem. Persisten episodios de preocupación anticipatoria en contexto laboral.</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--dh-turquoise-700)", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Plan</div>
          <div style={{ fontSize: 14, color: "var(--dh-gray-800)", lineHeight: 1.5 }}>Continuar TCC. Tareas: registro de pensamientos automáticos. Próxima sesión en 2 semanas.</div>
        </div>

        <div style={{ borderTop: "1px solid var(--dh-gray-100)", paddingTop: 18, marginTop: 18 }}>
          <div style={{ fontSize: 13, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
            letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Sesiones anteriores</div>
          {[
            ["06 abr 2026", "Sesión #7", "Seguimiento"],
            ["23 mar 2026", "Sesión #6", "Seguimiento"],
            ["09 mar 2026", "Sesión #5", "Reajuste plan"],
          ].map(([d, s, t], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 120px 1fr auto", gap: 12,
              padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--dh-gray-100)" : "none", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>{d}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s}</span>
              <span style={{ fontSize: 13, color: "var(--dh-gray-600)" }}>{t}</span>
              <Icon name="arrow" size={14} color="var(--dh-gray-400)"/>
            </div>
          ))}
        </div>
      </div>

      {/* Receta (right column) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Nueva receta</div>
              <div style={{ fontSize: 12, color: "var(--dh-gray-400)" }}>Rx · 20 abril 2026</div>
            </div>
            <Icon name="pill" size={22} color="var(--dh-turquoise-700)"/>
          </div>

          {/* Medicamento */}
          <div style={{ background: "var(--dh-turquoise-50)", padding: 16, borderRadius: "var(--dh-r-md)", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--dh-ink)" }}>Sertralina 50mg</div>
            <div style={{ fontSize: 13, color: "var(--dh-gray-800)", marginTop: 4 }}>1 comprimido cada 24 horas, en la mañana · 30 días</div>
            <div style={{ fontSize: 11, color: "var(--dh-gray-600)", marginTop: 6, fontFamily: "var(--dh-font-mono)" }}>Tomar con alimentos. No suspender sin consulta.</div>
          </div>

          <button style={{
            width: "100%", background: "transparent", color: "var(--dh-turquoise-700)",
            border: "1.5px dashed var(--dh-gray-200)",
            padding: 14, borderRadius: "var(--dh-r-md)", fontWeight: 600, fontSize: 13, cursor: "pointer",
            fontFamily: "inherit", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 16,
          }}><Icon name="plus" size={14}/>Agregar medicamento</button>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ flex: 1, background: "var(--dh-white)", border: "1.5px solid var(--dh-gray-200)",
              padding: 12, borderRadius: 999, fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit" }}>Guardar borrador</button>
            <button style={{ flex: 1, background: "var(--dh-ink)", color: "#fff", border: "none",
              padding: 12, borderRadius: 999, fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit" }}>Firmar y enviar</button>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20 }}>
          <div style={{ fontSize: 13, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
            letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Datos clave</div>
          {[
            ["Alergias", "Ninguna conocida"],
            ["Medicación actual", "Sertralina 50mg"],
            ["Antecedentes", "Ansiedad · 2023"],
            ["Últ. consulta", "06 abr 2026"],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderBottom: i < 3 ? "1px solid var(--dh-gray-100)" : "none" }}>
              <span style={{ fontSize: 13, color: "var(--dh-gray-600)" }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </AppShell>
);

/* ============================================================
   SCREEN 4 — PACIENTE · Home + Buscar especialista
   ============================================================ */
const ScreenPaciente = () => (
  <AppShell
    role="Paciente"
    user={{ initials: "LC", color: "var(--dh-coral)", name: "Laura Castro", sub: "Miembro desde 2025" }}
    active="Inicio"
    notifBadge={1}
    nav={[
      { label: "Inicio",          icon: "heart" },
      { label: "Buscar",          icon: "sparkle" },
      { label: "Mis consultas",   icon: "calendar" },
      { label: "Recetas",         icon: "pill" },
      { label: "Mensajes",        icon: "chat", badge: 1 },
      { label: "Mi cuenta",       icon: "user" },
    ]}
  >
    {/* Hero: próxima consulta */}
    <div style={{
      background: "linear-gradient(135deg, #ECFEFF 0%, #FFFFFF 60%, #FFF1EC 100%)",
      borderRadius: "var(--dh-r-xl)", padding: "36px 40px", marginBottom: 24,
      position: "relative", overflow: "hidden",
      border: "1px solid var(--dh-gray-100)",
    }}>
      <div style={{ position: "absolute", right: -60, top: -20, opacity: .12 }}>
        <Mark size={320} />
      </div>
      <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 40, alignItems: "center" }}>
        <div>
          <Badge tone="coral">Próxima consulta · en 25 min</Badge>
          <h1 style={{ margin: "14px 0 10px", fontFamily: "var(--dh-font-display)",
            fontSize: 36, fontWeight: 700, letterSpacing: "-.022em" }}>
            Tu consulta con <span style={{ color: "var(--dh-turquoise-700)" }}>Dra. María Rivas</span> está lista.
          </h1>
          <p style={{ margin: "0 0 22px", fontSize: 15, color: "var(--dh-gray-600)", lineHeight: 1.5, maxWidth: 480 }}>
            Sesión de seguimiento · 11:30 AM · Videollamada. Te avisaremos cuando la sala esté abierta.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{
              background: "var(--dh-ink)", color: "#fff", border: "none",
              padding: "14px 24px", borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
            }}><Icon name="video" size={16}/>Unirme ahora</button>
            <button style={{
              background: "transparent", color: "var(--dh-ink)",
              border: "1.5px solid var(--dh-gray-200)",
              padding: "14px 24px", borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
              fontFamily: "inherit",
            }}>Reagendar</button>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20, boxShadow: "var(--dh-shadow-md)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
            <Avatar initials="MR" color="var(--dh-turquoise)" size={56}/>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Dra. María Rivas</div>
              <div style={{ fontSize: 13, color: "var(--dh-gray-600)" }}>Psicóloga clínica · 12 años</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ padding: 12, background: "var(--dh-gray-50)", borderRadius: "var(--dh-r-sm)" }}>
              <div style={{ fontSize: 10, color: "var(--dh-gray-400)", textTransform: "uppercase", letterSpacing: ".08em" }}>Hora</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>11:30 AM</div>
            </div>
            <div style={{ padding: 12, background: "var(--dh-gray-50)", borderRadius: "var(--dh-r-sm)" }}>
              <div style={{ fontSize: 10, color: "var(--dh-gray-400)", textTransform: "uppercase", letterSpacing: ".08em" }}>Duración</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>45 min</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Buscar especialista + Recetas recientes */}
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
      {/* Buscar */}
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Encuentra un especialista</div>
          <span style={{ fontSize: 13, color: "var(--dh-turquoise-700)", fontWeight: 600, cursor: "pointer" }}>Ver todos →</span>
        </div>

        {/* Specialty chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {[
            { label: "Psicología",  active: true },
            { label: "Cardiología" },
            { label: "Nutrición" },
            { label: "Odontología" },
            { label: "Pediatría" },
            { label: "Ginecología" },
          ].map(s => (
            <span key={s.label} style={{
              padding: "8px 14px", borderRadius: 999,
              background: s.active ? "var(--dh-ink)" : "var(--dh-gray-50)",
              color: s.active ? "#fff" : "var(--dh-gray-800)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}>{s.label}</span>
          ))}
        </div>

        {/* Specialist results */}
        {[
          ["María Rivas",   "Psicóloga clínica", "MR", "var(--dh-turquoise)", "Hoy · 3 horarios", 4.9],
          ["Andrés Soler",  "Psicólogo · Pareja", "AS", "var(--dh-coral)", "Mañana", 4.8],
          ["Carmen Vargas", "Psicóloga · Niños",  "CV", "var(--dh-ink)", "Jueves", 4.9],
        ].map(([name, spec, init, color, avail, rating], i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
            padding: "14px 0", borderBottom: i < 2 ? "1px solid var(--dh-gray-100)" : "none",
          }}>
            <Avatar initials={init} color={color} size={44}/>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginTop: 2 }}>{spec}</div>
              <div style={{ fontSize: 11, color: "var(--dh-gray-400)", marginTop: 4, fontFamily: "var(--dh-font-mono)" }}>★ {rating} · Disponible {avail}</div>
            </div>
            <Badge tone="success">{avail.split(" · ")[0]}</Badge>
            <button style={{
              background: "var(--dh-turquoise)", color: "#fff", border: "none",
              padding: "8px 16px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>Agendar</button>
          </div>
        ))}
      </div>

      {/* Recetas recientes */}
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Mis recetas</div>
          <Badge tone="turquoise">2 activas</Badge>
        </div>
        {[
          { name: "Sertralina 50mg", inst: "1 al día · mañana", by: "Dra. M. Rivas", date: "20 abr", status: "active" },
          { name: "Vitamina D3",     inst: "1 cápsula semanal", by: "Dra. A. Parra",  date: "15 abr", status: "active" },
          { name: "Ibuprofeno 600mg", inst: "Cada 8h · 3 días", by: "Dr. C. Díaz",   date: "02 mar", status: "done" },
        ].map((r, i) => (
          <div key={i} style={{
            padding: "14px 0", borderBottom: i < 2 ? "1px solid var(--dh-gray-100)" : "none",
            opacity: r.status === "done" ? .55 : 1,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
              <span style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)" }}>{r.date}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-600)" }}>{r.inst}</div>
            <div style={{ fontSize: 11, color: "var(--dh-gray-400)", marginTop: 4 }}>Recetada por {r.by}</div>
          </div>
        ))}
      </div>
    </div>
  </AppShell>
);

Object.assign(window, {
  ScreenSuperAdmin, ScreenEspecialista, ScreenHistoria, ScreenPaciente,
});
