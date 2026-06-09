/* ============================================================
   Delta Health Tech — Especialista · Agenda del día
   Pantalla principal del especialista. Vista detallada.
   ============================================================ */

const AGENDA_HOY = [
  { time: "09:00", end: "09:45", name: "Andrea Soto",    age: 28, type: "Seguimiento",      mode: "Video",      status: "done",     init: "AS", color: "var(--dh-gray-400)", reason: "Ansiedad laboral · sesión #3" },
  { time: "10:30", end: "11:15", name: "Pedro Méndez",   age: 52, type: "Sesión inicial",    mode: "Video",      status: "done",     init: "PM", color: "var(--dh-gray-400)", reason: "Evaluación inicial" },
  { time: "11:30", end: "12:15", name: "Laura Castro",   age: 32, type: "Seguimiento",       mode: "Video",      status: "next",     init: "LC", color: "var(--dh-coral)",    reason: "TCC · sesión #8" },
  { time: "14:00", end: "14:45", name: "Jorge Ramírez",  age: 45, type: "Seguimiento",       mode: "Presencial", status: "upcoming", init: "JR", color: "var(--dh-ink)",      reason: "Duelo · sesión #4" },
  { time: "16:30", end: "17:15", name: "Silvia Núñez",   age: 39, type: "Sesión inicial",    mode: "Video",      status: "upcoming", init: "SN", color: "var(--dh-turquoise-700)", reason: "Primera consulta" },
];

