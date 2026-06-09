/* ============================================================
   Delta Health Tech — Super Admin Panel
   Tabs: Dashboard, Especialistas, Aprobaciones, Pacientes,
         Finanzas, Suscripciones, Configuración
   ============================================================ */

/* ---------- DATA (realistic Venezuelan) ---------- */
const ESPECIALISTAS = [
  { id: 1, name: "María Rivas",        spec: "Psicología clínica",  init: "MR", color: "var(--dh-turquoise)",    ced: "V-12.458.721", email: "m.rivas@delta.health",   status: "active",   joined: "15 ene 2026", patients: 48, rating: 4.9, income: 1840 },
  { id: 2, name: "Carlos Díaz",        spec: "Cardiología",          init: "CD", color: "var(--dh-coral)",        ced: "V-10.221.543", email: "c.diaz@delta.health",    status: "active",   joined: "03 feb 2026", patients: 72, rating: 4.8, income: 3200 },
  { id: 3, name: "Ana Parra",          spec: "Nutrición",            init: "AP", color: "var(--dh-ink)",          ced: "V-18.990.112", email: "a.parra@delta.health",   status: "active",   joined: "12 feb 2026", patients: 34, rating: 4.7, income: 1120 },
  { id: 4, name: "Luis Montes",        spec: "Odontología",          init: "LM", color: "var(--dh-turquoise-700)",ced: "V-15.664.228", email: "l.montes@delta.health",  status: "active",   joined: "28 feb 2026", patients: 56, rating: 4.9, income: 2480 },
  { id: 5, name: "Carmen Vargas",      spec: "Psicología infantil",  init: "CV", color: "var(--dh-coral)",        ced: "V-14.332.089", email: "c.vargas@delta.health",  status: "pending",  joined: "10 abr 2026", patients: 0, rating: null, income: 0 },
  { id: 6, name: "Andrés Soler",       spec: "Psicología de pareja", init: "AS", color: "var(--dh-turquoise)",    ced: "V-11.887.445", email: "a.soler@delta.health",   status: "active",   joined: "20 mar 2026", patients: 41, rating: 4.8, income: 1680 },
  { id: 7, name: "Silvia Núñez",       spec: "Ginecología",          init: "SN", color: "var(--dh-ink)",          ced: "V-13.554.776", email: "s.nunez@delta.health",   status: "suspended",joined: "05 ene 2026", patients: 23, rating: 4.2, income: 0 },
  { id: 8, name: "Pedro Méndez",       spec: "Medicina general",     init: "PM", color: "var(--dh-turquoise-700)",ced: "V-16.004.993", email: "p.mendez@delta.health",  status: "active",   joined: "18 mar 2026", patients: 89, rating: 4.6, income: 2960 },
];

const PACIENTES = [
  { id: 1, name: "Laura Castro",       ced: "V-18.456.782", age: 32, consultas: 8,  ultima: "20 abr 2026", init: "LC", color: "var(--dh-coral)" },
  { id: 2, name: "Jorge Ramírez",      ced: "V-15.223.110", age: 45, consultas: 12, ultima: "18 abr 2026", init: "JR", color: "var(--dh-ink)" },
  { id: 3, name: "Andrea Soto",        ced: "V-22.008.554", age: 28, consultas: 3,  ultima: "20 abr 2026", init: "AS", color: "var(--dh-turquoise)" },
  { id: 4, name: "Rafael Bermúdez",    ced: "V-09.887.661", age: 58, consultas: 22, ultima: "15 abr 2026", init: "RB", color: "var(--dh-turquoise-700)" },
  { id: 5, name: "Gabriela Pérez",     ced: "V-19.554.887", age: 29, consultas: 5,  ultima: "12 abr 2026", init: "GP", color: "var(--dh-coral)" },
  { id: 6, name: "Daniel Ochoa",       ced: "V-17.332.998", age: 36, consultas: 9,  ultima: "19 abr 2026", init: "DO", color: "var(--dh-ink)" },
  { id: 7, name: "Valeria Hernández",  ced: "V-21.112.445", age: 24, consultas: 2,  ultima: "08 abr 2026", init: "VH", color: "var(--dh-turquoise)" },
];

/* ============================================================
   REUSABLE
   ============================================================ */
