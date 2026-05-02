/* ============================================================
   Delta Health Tech — Especialista · Pacientes
   Lista filtrable + drawer lateral con perfil completo
   ============================================================ */

const PACIENTES = [
  { id: 1, name: "Laura Castro",    age: 32, sex: "F", since: "Ene 2025", sessions: 8,  next: "Hoy · 11:30", tag: "Activo",   reason: "Terapia cognitivo-conductual · ansiedad",           init: "LC", color: "var(--dh-coral)",       plan: "Semanal",   alerts: 0, last: "18 abr" },
  { id: 2, name: "Jorge Ramírez",   age: 45, sex: "M", since: "Mar 2025", sessions: 4,  next: "Hoy · 14:00", tag: "Activo",   reason: "Proceso de duelo",                                   init: "JR", color: "var(--dh-ink)",         plan: "Quincenal", alerts: 1, last: "12 abr" },
  { id: 3, name: "Silvia Núñez",    age: 39, sex: "F", since: "Abr 2026", sessions: 0,  next: "Hoy · 16:30", tag: "Nuevo",    reason: "Primera consulta · evaluación",                      init: "SN", color: "var(--dh-turquoise-700)", plan: "Por definir", alerts: 0, last: "—" },
  { id: 4, name: "Andrea Soto",     age: 28, sex: "F", since: "Feb 2026", sessions: 3,  next: "25 abr · 09:00", tag: "Activo", reason: "Ansiedad laboral · sesión #4",                      init: "AS", color: "var(--dh-turquoise)",   plan: "Semanal",   alerts: 0, last: "20 abr" },
  { id: 5, name: "Pedro Méndez",    age: 52, sex: "M", since: "Abr 2026", sessions: 1,  next: "28 abr · 10:30", tag: "Activo", reason: "Evaluación inicial",                                init: "PM", color: "var(--dh-gray-600)",    plan: "Mensual",   alerts: 0, last: "20 abr" },
  { id: 6, name: "Valentina Peña",  age: 24, sex: "F", since: "Oct 2025", sessions: 14, next: "—",            tag: "Pausa",    reason: "Seguimiento · actualmente en pausa",                init: "VP", color: "var(--dh-gray-400)",    plan: "Pausado",   alerts: 0, last: "15 mar" },
  { id: 7, name: "Tomás Salazar",   age: 31, sex: "M", since: "Jun 2025", sessions: 11, next: "22 abr · 11:00", tag: "Activo", reason: "TCC · trastorno de pánico",                         init: "TS", color: "var(--dh-coral-600)",   plan: "Semanal",   alerts: 2, last: "15 abr" },
  { id: 8, name: "Elena Campos",    age: 36, sex: "F", since: "Jul 2025", sessions: 9,  next: "22 abr · 14:30", tag: "Activo", reason: "Terapia de pareja individual",                      init: "EC", color: "var(--dh-turquoise-700)", plan: "Quincenal", alerts: 0, last: "08 abr" },
  { id: 9, name: "Mario Delgado",   age: 41, sex: "M", since: "Sep 2025", sessions: 6,  next: "23 abr · 08:00", tag: "Activo", reason: "Manejo de estrés",                                   init: "MD", color: "var(--dh-ink)",         plan: "Quincenal", alerts: 0, last: "10 abr" },
  { id: 10,name: "Rafael Pinto",    age: 29, sex: "M", since: "Feb 2026", sessions: 2,  next: "24 abr · 15:30", tag: "Nuevo",  reason: "Evaluación depresión leve",                          init: "RP", color: "var(--dh-coral)",       plan: "Semanal",   alerts: 0, last: "17 abr" },
  { id: 11,name: "Camila Villa",    age: 27, sex: "F", since: "Ago 2024", sessions: 28, next: "21 abr · 08:30", tag: "Activo", reason: "TCC · sesión #28",                                   init: "CV", color: "var(--dh-turquoise)",   plan: "Semanal",   alerts: 0, last: "14 abr" },
  { id: 12,name: "Óscar Bermúdez",  age: 50, sex: "M", since: "Nov 2024", sessions: 18, next: "21 abr · 10:00", tag: "Activo", reason: "Seguimiento · depresión",                            init: "OB", color: "var(--dh-gray-600)",    plan: "Mensual",   alerts: 0, last: "21 mar" },
];