const AgendaEspecialistaV2 = () => {
  const next = AGENDA_HOY.find(c => c.status === "next");
  const done = AGENDA_HOY.filter(c => c.status === "done").length;
  const upcoming = AGENDA_HOY.filter(c => c.status === "upcoming").length;

  return (
    <div style={{ fontFamily: "var(--dh-font-body)" }}>
      {/* Header — saludo + acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
            letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
            Lunes · 20 de abril, 2026
          </div>
          <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)", fontSize: 36, fontWeight: 700, letterSpacing: "-.022em" }}>
            Buenos días, <span style={{ color: "var(--dh-turquoise-700)" }}>María</span>.
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--dh-gray-600)" }}>
            Tienes <strong>{AGENDA_HOY.length} consultas</strong> hoy · {done} completadas · próxima en <strong style={{ color: "var(--dh-coral-600)" }}>25 min</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary}>
            <Icon name="calendar" size={15}/> Abril 2026 ▾
          </button>
          <button style={btnPrimary}>
            <Icon name="plus" size={15}/> Nueva consulta
          </button>
        </div>
      </div>

      {/* Stats row — 4 KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <MiniStat label="Hoy" value={AGENDA_HOY.length} sub={`${done} completadas · ${upcoming} pendientes`} icon="calendar" tone="turquoise"/>
        <MiniStat label="Esta semana" value="18" sub="+3 vs. semana pasada" icon="clipboard"/>
        <MiniStat label="Pacientes activos" value="48" sub="+3 este mes" icon="user"/>
        <MiniStat label="Ingresos abril" value="$1.840" sub="+22% MoM" icon="sparkle"/>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        {/* LEFT — Timeline del día */}
        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" }}>
          {/* Tab switcher */}
          <div style={{ padding: "18px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--dh-gray-100)" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Agenda del día</div>
            <div style={{ display: "flex", gap: 2, fontSize: 12, padding: "4px", background: "var(--dh-gray-50)", borderRadius: 999, marginBottom: 14 }}>
              {["Día", "Semana", "Mes"].map((v, i) => (
                <span key={v} style={{
                  padding: "6px 14px", borderRadius: 999,
                  background: i === 0 ? "var(--dh-ink)" : "transparent",
                  color: i === 0 ? "#fff" : "var(--dh-gray-600)",
                  fontWeight: 600, cursor: "pointer",
                }}>{v}</span>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ padding: "6px 24px 20px" }}>
            {AGENDA_HOY.map((c, i) => (
              <TimelineItem key={i} c={c} last={i === AGENDA_HOY.length - 1}/>
            ))}

            {/* Empty slot suggestion */}
            <div style={{
              marginTop: 10, padding: "16px 18px",
              border: "1.5px dashed var(--dh-gray-100)",
              borderRadius: "var(--dh-r-md)",
              display: "flex", alignItems: "center", gap: 12,
              color: "var(--dh-gray-600)", fontSize: 13,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: "var(--dh-gray-50)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dh-gray-400)" }}>
                <Icon name="plus" size={16}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "var(--dh-gray-800)" }}>Slot libre: 18:00 - 19:00</div>
                <div style={{ fontSize: 11, color: "var(--dh-gray-400)", marginTop: 2 }}>Tu disponibilidad termina a las 19:00</div>
              </div>
              <span style={{ fontSize: 12, color: "var(--dh-turquoise-700)", fontWeight: 600, cursor: "pointer" }}>Bloquear</span>
            </div>
          </div>
        </div>

        {/* RIGHT — Próxima consulta + accesos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Next consultation hero */}
          <div style={{
            background: "linear-gradient(135deg, var(--dh-ink) 0%, #15233b 100%)",
            color: "#fff", borderRadius: "var(--dh-r-lg)",
            padding: 24, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: -40, bottom: -40, opacity: .1 }}>
              <Mark size={220} primary="#fff" accent="var(--dh-coral)"/>
            </div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{
                  background: "var(--dh-coral)", color: "#fff",
                  fontSize: 10, fontWeight: 700, padding: "4px 10px",
                  borderRadius: 999, letterSpacing: ".08em", textTransform: "uppercase",
                }}>Próxima · en 25 min</span>
                <span style={{ fontSize: 13, opacity: .7, fontFamily: "var(--dh-font-mono)" }}>11:30 - 12:15</span>
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <Avatar initials={next.init} color={next.color} size={52}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{next.name}</div>
                  <div style={{ fontSize: 13, opacity: .7 }}>{next.age} años · {next.reason}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                <ChipDark icon="video">{next.mode}</ChipDark>
                <ChipDark icon="heart">{next.type}</ChipDark>
                <ChipDark icon="clipboard">Historia completa</ChipDark>
              </div>

              <button style={{
                width: "100%", background: "var(--dh-turquoise)", color: "#fff", border: "none",
                padding: "14px", borderRadius: 999, fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "inherit", display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
                boxShadow: "0 4px 20px -4px rgba(6,182,212,.5)",
              }}><Icon name="video" size={18}/>Iniciar videoconsulta</button>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button style={{
                  flex: 1, background: "transparent", color: "#fff",
                  border: "1px solid rgba(255,255,255,.2)",
                  padding: "10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit",
                }}>Ver historia</button>
                <button style={{
                  flex: 1, background: "transparent", color: "#fff",
                  border: "1px solid rgba(255,255,255,.2)",
                  padding: "10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit",
                }}>Reagendar</button>
              </div>
            </div>
          </div>

          {/* Accesos rápidos */}
          <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
              letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Accesos rápidos</div>
            {[
              { label: "Escribir receta", sub: "Nueva Rx", icon: "pill", color: "var(--dh-turquoise)" },
              { label: "Nota clínica", sub: "Registro rápido", icon: "clipboard", color: "var(--dh-coral)" },
              { label: "Abrir chat", sub: "2 mensajes sin leer", icon: "chat", color: "var(--dh-ink)" },
            ].map(a => (
              <div key={a.label} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 0", cursor: "pointer", borderBottom: "1px solid var(--dh-gray-100)",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--dh-turquoise-50)",
                  color: a.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={a.icon} size={16}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: "var(--dh-gray-400)" }}>{a.sub}</div>
                </div>
                <Icon name="arrow" size={14} color="var(--dh-gray-400)"/>
              </div>
            ))}
          </div>

          {/* Próximo día preview */}
          <div style={{ background: "var(--dh-turquoise-50)", borderRadius: "var(--dh-r-lg)", padding: 20, border: "1px solid var(--dh-turquoise-100)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-turquoise-700)",
                letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>Mañana · 21 abr</div>
              <Icon name="arrow" size={14} color="var(--dh-turquoise-700)"/>
            </div>
            <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>
              6 consultas
            </div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginTop: 4 }}>
              Primera: 08:30 AM · Última: 17:00 PM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Helpers ---------- */