const PageHead = ({ title, sub, actions }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
    <div>
      <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)", fontSize: 34, fontWeight: 700, letterSpacing: "-.022em" }}>{title}</h1>
      {sub && <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--dh-gray-600)" }}>{sub}</p>}
    </div>
    {actions && <div style={{ display: "flex", gap: 10 }}>{actions}</div>}
  </div>
);

const Btn = ({ children, variant = "primary", icon, onClick, size = "md" }) => {
  const v = {
    primary:   { bg: "var(--dh-ink)",        fg: "#fff",                       border: "none" },
    secondary: { bg: "#fff",                 fg: "var(--dh-ink)",              border: "1.5px solid var(--dh-gray-200)" },
    ghost:     { bg: "transparent",          fg: "var(--dh-gray-600)",         border: "none" },
    danger:    { bg: "#FEF2F2",              fg: "#B91C1C",                    border: "1.5px solid #FEE2E2" },
    turquoise: { bg: "var(--dh-turquoise)",  fg: "#fff",                       border: "none" },
  }[variant];
  const padding = size === "sm" ? "8px 14px" : "11px 18px";
  const fontSize = size === "sm" ? 12 : 13;
  return (
    <button onClick={onClick} style={{
      background: v.bg, color: v.fg, border: v.border,
      padding, borderRadius: 999, fontSize, fontWeight: 600,
      cursor: "pointer", fontFamily: "inherit",
      display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
    }}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16}/>}
      {children}
    </button>
  );
};

const StatusPill = ({ status }) => {
  const map = {
    active:    { label: "Activo",     bg: "#D1FAE5", fg: "#047857", dot: "#10B981" },
    pending:   { label: "Pendiente",  bg: "#FEF3C7", fg: "#92400E", dot: "#F59E0B" },
    suspended: { label: "Suspendido", bg: "#FEE2E2", fg: "#B91C1C", dot: "#EF4444" },
    paid:      { label: "Pagado",     bg: "#D1FAE5", fg: "#047857", dot: "#10B981" },
    processing:{ label: "Procesando", bg: "var(--dh-turquoise-50)", fg: "var(--dh-turquoise-700)", dot: "var(--dh-turquoise)" },
    failed:    { label: "Fallido",    bg: "#FEE2E2", fg: "#B91C1C", dot: "#EF4444" },
  }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 10px", borderRadius: 999,
      background: map.bg, color: map.fg, fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: map.dot }}/>
      {map.label}
    </span>
  );
};

const StatCard = ({ label, value, delta, deltaColor = "var(--dh-success, #047857)", icon, deltaIcon = "arrow" }) => (
  <div style={{
    background: "#fff", borderRadius: "var(--dh-r-lg)",
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
    <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 32, fontWeight: 700,
      letterSpacing: "-.02em", lineHeight: 1, color: "var(--dh-ink)" }}>{value}</div>
    {delta && <div style={{ fontSize: 12, color: deltaColor, marginTop: 8, fontWeight: 600 }}>{delta}</div>}
  </div>
);

const SearchBar = ({ placeholder = "Buscar..." }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    background: "#fff", border: "1.5px solid var(--dh-gray-100)",
    borderRadius: 999, padding: "10px 18px", minWidth: 320, flex: 1, maxWidth: 400,
  }}>
    <Icon name="sparkle" size={15} color="var(--dh-gray-400)"/>
    <input placeholder={placeholder} style={{
      border: "none", outline: "none", background: "transparent", flex: 1,
      fontSize: 13, fontFamily: "inherit", color: "var(--dh-ink)",
    }}/>
  </div>
);

const Filters = ({ filters }) => (
  <div style={{ display: "flex", gap: 8 }}>
    {filters.map(f => (
      <div key={f.label} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: "#fff", border: "1.5px solid var(--dh-gray-100)",
        borderRadius: 999, fontSize: 13, fontWeight: 500, color: "var(--dh-gray-800)", cursor: "pointer",
      }}>
        {f.label}
        <span style={{ color: "var(--dh-gray-400)", fontSize: 10 }}>▾</span>
      </div>
    ))}
  </div>
);

/* ============================================================
   TAB 1 — DASHBOARD
   ============================================================ */