const TAG_TONES = {
  "Activo": { bg: "rgba(6,182,212,.12)", fg: "var(--dh-turquoise-700)" },
  "Nuevo":  { bg: "rgba(255,138,101,.14)", fg: "var(--dh-coral-600)" },
  "Pausa":  { bg: "var(--dh-gray-100)", fg: "var(--dh-gray-600)" },
};

const FILTROS = [
  { id: "todos",   label: "Todos",   count: 48 },
  { id: "activos", label: "Activos", count: 42 },
  { id: "nuevos",  label: "Nuevos",  count: 3 },
  { id: "pausa",   label: "En pausa", count: 3 },
];

const PacientesEsp = () => {
  const [selected, setSelected] = React.useState(PACIENTES[0]);
  const [filter, setFilter] = React.useState("todos");
  const [query, setQuery] = React.useState("");

  const filtered = PACIENTES.filter(p => {
    if (filter === "activos" && p.tag !== "Activo") return false;
    if (filter === "nuevos" && p.tag !== "Nuevo") return false;
    if (filter === "pausa" && p.tag !== "Pausa") return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ fontFamily: "var(--dh-font-body)" }}>
      <EspPageHeader
        eyebrow="Base de pacientes"
        title="Pacientes"
        subtitle={<><strong>48 activos</strong> · 3 nuevos este mes · 2 requieren seguimiento</>}
        actions={<>
          <button style={espBtnSecondary}><Icon name="arrow" size={14}/>Exportar</button>
          <button style={espBtnPrimary}><Icon name="plus" size={15}/>Nuevo paciente</button>
        </>}
      />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <EspMiniStat label="Pacientes activos" value="48" sub="+3 este mes" icon="user" tone="turquoise"/>
        <EspMiniStat label="Sesiones totales" value="312" sub="Histórico" icon="clipboard"/>
        <EspMiniStat label="Retención 6 meses" value="87%" sub="+4pp vs. Q1" icon="heart"/>
        <EspMiniStat label="Requieren seguimiento" value="2" sub="Ver alertas" icon="bell" tone="coral"/>
      </div>

      {/* Split: lista + drawer */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16 }}>
        {/* LISTA */}
        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" }}>
          {/* Toolbar */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--dh-gray-100)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--dh-gray-50)", borderRadius: 999, padding: "8px 16px", flex: 1, minWidth: 220 }}>
              <Icon name="user" size={14} color="var(--dh-gray-400)"/>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre..." style={{ border: "none", outline: "none", background: "transparent", flex: 1, fontSize: 13, fontFamily: "inherit" }}/>
            </div>
            {FILTROS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: "7px 14px", border: "1px solid " + (filter === f.id ? "var(--dh-ink)" : "var(--dh-gray-200)"),
                background: filter === f.id ? "var(--dh-ink)" : "#fff", color: filter === f.id ? "#fff" : "var(--dh-gray-800)",
                borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {f.label} <span style={{ fontFamily: "var(--dh-font-mono)", opacity: .7 }}>{f.count}</span>
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.3fr 80px", gap: 12,
            padding: "10px 20px", borderBottom: "1px solid var(--dh-gray-100)",
            fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
            letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>
            <div>Paciente</div>
            <div>Motivo</div>
            <div>Plan</div>
            <div>Próxima consulta</div>
            <div style={{ textAlign: "right" }}>Estado</div>
          </div>

          {/* Rows */}
          <div style={{ maxHeight: 580, overflowY: "auto" }}>
            {filtered.map(p => {
              const active = selected && selected.id === p.id;
              return (
                <div key={p.id} onClick={() => setSelected(p)} style={{
                  display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.3fr 80px", gap: 12,
                  padding: "14px 20px", borderBottom: "1px solid var(--dh-gray-100)",
                  cursor: "pointer", alignItems: "center",
                  background: active ? "var(--dh-turquoise-50)" : "#fff",
                  borderLeft: active ? "3px solid var(--dh-turquoise)" : "3px solid transparent",
                  transition: "background .12s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <Avatar initials={p.init} color={p.color} size={38}/>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--dh-ink)" }}>{p.name}</span>
                        {p.alerts > 0 && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--dh-coral)" }}/>}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>{p.age}a · {p.sex} · {p.sessions} sesiones</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--dh-gray-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.reason}</div>
                  <div style={{ fontSize: 12, color: "var(--dh-gray-800)", fontWeight: 500 }}>{p.plan}</div>
                  <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: p.next === "—" ? "var(--dh-gray-400)" : "var(--dh-ink)", fontWeight: 600 }}>{p.next}</div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      fontSize: 10, padding: "3px 10px", borderRadius: 999, fontWeight: 700,
                      background: TAG_TONES[p.tag].bg, color: TAG_TONES[p.tag].fg,
                    }}>{p.tag}</span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--dh-gray-400)", fontSize: 13 }}>
                Sin resultados para "{query}"
              </div>
            )}
          </div>
        </div>

        {/* DRAWER — perfil */}
        {selected && <PacienteDrawer p={selected}/>}
      </div>
    </div>
  );
};