const btnPrimary = {
  background: "var(--dh-ink)", color: "#fff", border: "none",
  padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 7,
};
const btnSecondary = {
  background: "#fff", color: "var(--dh-ink)", border: "1.5px solid var(--dh-gray-200)",
  padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 7,
};

const MiniStat = ({ label, value, sub, icon, tone }) => (
  <div style={{
    background: tone === "turquoise" ? "var(--dh-turquoise-50)" : "#fff",
    border: tone === "turquoise" ? "1px solid var(--dh-turquoise-100)" : "1px solid var(--dh-gray-100)",
    borderRadius: "var(--dh-r-lg)", padding: 20,
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em",
        color: tone === "turquoise" ? "var(--dh-turquoise-700)" : "var(--dh-gray-400)", textTransform: "uppercase", fontWeight: 500 }}>{label}</span>
      <Icon name={icon} size={15} color={tone === "turquoise" ? "var(--dh-turquoise-700)" : "var(--dh-gray-400)"}/>
    </div>
    <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 30, fontWeight: 700,
      letterSpacing: "-.02em", lineHeight: 1, color: "var(--dh-ink)" }}>{value}</div>
    <div style={{ fontSize: 11, color: "var(--dh-gray-600)", marginTop: 6 }}>{sub}</div>
  </div>
);

const TimelineItem = ({ c, last }) => {
  const isNext = c.status === "next";
  const isDone = c.status === "done";
  const modeIcon = c.mode === "Video" ? "video" : "heart";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "64px 1fr",
      gap: 14, position: "relative", padding: "14px 0",
      borderBottom: last ? "none" : "1px solid var(--dh-gray-100)",
      opacity: isDone ? .5 : 1,
    }}>
      {/* Time column */}
      <div style={{ paddingTop: 4 }}>
        <div style={{ fontFamily: "var(--dh-font-mono)", fontSize: 14, fontWeight: 600, color: isNext ? "var(--dh-coral-600)" : "var(--dh-ink)" }}>{c.time}</div>
        <div style={{ fontFamily: "var(--dh-font-mono)", fontSize: 10, color: "var(--dh-gray-400)", marginTop: 2 }}>{c.end}</div>
      </div>

      {/* Card */}
      <div style={{
        padding: "14px 16px",
        background: isNext ? "var(--dh-turquoise-50)" : "var(--dh-gray-50)",
        border: isNext ? "1.5px solid var(--dh-turquoise)" : "1px solid var(--dh-gray-100)",
        borderRadius: "var(--dh-r-md)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <Avatar initials={c.init} color={c.color} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, textDecoration: isDone ? "line-through" : "none" }}>{c.name}</span>
            <span style={{ fontSize: 11, color: "var(--dh-gray-400)" }}>· {c.age}a</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--dh-gray-600)" }}>{c.reason}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 999,
              background: c.mode === "Video" ? "rgba(6,182,212,.12)" : "rgba(255,138,101,.12)",
              color: c.mode === "Video" ? "var(--dh-turquoise-700)" : "var(--dh-coral-600)",
              fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4,
            }}><Icon name={modeIcon} size={10}/>{c.mode}</span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999,
              background: "var(--dh-gray-100)", color: "var(--dh-gray-800)", fontWeight: 600 }}>{c.type}</span>
          </div>
        </div>
        {isNext && (
          <button style={{
            background: "var(--dh-turquoise)", color: "#fff", border: "none",
            padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}><Icon name="video" size={13}/>Iniciar</button>
        )}
        {c.status === "upcoming" && (
          <span style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>Pendiente</span>
        )}
        {isDone && (
          <span style={{
            fontSize: 11, padding: "4px 10px", background: "#D1FAE5", color: "#047857",
            borderRadius: 999, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5,
          }}><Icon name="check" size={11}/>Completada</span>
        )}
      </div>
    </div>
  );
};

const ChipDark = ({ children, icon }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)",
    padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
  }}>
    {icon && <Icon name={icon} size={11}/>}
    {children}
  </span>
);

/* ============================================================
   VISTA SEMANA
   ============================================================ */