const TabDashboard = () => (
  <>
    {/* Hero */}
    <div style={{
      background: "linear-gradient(135deg, var(--dh-turquoise-700) 0%, var(--dh-turquoise) 100%)",
      borderRadius: "var(--dh-r-xl)", padding: "36px 40px",
      color: "#fff", position: "relative", overflow: "hidden", marginBottom: 20,
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
          fontSize: 38, fontWeight: 700, letterSpacing: "-.025em" }}>
          Buenas tardes, Delta.
        </h1>
        <p style={{ margin: "10px 0 22px", fontSize: 15, opacity: .85, maxWidth: 540, lineHeight: 1.5 }}>
          7 aprobaciones pendientes, 2 especialistas nuevos esta semana y +100% de crecimiento MoM.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{
            background: "#fff", color: "var(--dh-turquoise-700)", border: "none",
            padding: "11px 20px", borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer",
            fontFamily: "inherit",
          }}>Revisar aprobaciones →</button>
          <button style={{
            background: "rgba(255,255,255,.15)", color: "#fff",
            border: "1px solid rgba(255,255,255,.25)",
            padding: "11px 20px", borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer",
            fontFamily: "inherit",
          }}>Ver especialistas</button>
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
      <StatCard label="Especialistas activos" value="124" delta="+12 este mes" icon="user" />
      <StatCard label="Consultas hoy" value="38" delta="Tiempo real" deltaColor="var(--dh-turquoise-700)" icon="calendar" />
      <StatCard label="Consultas este mes" value="1.284" delta="+18% vs. mes anterior" icon="heart" />
      <StatCard label="Ingresos MTD" value="$8.420" delta="+100% MoM" icon="sparkle" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Consultas · últimos 7 meses</div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-400)", marginTop: 2 }}>Crecimiento estable</div>
          </div>
          <Badge tone="success">↑ +18%</Badge>
        </div>
        <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[40, 90, 140].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#E8ECF0" strokeDasharray="3,4"/>)}
          <path d="M 20 160 L 110 140 L 200 128 L 290 110 L 380 85 L 470 55 L 560 28 L 560 180 L 20 180 Z" fill="url(#g1)"/>
          <path d="M 20 160 L 110 140 L 200 128 L 290 110 L 380 85 L 470 55 L 560 28" stroke="#06B6D4" strokeWidth="2.5" fill="none"/>
          {[[20,160],[110,140],[200,128],[290,110],[380,85],[470,55],[560,28]].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#06B6D4" strokeWidth="2"/>
          ))}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dh-gray-400)", marginTop: 10, fontFamily: "var(--dh-font-mono)" }}>
          {["Oct","Nov","Dic","Ene","Feb","Mar","Abr"].map(m => <span key={m}>{m}</span>)}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Aprobaciones pendientes</div>
          <Badge tone="coral">7 nuevas</Badge>
        </div>
        {ESPECIALISTAS.filter(e => e.status === "pending").concat(ESPECIALISTAS.slice(0, 3)).slice(0, 4).map((e, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 0", borderBottom: i < 3 ? "1px solid var(--dh-gray-100)" : "none",
          }}>
            <Avatar initials={e.init} color={e.color} size={34}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
              <div style={{ fontSize: 11, color: "var(--dh-gray-400)" }}>{e.spec}</div>
            </div>
            <Btn variant="secondary" size="sm">Revisar</Btn>
          </div>
        ))}
      </div>
    </div>
  </>
);

/* ============================================================
   TAB 2 — ESPECIALISTAS (table)
   ============================================================ */