const PacienteDrawer = ({ p }) => (
  <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden", alignSelf: "start", position: "sticky", top: 20 }}>
    {/* Hero */}
    <div style={{
      padding: "28px 24px 24px",
      background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 60%, var(--dh-ink)))`,
      color: "#fff", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: 999, background: "rgba(255,255,255,.08)" }}/>
      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
        <Avatar initials={p.init} color="rgba(255,255,255,.2)" size={56}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>{p.name}</div>
          <div style={{ fontSize: 12, opacity: .85, fontFamily: "var(--dh-font-mono)" }}>{p.age} años · {p.sex === "F" ? "Femenino" : "Masculino"} · Paciente desde {p.since}</div>
        </div>
        <button style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", borderRadius: 999, padding: 8, cursor: "pointer", display: "flex" }}>
          <Icon name="chat" size={16}/>
        </button>
      </div>
    </div>

    {/* Quick actions */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: 12, borderBottom: "1px solid var(--dh-gray-100)" }}>
      {[
        { icon: "video", label: "Video" },
        { icon: "clipboard", label: "Historia" },
        { icon: "pill", label: "Receta" },
        { icon: "plus", label: "Nota" },
      ].map(a => (
        <button key={a.label} style={{
          background: "var(--dh-gray-50)", border: "none", padding: "10px 6px", borderRadius: 10,
          cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          fontSize: 10, color: "var(--dh-gray-800)", fontWeight: 600,
        }}>
          <Icon name={a.icon} size={16} color="var(--dh-turquoise-700)"/>
          {a.label}
        </button>
      ))}
    </div>

    {/* Meta */}
    <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dh-gray-100)" }}>
      <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Motivo actual</div>
      <div style={{ fontSize: 14, color: "var(--dh-ink)", lineHeight: 1.5 }}>{p.reason}</div>
    </div>

    {/* Grid de datos */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: "1px solid var(--dh-gray-100)" }}>
      {[
        ["Plan", p.plan],
        ["Sesiones", p.sessions],
        ["Última visita", p.last],
        ["Próxima", p.next],
      ].map(([k, v], i) => (
        <div key={k} style={{
          padding: "14px 20px",
          borderRight: i % 2 === 0 ? "1px solid var(--dh-gray-100)" : "none",
          borderTop: i > 1 ? "1px solid var(--dh-gray-100)" : "none",
        }}>
          <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase" }}>{k}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--dh-ink)", marginTop: 4 }}>{v}</div>
        </div>
      ))}
    </div>

    {/* Timeline de sesiones */}
    <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--dh-gray-100)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase" }}>Últimas sesiones</div>
        <button style={{ ...espBtnGhost, fontSize: 11, padding: "4px 8px" }}>Ver todas</button>
      </div>
      {[
        { d: "20 abr", t: "Seguimiento TCC", ok: true },
        { d: "13 abr", t: "Revisión plan", ok: true },
        { d: "06 abr", t: "Sesión #6", ok: true },
        { d: "30 mar", t: "Seguimiento", ok: true },
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i < 3 ? "1px dashed var(--dh-gray-100)" : "none", fontSize: 12 }}>
          <span style={{ fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", minWidth: 60 }}>{s.d}</span>
          <span style={{ flex: 1, color: "var(--dh-gray-800)" }}>{s.t}</span>
          <Icon name="check" size={14} color="var(--dh-turquoise-700)"/>
        </div>
      ))}
    </div>

    {/* Notas privadas */}
    <div style={{ padding: "16px 24px" }}>
      <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Notas privadas</div>
      <div style={{ background: "var(--dh-turquoise-50)", border: "1px dashed var(--dh-turquoise-100)", borderRadius: 10, padding: 14, fontSize: 12, color: "var(--dh-gray-800)", lineHeight: 1.5, fontStyle: "italic" }}>
        Responde bien a TCC. Explorar técnicas de exposición gradual en próximas sesiones. Revisar adherencia a ejercicios entre consultas.
      </div>
    </div>
  </div>
);

Object.assign(window, { PacientesEsp });