const SEMANA = [
  { day: "Lun", date: 20, today: true,
    slots: [
      { time: "09:00", name: "A. Soto", color: "var(--dh-gray-400)", status: "done" },
      { time: "10:30", name: "P. Méndez", color: "var(--dh-gray-400)", status: "done" },
      { time: "11:30", name: "L. Castro", color: "var(--dh-coral)", status: "next" },
      { time: "14:00", name: "J. Ramírez", color: "var(--dh-ink)" },
      { time: "16:30", name: "S. Núñez", color: "var(--dh-turquoise-700)" },
    ]},
  { day: "Mar", date: 21,
    slots: [
      { time: "08:30", name: "C. Villa", color: "var(--dh-turquoise)" },
      { time: "10:00", name: "R. Bermúdez", color: "var(--dh-ink)" },
      { time: "11:30", name: "G. Pérez", color: "var(--dh-coral)" },
      { time: "15:00", name: "D. Ochoa", color: "var(--dh-turquoise-700)" },
      { time: "17:00", name: "V. Hernández", color: "var(--dh-turquoise)" },
      { time: "—", blocked: true },
    ]},
  { day: "Mié", date: 22, slots: [
      { time: "09:00", name: "L. Castro", color: "var(--dh-coral)" },
      { time: "11:00", name: "T. Salazar", color: "var(--dh-ink)" },
      { time: "14:30", name: "E. Campos", color: "var(--dh-turquoise)" },
    ]},
  { day: "Jue", date: 23, slots: [
      { time: "08:00", name: "M. Delgado", color: "var(--dh-turquoise-700)" },
      { time: "09:30", name: "P. Méndez", color: "var(--dh-gray-400)" },
      { time: "11:00", name: "A. Soto", color: "var(--dh-coral)" },
      { time: "15:30", name: "J. Ramírez", color: "var(--dh-ink)" },
    ]},
  { day: "Vie", date: 24, slots: [
      { time: "—", blocked: true, label: "Bloqueo" },
      { time: "14:00", name: "N. Aranguren", color: "var(--dh-turquoise)" },
      { time: "15:30", name: "R. Pinto", color: "var(--dh-coral)" },
    ]},
  { day: "Sáb", date: 25, slots: [
      { time: "10:00", name: "F. Briceño", color: "var(--dh-turquoise-700)" },
      { time: "11:30", name: "S. Núñez", color: "var(--dh-ink)" },
    ]},
  { day: "Dom", date: 26, rest: true, slots: [] },
];