const TabEspecialistas = () => (
  <>
    <PageHead
      title="Especialistas"
      sub={`${ESPECIALISTAS.length} profesionales · 124 activos en la plataforma`}
      actions={<>
        <Btn variant="secondary" icon="arrow">Exportar</Btn>
        <Btn icon="plus">Invitar especialista</Btn>
      </>}
    />

    <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
      <SearchBar placeholder="Buscar por nombre, cédula o especialidad..."/>
      <Filters filters={[
        { label: "Todas las especialidades" },
        { label: "Todos los estados" },
        { label: "Ordenar: Más recientes" },
      ]}/>
    </div>

    <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--dh-gray-50)" }}>
            {["Especialista", "Especialidad", "Cédula", "Pacientes", "Rating", "Ingresos MTD", "Estado", ""].map(h => (
              <th key={h} style={{
                padding: "14px 20px", textAlign: "left",
                fontSize: 11, fontFamily: "var(--dh-font-mono)",
                color: "var(--dh-gray-600)", textTransform: "uppercase", letterSpacing: ".08em",
                fontWeight: 500, borderBottom: "1px solid var(--dh-gray-100)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ESPECIALISTAS.map((e, i) => (
            <tr key={e.id} style={{ borderBottom: i < ESPECIALISTAS.length - 1 ? "1px solid var(--dh-gray-100)" : "none" }}>
              <td style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar initials={e.init} color={e.color} size={36}/>
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--dh-gray-400)", marginTop: 2 }}>{e.email}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: "16px 20px" }}>{e.spec}</td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>{e.ced}</td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)" }}>{e.patients}</td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)" }}>{e.rating ? `★ ${e.rating}` : <span style={{color: "var(--dh-gray-400)"}}>—</span>}</td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)", fontWeight: 600 }}>${e.income.toLocaleString("en-US")}</td>
              <td style={{ padding: "16px 20px" }}><StatusPill status={e.status}/></td>
              <td style={{ padding: "16px 20px", textAlign: "right" }}>
                <span style={{ color: "var(--dh-gray-400)", cursor: "pointer", fontSize: 18, padding: 6 }}>⋯</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--dh-gray-600)", borderTop: "1px solid var(--dh-gray-100)" }}>
        <span>Mostrando 8 de 124</span>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn variant="ghost" size="sm">← Anterior</Btn>
          <Btn variant="secondary" size="sm">1</Btn>
          <Btn variant="ghost" size="sm">2</Btn>
          <Btn variant="ghost" size="sm">3</Btn>
          <Btn variant="ghost" size="sm">Siguiente →</Btn>
        </div>
      </div>
    </div>
  </>
);

/* ============================================================
   TAB 3 — APROBACIONES
   ============================================================ */