const AgendaSemanaV2 = () => (
  <div style={{ fontFamily: "var(--dh-font-body)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
      <div>
        <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
          letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Semana del 20 al 26 de abril, 2026</div>
        <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)", fontSize: 36, fontWeight: 700, letterSpacing: "-.022em" }}>
          Tu semana
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--dh-gray-600)" }}>
          <strong>27 consultas</strong> programadas · 2 slots libres · 1 día bloqueado
        </p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button style={btnSecondary}><Icon name="arrow" size={14}/>Semana anterior</button>
        <button style={btnSecondary}>Hoy</button>
        <button style={btnSecondary}>Siguiente <Icon name="arrow" size={14}/></button>
        <button style={btnPrimary}><Icon name="plus" size={15}/>Nueva consulta</button>
      </div>
    </div>

    {/* KPIs de la semana */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
      <MiniStat label="Consultas semana" value="27" sub="+3 vs. sem. anterior" icon="calendar" tone="turquoise"/>
      <MiniStat label="Videoconsultas" value="19" sub="70% del total" icon="video"/>
      <MiniStat label="Horas ocupadas" value="20.5h" sub="de 32h disponibles" icon="clipboard"/>
      <MiniStat label="Ingresos proyectados" value="$1.215" sub="Esta semana" icon="sparkle"/>
    </div>

    {/* Grid semana */}
    <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {SEMANA.map(d => (
          <div key={d.day} style={{
            border: d.today ? "1.5px solid var(--dh-turquoise)" : "1px solid var(--dh-gray-100)",
            borderRadius: "var(--dh-r-md)",
            background: d.today ? "var(--dh-turquoise-50)" : (d.rest ? "var(--dh-gray-50)" : "#fff"),
            padding: 12, minHeight: 360,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--dh-gray-100)" }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em", textTransform: "uppercase",
                  color: d.today ? "var(--dh-turquoise-700)" : "var(--dh-gray-400)", fontWeight: 600 }}>{d.day}</div>
                <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 22, fontWeight: 700,
                  color: d.today ? "var(--dh-turquoise-700)" : "var(--dh-ink)", letterSpacing: "-.02em" }}>{d.date}</div>
              </div>
              {!d.rest && <span style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)" }}>{d.slots.filter(s => !s.blocked).length}</span>}
            </div>

            {d.rest && (
              <div style={{ textAlign: "center", color: "var(--dh-gray-400)", fontSize: 11, marginTop: 80 }}>
                Día de descanso
              </div>
            )}

            {d.slots.map((s, i) => {
              if (s.blocked) return (
                <div key={i} style={{
                  padding: "6px 8px", marginBottom: 4,
                  background: "repeating-linear-gradient(45deg, var(--dh-gray-50), var(--dh-gray-50) 4px, #fff 4px, #fff 8px)",
                  border: "1px dashed var(--dh-gray-200)", borderRadius: 6,
                  fontSize: 10, color: "var(--dh-gray-400)", textAlign: "center", fontFamily: "var(--dh-font-mono)",
                }}>{s.label || "Bloqueado"}</div>
              );
              const bg = s.status === "next" ? "rgba(255,138,101,.15)" : "var(--dh-gray-50)";
              const border = s.status === "next" ? "var(--dh-coral)" : s.color;
              return (
                <div key={i} style={{
                  padding: "6px 8px", marginBottom: 4, background: bg,
                  borderLeft: `3px solid ${border}`, borderRadius: 4,
                  opacity: s.status === "done" ? .5 : 1,
                }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)", fontWeight: 600 }}>{s.time}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dh-ink)", textDecoration: s.status === "done" ? "line-through" : "none" }}>{s.name}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ============================================================
   VISTA MES
   ============================================================ */
const buildMes = () => {
  const cells = [];
  // Empty cells: Abril 2026 starts on Wed (1st). Lun=0 → 2 empty
  for (let i = 0; i < 2; i++) cells.push({ empty: true });
  const busyDays = { 6: 3, 7: 5, 8: 4, 9: 2, 10: 6, 13: 4, 14: 5, 15: 7, 16: 3, 17: 8,
    20: 5, 21: 6, 22: 3, 23: 4, 24: 3, 25: 2,
    27: 5, 28: 4, 29: 6, 30: 3 };
  const coralDays = [15, 22, 29];  // days with high intensity
  const blockedDays = [12, 19, 26];
  for (let d = 1; d <= 30; d++) {
    cells.push({
      date: d,
      count: busyDays[d] || 0,
      blocked: blockedDays.includes(d),
      highlight: coralDays.includes(d),
      today: d === 20,
      past: d < 20,
    });
  }
  return cells;
};

const AgendaMesV2 = () => {
  const cells = buildMes();
  return (
    <div style={{ fontFamily: "var(--dh-font-body)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
            letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Vista mensual</div>
          <h1 style={{ margin: 0, fontFamily: "var(--dh-font-display)", fontSize: 36, fontWeight: 700, letterSpacing: "-.022em" }}>
            Abril 2026
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 15, color: "var(--dh-gray-600)" }}>
            <strong>108 consultas</strong> este mes · 3 días de descanso · 72% de ocupación
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnSecondary}><Icon name="arrow" size={14}/>Marzo</button>
          <button style={btnSecondary}>Mayo <Icon name="arrow" size={14}/></button>
          <button style={btnPrimary}><Icon name="plus" size={15}/>Bloquear rango</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* Calendar */}
        <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20 }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 10 }}>
            {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
              <div key={d} style={{
                fontSize: 10, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em", textTransform: "uppercase",
                color: "var(--dh-gray-400)", textAlign: "center", padding: "4px 0", fontWeight: 600,
              }}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {cells.map((c, i) => {
              if (c.empty) return <div key={i} style={{ minHeight: 90 }}/>;
              const intensity = c.count === 0 ? 0 : c.count <= 2 ? 1 : c.count <= 4 ? 2 : c.count <= 6 ? 3 : 4;
              const heatBg = ["#fff","#ECFEFF","#CFFAFE","#A5F3FC","#67E8F9"][intensity];
              return (
                <div key={i} style={{
                  minHeight: 90, padding: 10, borderRadius: 8,
                  background: c.blocked ? "repeating-linear-gradient(45deg, var(--dh-gray-50), var(--dh-gray-50) 4px, #fff 4px, #fff 8px)" :
                              c.highlight ? "rgba(255,138,101,.12)" : heatBg,
                  border: c.today ? "1.5px solid var(--dh-turquoise-700)" : "1px solid var(--dh-gray-100)",
                  opacity: c.past && !c.today ? .5 : 1, cursor: "pointer",
                  display: "flex", flexDirection: "column",
                }}>
                  <div style={{
                    fontFamily: c.today ? "var(--dh-font-display)" : "var(--dh-font-body)",
                    fontSize: c.today ? 18 : 13, fontWeight: c.today ? 700 : 600,
                    color: c.today ? "var(--dh-turquoise-700)" : (c.past ? "var(--dh-gray-400)" : "var(--dh-ink)"),
                    marginBottom: 4,
                  }}>{c.date}</div>
                  {c.blocked ? (
                    <div style={{ fontSize: 9, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: "auto" }}>Bloqueado</div>
                  ) : c.count > 0 ? (
                    <div style={{ marginTop: "auto" }}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        background: c.highlight ? "var(--dh-coral)" : "var(--dh-turquoise-700)",
                        color: "#fff", padding: "2px 7px", borderRadius: 999,
                        fontSize: 10, fontFamily: "var(--dh-font-mono)", fontWeight: 700,
                      }}>{c.count}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--dh-gray-100)", fontSize: 11, color: "var(--dh-gray-600)", fontFamily: "var(--dh-font-mono)", alignItems: "center" }}>
            <span>Ocupación:</span>
            {["#fff","#ECFEFF","#CFFAFE","#A5F3FC","#67E8F9"].map(c => (
              <span key={c} style={{ width: 18, height: 12, borderRadius: 3, background: c, border: "1px solid var(--dh-gray-100)" }}/>
            ))}
            <span>Menos → Más</span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: "var(--dh-coral)", borderRadius: 2 }}/>Día lleno
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 18, height: 10, background: "repeating-linear-gradient(45deg, var(--dh-gray-50), var(--dh-gray-50) 3px, #fff 3px, #fff 6px)", borderRadius: 2, border: "1px solid var(--dh-gray-200)" }}/>Bloqueado
            </span>
          </div>
        </div>

        {/* Sidebar: stats y próximos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", padding: 20 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)",
              letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Resumen del mes</div>
            {[
              ["Total consultas", "108"],
              ["Horas trabajadas", "82h"],
              ["Promedio diario", "4.3"],
              ["Días más ocupados", "15, 22, 29"],
              ["Ingresos proyectados", "$4.860"],
            ].map(([k,v], i) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--dh-gray-100)" : "none",
                fontSize: 13,
              }}>
                <span style={{ color: "var(--dh-gray-600)" }}>{k}</span>
                <span style={{ fontWeight: 600, fontFamily: "var(--dh-font-mono)" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--dh-turquoise-50)", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-turquoise-100)", padding: 20 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-turquoise-700)",
              letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>Próximos bloqueos</div>
            {[
              ["26 abr", "Domingo · descanso"],
              ["01 may", "Feriado · Día del trabajador"],
              ["15 may", "Bloqueo 14:00–17:00"],
            ].map(([d, t], i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 12, borderBottom: i < 2 ? "1px solid var(--dh-turquoise-100)" : "none" }}>
                <span style={{ fontFamily: "var(--dh-font-mono)", fontWeight: 700, color: "var(--dh-turquoise-700)", minWidth: 50 }}>{d}</span>
                <span style={{ color: "var(--dh-gray-800)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { AgendaEspecialistaV2, AgendaSemanaV2, AgendaMesV2 });