const TabAprobaciones = () => {
  const PENDING = [
    { name: "Carmen Vargas",    spec: "Psicología infantil", ced: "V-14.332.089", init: "CV", color: "var(--dh-coral)",     submitted: "10 abr 2026", docs: 4, flags: [] },
    { name: "Roberto Linares",  spec: "Traumatología",       ced: "V-13.887.662", init: "RL", color: "var(--dh-turquoise)", submitted: "12 abr 2026", docs: 4, flags: [] },
    { name: "Isabel Mendoza",   spec: "Dermatología",        ced: "V-16.554.110", init: "IM", color: "var(--dh-ink)",       submitted: "14 abr 2026", docs: 3, flags: ["Falta RIF"] },
    { name: "Javier Contreras", spec: "Urología",            ced: "V-11.992.447", init: "JC", color: "var(--dh-turquoise-700)", submitted: "16 abr 2026", docs: 4, flags: [] },
    { name: "Natalia Quintero", spec: "Pediatría",           ced: "V-19.443.009", init: "NQ", color: "var(--dh-coral)",     submitted: "18 abr 2026", docs: 4, flags: [] },
    { name: "Eduardo Salas",    spec: "Psiquiatría",         ced: "V-12.776.558", init: "ES", color: "var(--dh-ink)",       submitted: "19 abr 2026", docs: 2, flags: ["Cédula ilegible", "Falta título"] },
    { name: "Patricia Rosas",   spec: "Oftalmología",        ced: "V-15.887.221", init: "PR", color: "var(--dh-turquoise)", submitted: "19 abr 2026", docs: 4, flags: [] },
  ];
  return (
    <>
      <PageHead
        title="Aprobaciones"
        sub="Solicitudes pendientes de nuevos especialistas"
        actions={<>
          <Btn variant="secondary">Historial</Btn>
          <Btn variant="secondary" icon="check">Aprobar en lote</Btn>
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="Pendientes" value="7" delta="Por revisar" deltaColor="var(--dh-coral-600)" icon="clipboard" />
        <StatCard label="Aprobadas · abril" value="14" delta="+2 vs. marzo" icon="check" />
        <StatCard label="Rechazadas · abril" value="2" delta="Docs. incompletos" deltaColor="var(--dh-gray-600)" icon="shield" />
        <StatCard label="Tiempo promedio" value="1.4d" delta="Desde envío a decisión" deltaColor="var(--dh-gray-600)" icon="sparkle" />
      </div>

      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Cola de aprobación</div>
          <Filters filters={[{ label: "Todas las especialidades" }, { label: "Más antiguas primero" }]}/>
        </div>
        {PENDING.map((p, i) => (
          <div key={i} style={{
            padding: "18px 24px", display: "grid",
            gridTemplateColumns: "auto 1fr auto auto auto",
            gap: 20, alignItems: "center",
            borderBottom: i < PENDING.length - 1 ? "1px solid var(--dh-gray-100)" : "none",
          }}>
            <Avatar initials={p.init} color={p.color} size={44}/>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                {p.flags.length > 0 && (
                  <span style={{ fontSize: 11, color: "#B91C1C", background: "#FEF2F2", padding: "3px 8px", borderRadius: 999, fontWeight: 500 }}>
                    ⚠ {p.flags.join(", ")}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginTop: 3 }}>{p.spec} · {p.ced}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontFamily: "var(--dh-font-display)", fontWeight: 700, color: p.docs < 4 ? "var(--dh-coral-600)" : "var(--dh-ink)" }}>{p.docs}/4</div>
              <div style={{ fontSize: 10, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em", textTransform: "uppercase" }}>Docs</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "var(--dh-gray-600)", fontFamily: "var(--dh-font-mono)" }}>{p.submitted}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="danger" size="sm">Rechazar</Btn>
              <Btn variant="secondary" size="sm">Ver docs</Btn>
              <Btn variant="turquoise" size="sm" icon="check">Aprobar</Btn>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

/* ============================================================
   TAB 4 — PACIENTES
   ============================================================ */
const TabPacientes = () => (
  <>
    <PageHead
      title="Pacientes"
      sub="3.420 pacientes registrados · 1.284 activos este mes"
      actions={<>
        <Btn variant="secondary" icon="arrow">Exportar CSV</Btn>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
      <StatCard label="Pacientes totales" value="3.420" delta="+284 este mes" icon="user" />
      <StatCard label="Activos · abril" value="1.284" delta="37% del total" deltaColor="var(--dh-turquoise-700)" icon="heart" />
      <StatCard label="Edad promedio" value="34" delta="Años" deltaColor="var(--dh-gray-600)" icon="sparkle" />
      <StatCard label="Retención 90d" value="68%" delta="+4pp vs. Q1" icon="clipboard" />
    </div>

    <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
      <SearchBar placeholder="Buscar por nombre, cédula o email..."/>
      <Filters filters={[
        { label: "Todos los estados" },
        { label: "Rango de edad" },
        { label: "Ordenar: Más recientes" },
      ]}/>
    </div>

    <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--dh-gray-50)" }}>
            {["Paciente", "Cédula", "Edad", "Consultas", "Última consulta", ""].map(h => (
              <th key={h} style={{
                padding: "14px 20px", textAlign: "left",
                fontSize: 11, fontFamily: "var(--dh-font-mono)",
                color: "var(--dh-gray-600)", textTransform: "uppercase", letterSpacing: ".08em",
                fontWeight: 500, borderBottom: "1px solid var(--dh-gray-100)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PACIENTES.map((p, i) => (
            <tr key={p.id} style={{ borderBottom: i < PACIENTES.length - 1 ? "1px solid var(--dh-gray-100)" : "none" }}>
              <td style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar initials={p.init} color={p.color} size={36}/>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                </div>
              </td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>{p.ced}</td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)" }}>{p.age}</td>
              <td style={{ padding: "16px 20px" }}>
                <span style={{ background: "var(--dh-turquoise-50)", color: "var(--dh-turquoise-700)", padding: "4px 10px", borderRadius: 999, fontFamily: "var(--dh-font-mono)", fontSize: 12, fontWeight: 600 }}>{p.consultas}</span>
              </td>
              <td style={{ padding: "16px 20px", fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>{p.ultima}</td>
              <td style={{ padding: "16px 20px", textAlign: "right" }}>
                <span style={{ color: "var(--dh-gray-400)", cursor: "pointer", fontSize: 18 }}>⋯</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--dh-gray-600)", borderTop: "1px solid var(--dh-gray-100)" }}>
        <span>Mostrando 7 de 3.420</span>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn variant="secondary" size="sm">1</Btn>
          <Btn variant="ghost" size="sm">2</Btn>
          <Btn variant="ghost" size="sm">3</Btn>
          <Btn variant="ghost" size="sm">...</Btn>
          <Btn variant="ghost" size="sm">489</Btn>
        </div>
      </div>
    </div>
  </>
);

/* ============================================================
   TAB 5 — FINANZAS
   ============================================================ */
const TabFinanzas = () => {
  const TRANSACCIONES = [
    { id: "TXN-1284", date: "20 abr 2026", esp: "Dra. M. Rivas",   amt: 45, fee: 6.75, net: 38.25, status: "paid" },
    { id: "TXN-1283", date: "20 abr 2026", esp: "Dr. C. Díaz",     amt: 80, fee: 12,   net: 68,    status: "paid" },
    { id: "TXN-1282", date: "19 abr 2026", esp: "Dra. A. Parra",   amt: 35, fee: 5.25, net: 29.75, status: "processing" },
    { id: "TXN-1281", date: "19 abr 2026", esp: "Dr. L. Montes",   amt: 50, fee: 7.50, net: 42.50, status: "paid" },
    { id: "TXN-1280", date: "18 abr 2026", esp: "Dr. P. Méndez",   amt: 40, fee: 6,    net: 34,    status: "paid" },
    { id: "TXN-1279", date: "18 abr 2026", esp: "Dr. A. Soler",    amt: 45, fee: 6.75, net: 38.25, status: "failed" },
  ];
  return (
    <>
      <PageHead
        title="Finanzas"
        sub="Ingresos, comisiones y transferencias a especialistas"
        actions={<>
          <Btn variant="secondary">Abril 2026 ▾</Btn>
          <Btn variant="secondary" icon="arrow">Exportar</Btn>
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="Ingresos MTD" value="$8.420" delta="+100% MoM" icon="sparkle" />
        <StatCard label="Comisión Delta" value="$1.263" delta="15% promedio" deltaColor="var(--dh-turquoise-700)" icon="shield" />
        <StatCard label="Payouts pendientes" value="$2.480" delta="Próximo: 25 abr" deltaColor="var(--dh-coral-600)" icon="clipboard" />
        <StatCard label="Transacciones" value="187" delta="+24 esta semana" icon="check" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 20 }}>
        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Ingresos mensuales</div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-400)", marginTop: 2 }}>Últimos 6 meses</div>
          </div>
          <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none">
            {[40, 90, 140].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#E8ECF0" strokeDasharray="3,4"/>)}
            {[120, 80, 60, 40, 150, 100].map((h, i) => (
              <g key={i}>
                <rect x={40 + i * 90} y={180 - h} width="50" height={h} rx="6" fill={i === 5 ? "#06B6D4" : "#CFFAFE"}/>
                {i === 5 && <rect x={40 + i * 90} y={180 - h} width="50" height="6" rx="3" fill="#FF8A65"/>}
              </g>
            ))}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: 11, color: "var(--dh-gray-400)", marginTop: 10, fontFamily: "var(--dh-font-mono)" }}>
            {["Nov","Dic","Ene","Feb","Mar","Abr"].map(m => <span key={m}>{m}</span>)}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Distribución por especialidad</div>
          <div style={{ fontSize: 12, color: "var(--dh-gray-400)", marginBottom: 18 }}>Este mes</div>
          {[
            ["Psicología", 3200, 38, "var(--dh-turquoise)"],
            ["Cardiología", 2100, 25, "var(--dh-coral)"],
            ["Medicina general", 1480, 18, "var(--dh-ink)"],
            ["Odontología", 960, 11, "var(--dh-turquoise-700)"],
            ["Otros", 680, 8, "var(--dh-gray-400)"],
          ].map(([name, amt, pct, color], i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{name}</span>
                <span style={{ fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>${amt} · {pct}%</span>
              </div>
              <div style={{ height: 6, background: "var(--dh-gray-50)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${pct * 2.5}%`, height: "100%", background: color, borderRadius: 999 }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Transacciones recientes</div>
          <Btn variant="ghost" size="sm">Ver todas →</Btn>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--dh-gray-50)" }}>
              {["ID", "Fecha", "Especialista", "Monto", "Comisión", "Neto", "Estado"].map(h => (
                <th key={h} style={{
                  padding: "12px 20px", textAlign: "left",
                  fontSize: 10, fontFamily: "var(--dh-font-mono)",
                  color: "var(--dh-gray-600)", textTransform: "uppercase", letterSpacing: ".08em",
                  fontWeight: 500,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRANSACCIONES.map((t, i) => (
              <tr key={t.id} style={{ borderTop: "1px solid var(--dh-gray-100)" }}>
                <td style={{ padding: "14px 20px", fontFamily: "var(--dh-font-mono)", color: "var(--dh-turquoise-700)", fontWeight: 600 }}>{t.id}</td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>{t.date}</td>
                <td style={{ padding: "14px 20px", fontWeight: 500 }}>{t.esp}</td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--dh-font-mono)" }}>${t.amt.toFixed(2)}</td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>-${t.fee.toFixed(2)}</td>
                <td style={{ padding: "14px 20px", fontFamily: "var(--dh-font-mono)", fontWeight: 600 }}>${t.net.toFixed(2)}</td>
                <td style={{ padding: "14px 20px" }}><StatusPill status={t.status}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/* ============================================================
   TAB 6 — SUSCRIPCIONES
   ============================================================ */
const TabSuscripciones = () => {
  const PLANES = [
    { name: "Essential",   price: 25, period: "mes",   features: ["50 consultas/mes", "Historia clínica básica", "Soporte por email"], subs: 48, active: true },
    { name: "Professional",price: 65, period: "mes",   features: ["Consultas ilimitadas", "Historia clínica completa", "Recetas digitales", "Soporte prioritario"], subs: 62, highlight: true, active: true },
    { name: "Clinic",      price: 180, period: "mes",  features: ["Todo lo anterior", "Hasta 10 especialistas", "Branding personalizado", "API access", "Gestor de cuenta"], subs: 14, active: true },
  ];
  return (
    <>
      <PageHead
        title="Suscripciones"
        sub="Planes de la plataforma y estado de suscriptores"
        actions={<Btn icon="plus">Nuevo plan</Btn>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Suscriptores activos" value="124" delta="+12 este mes" icon="user" />
        <StatCard label="MRR" value="$7.840" delta="Recurrente mensual" deltaColor="var(--dh-turquoise-700)" icon="sparkle" />
        <StatCard label="Churn · abril" value="2.4%" delta="-0.6pp vs. marzo" icon="heart" />
        <StatCard label="En trial" value="8" delta="3 vencen esta semana" deltaColor="var(--dh-coral-600)" icon="clipboard" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {PLANES.map(p => (
          <div key={p.name} style={{
            background: p.highlight ? "var(--dh-ink)" : "#fff",
            color: p.highlight ? "#fff" : "var(--dh-ink)",
            borderRadius: "var(--dh-r-xl)",
            border: p.highlight ? "none" : "1px solid var(--dh-gray-100)",
            padding: 28, position: "relative", overflow: "hidden",
          }}>
            {p.highlight && (
              <div style={{ position: "absolute", top: 20, right: 20, background: "var(--dh-coral)", color: "#fff", padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>
                Más popular
              </div>
            )}
            <div style={{ fontSize: 13, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em", textTransform: "uppercase", opacity: p.highlight ? .7 : .6, marginBottom: 10 }}>{p.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--dh-font-display)", fontSize: 42, fontWeight: 700, letterSpacing: "-.025em" }}>${p.price}</span>
              <span style={{ fontSize: 14, opacity: .6 }}>/{p.period}</span>
            </div>
            <div style={{ fontSize: 12, opacity: .6, marginBottom: 20, fontFamily: "var(--dh-font-mono)" }}>{p.subs} suscriptores activos</div>
            <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none" }}>
              {p.features.map(f => (
                <li key={f} style={{ fontSize: 13, padding: "6px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: p.highlight ? "var(--dh-turquoise)" : "var(--dh-turquoise-700)", fontWeight: 700, marginTop: 1 }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button style={{
              width: "100%", background: p.highlight ? "var(--dh-turquoise)" : "var(--dh-ink)",
              color: "#fff", border: "none", padding: 12, borderRadius: 999,
              fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>Editar plan</button>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Próximas renovaciones</div>
        {[
          ["Dra. M. Rivas", "Professional", "25 abr 2026", "$65",  "active"],
          ["Dr. C. Díaz",   "Clinic",       "28 abr 2026", "$180", "active"],
          ["Dra. A. Parra", "Essential",    "01 may 2026", "$25",  "active"],
          ["Dr. L. Montes", "Professional", "03 may 2026", "$65",  "processing"],
        ].map(([name, plan, date, amt, status], i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto auto",
            gap: 16, alignItems: "center", padding: "12px 0",
            borderBottom: i < 3 ? "1px solid var(--dh-gray-100)" : "none",
          }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
            <Badge tone={plan === "Clinic" ? "coral" : plan === "Professional" ? "turquoise" : "gray"}>{plan}</Badge>
            <div style={{ fontSize: 12, color: "var(--dh-gray-600)", fontFamily: "var(--dh-font-mono)" }}>{date}</div>
            <div style={{ fontFamily: "var(--dh-font-display)", fontWeight: 700, fontSize: 15 }}>{amt}</div>
            <StatusPill status={status}/>
          </div>
        ))}
      </div>
    </>
  );
};

/* ============================================================
   TAB 7 — CONFIGURACIÓN
   ============================================================ */
const TabConfiguracion = () => (
  <>
    <PageHead title="Configuración" sub="Preferencias de la plataforma"/>

    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}>
      <aside>
        {[
          ["General",      true],
          ["Branding",     false],
          ["Comisiones",   false],
          ["Integraciones",false],
          ["Notificaciones",false],
          ["Seguridad",    false],
          ["Equipo admin", false],
          ["API Keys",     false],
        ].map(([label, active]) => (
          <div key={label} style={{
            padding: "11px 14px", borderRadius: "var(--dh-r-md)", cursor: "pointer",
            background: active ? "var(--dh-turquoise-50)" : "transparent",
            color: active ? "var(--dh-turquoise-700)" : "var(--dh-gray-600)",
            fontWeight: active ? 600 : 500, fontSize: 14, marginBottom: 2,
          }}>{label}</div>
        ))}
      </aside>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Información general</div>
          <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginBottom: 20 }}>Datos públicos de la plataforma</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              ["Nombre comercial", "Delta Health Tech"],
              ["País de operación", "Venezuela"],
              ["Zona horaria", "America/Caracas (UTC-4)"],
              ["Idioma principal", "Español"],
              ["Moneda de cobro", "USD"],
              ["RIF", "J-50123456-7"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: "var(--dh-gray-600)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>{k}</div>
                <div style={{ padding: "11px 14px", background: "var(--dh-gray-50)", border: "1.5px solid var(--dh-gray-100)", borderRadius: "var(--dh-r-md)", fontSize: 14, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Comisiones y pagos</div>
          <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginBottom: 20 }}>Porcentaje que retiene Delta por cada consulta</div>
          {[
            ["Comisión estándar",     "15%",     "Todos los especialistas por defecto"],
            ["Comisión Clinic",       "10%",     "Especialistas con plan Clinic"],
            ["Frecuencia de payouts", "Semanal", "Viernes · transferencia bancaria"],
            ["Mínimo para payout",    "$50",     "Saldo mínimo acumulado"],
          ].map(([k, v, hint], i) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 20, alignItems: "center", padding: "14px 0", borderBottom: i < 3 ? "1px solid var(--dh-gray-100)" : "none" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{k}</div>
                <div style={{ fontSize: 12, color: "var(--dh-gray-400)", marginTop: 2 }}>{hint}</div>
              </div>
              <div style={{ fontFamily: "var(--dh-font-mono)", fontSize: 16, fontWeight: 700, color: "var(--dh-turquoise-700)" }}>{v}</div>
              <Btn variant="ghost" size="sm">Editar</Btn>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Equipo administrativo</div>
          <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginBottom: 20 }}>Usuarios con acceso a este panel</div>
          {[
            { name: "Delta Admin",     email: "admin@delta.health",     role: "Owner",     init: "DA", color: "var(--dh-ink)" },
            { name: "Roberto Salas",   email: "r.salas@delta.health",   role: "Admin",     init: "RS", color: "var(--dh-turquoise)" },
            { name: "Carolina López",  email: "c.lopez@delta.health",   role: "Finanzas",  init: "CL", color: "var(--dh-coral)" },
          ].map((u, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: i < 2 ? "1px solid var(--dh-gray-100)" : "none" }}>
              <Avatar initials={u.init} color={u.color} size={36}/>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: "var(--dh-gray-400)" }}>{u.email}</div>
              </div>
              <Badge tone={u.role === "Owner" ? "coral" : "turquoise"}>{u.role}</Badge>
              <Btn variant="ghost" size="sm">Editar</Btn>
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <Btn variant="secondary" icon="plus">Invitar usuario</Btn>
          </div>
        </div>
      </div>
    </div>
  </>
);

Object.assign(window, {
  TabDashboard, TabEspecialistas, TabAprobaciones,
  TabPacientes, TabFinanzas, TabSuscripciones, TabConfiguracion,
});
