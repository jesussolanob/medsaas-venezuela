/* ============================================================
   Delta Health Tech — Especialista · Disponibilidad
   Configuración de horarios, bloqueos y modalidades
   ============================================================ */

const DIAS = [
  { d: "Lunes",     slots: [{ a: "08:00", b: "12:00" }, { a: "14:00", b: "18:00" }], active: true },
  { d: "Martes",    slots: [{ a: "08:00", b: "12:00" }, { a: "14:00", b: "18:00" }], active: true },
  { d: "Miércoles", slots: [{ a: "09:00", b: "13:00" }], active: true },
  { d: "Jueves",    slots: [{ a: "08:00", b: "12:00" }, { a: "14:00", b: "18:00" }], active: true },
  { d: "Viernes",   slots: [{ a: "14:00", b: "18:00" }], active: true },
  { d: "Sábado",    slots: [{ a: "10:00", b: "13:00" }], active: true },
  { d: "Domingo",   slots: [], active: false },
];

const DispEsp = () => (
  <div style={{ fontFamily: "var(--dh-font-body)" }}>
    <EspPageHeader
      eyebrow="Gestión de agenda"
      title="Disponibilidad"
      subtitle={<><strong>32 horas</strong> semanales · 3 modalidades · sincronizado con Google Calendar</>}
      actions={<>
        <button style={espBtnSecondary}><Icon name="calendar" size={14}/>Vista previa</button>
        <button style={espBtnPrimary}><Icon name="check" size={15}/>Guardar cambios</button>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Horario semanal */}
        <section style={dCard}>
          <DHead title="Horario recurrente" action="Duplicar semana"/>
          {DIAS.map((d, i) => (
            <div key={d.d} style={{
              display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 16, padding: "16px 20px",
              borderTop: i === 0 ? "1px solid var(--dh-gray-100)" : "none",
              borderBottom: "1px solid var(--dh-gray-100)", alignItems: "center",
              opacity: d.active ? 1 : .5,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.d}</div>
                <div style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>
                  {d.active ? `${d.slots.reduce((s, sl) => s + (parseInt(sl.b) - parseInt(sl.a)), 0)}h` : "Descanso"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {d.slots.map((s, j) => (
                  <div key={j} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                    background: "var(--dh-turquoise-50)", border: "1px solid var(--dh-turquoise-100)",
                    borderRadius: 10, fontSize: 13, fontFamily: "var(--dh-font-mono)",
                  }}>
                    <span style={{ fontWeight: 700, color: "var(--dh-turquoise-700)" }}>{s.a}</span>
                    <span style={{ color: "var(--dh-gray-400)" }}>–</span>
                    <span style={{ fontWeight: 700, color: "var(--dh-turquoise-700)" }}>{s.b}</span>
                    <button style={{ background: "transparent", border: "none", color: "var(--dh-gray-400)", cursor: "pointer", fontSize: 14, padding: 0, marginLeft: 2 }}>×</button>
                  </div>
                ))}
                {d.active && (
                  <button style={{ background: "transparent", border: "1.5px dashed var(--dh-gray-200)", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "var(--dh-gray-600)", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="plus" size={12}/>Franja
                  </button>
                )}
                {!d.active && <span style={{ fontSize: 12, color: "var(--dh-gray-400)", fontStyle: "italic" }}>Sin disponibilidad</span>}
              </div>
              <Toggle on={d.active}/>
            </div>
          ))}
        </section>

        {/* Modalidades */}
        <section style={dCard}>
          <DHead title="Modalidades ofrecidas"/>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, padding: 20 }}>
            {[
              { i: "video", l: "Video", d: "Videoconsulta Delta", price: "$45", on: true },
              { i: "heart", l: "Presencial", d: "Consultorio · Zona T", price: "$60", on: true },
              { i: "chat", l: "Chat", d: "Mensajería asíncrona", price: "$25", on: false },
            ].map(m => (
              <div key={m.l} style={{
                padding: 16, borderRadius: 12,
                border: "1.5px solid " + (m.on ? "var(--dh-turquoise)" : "var(--dh-gray-100)"),
                background: m.on ? "var(--dh-turquoise-50)" : "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Icon name={m.i} size={22} color={m.on ? "var(--dh-turquoise-700)" : "var(--dh-gray-400)"}/>
                  <Toggle on={m.on}/>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.l}</div>
                <div style={{ fontSize: 11, color: "var(--dh-gray-600)", marginTop: 2 }}>{m.d}</div>
                <div style={{ marginTop: 12, fontFamily: "var(--dh-font-display)", fontSize: 22, fontWeight: 700, color: m.on ? "var(--dh-turquoise-700)" : "var(--dh-gray-400)" }}>{m.price}</div>
                <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", textTransform: "uppercase", letterSpacing: ".06em" }}>por sesión</div>
              </div>
            ))}
          </div>
        </section>

        {/* Bloqueos */}
        <section style={dCard}>
          <DHead title="Bloqueos programados" action="+ Nuevo bloqueo"/>
          <div style={{ padding: "4px 20px 16px" }}>
            {[
              { d: "19 abr 2026", t: "Domingo · descanso semanal", r: "Recurrente", color: "var(--dh-gray-400)" },
              { d: "01 may 2026", t: "Día del trabajador", r: "Feriado", color: "var(--dh-coral)" },
              { d: "15 may · 14:00–17:00", t: "Congreso de psicología", r: "Evento", color: "var(--dh-turquoise-700)" },
              { d: "20–27 jul 2026", t: "Vacaciones", r: "Semanal", color: "var(--dh-coral)" },
            ].map((b, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 1fr 100px 30px", gap: 14, padding: "12px 0", borderBottom: i < 3 ? "1px solid var(--dh-gray-100)" : "none", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontFamily: "var(--dh-font-mono)", fontWeight: 700, color: "var(--dh-ink)" }}>{b.d}</div>
                <div style={{ fontSize: 13 }}>{b.t}</div>
                <div><span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: "rgba(0,0,0,.05)", color: b.color, fontWeight: 700 }}>{b.r}</span></div>
                <button style={{ background: "transparent", border: "none", color: "var(--dh-gray-400)", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <section style={dCard}>
          <DHead title="Configuración general"/>
          <div style={{ padding: "8px 20px 20px" }}>
            {[
              ["Duración por sesión", "45 min"],
              ["Tiempo entre sesiones", "15 min"],
              ["Anticipación mínima", "2 horas"],
              ["Reserva máxima", "60 días"],
              ["Zona horaria", "GMT-5 Bogotá"],
            ].map(([k, v], i, arr) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--dh-gray-100)" : "none", fontSize: 12, alignItems: "center" }}>
                <span style={{ color: "var(--dh-gray-600)" }}>{k}</span>
                <span style={{ fontWeight: 600, fontFamily: "var(--dh-font-mono)" }}>{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...dCard, background: "var(--dh-turquoise-50)", borderColor: "var(--dh-turquoise-100)" }}>
          <div style={{ padding: "16px 20px 6px", fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-turquoise-700)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>Sincronización</div>
          <div style={{ padding: "0 20px 18px" }}>
            {[
              { n: "Google Calendar", s: "Sincronizado · hace 5 min", on: true },
              { n: "Apple Calendar", s: "Conectar para sync", on: false },
              { n: "Outlook", s: "Conectar para sync", on: false },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--dh-turquoise-100)" : "none" }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: s.on ? "var(--dh-turquoise)" : "var(--dh-gray-200)" }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{s.n}</div>
                  <div style={{ fontSize: 10, color: "var(--dh-gray-600)", fontFamily: "var(--dh-font-mono)" }}>{s.s}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...dCard, background: "var(--dh-ink)", borderColor: "var(--dh-ink)", color: "#fff" }}>
          <div style={{ padding: "16px 20px 6px", fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "rgba(255,255,255,.6)", letterSpacing: ".08em", textTransform: "uppercase" }}>Capacidad semanal</div>
          <div style={{ padding: "0 20px 18px" }}>
            <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 40, fontWeight: 700, lineHeight: 1 }}>32h</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 4, marginBottom: 14 }}>42 slots de 45 min</div>
            <div style={{ height: 6, background: "rgba(255,255,255,.1)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: "72%", height: "100%", background: "var(--dh-turquoise)" }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "rgba(255,255,255,.7)" }}>
              <span>72% ocupación</span><span>12 slots libres</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
);

const Toggle = ({ on }) => (
  <div style={{
    width: 38, height: 22, borderRadius: 999, padding: 2,
    background: on ? "var(--dh-turquoise)" : "var(--dh-gray-200)",
    display: "flex", alignItems: "center",
    cursor: "pointer", transition: "background .15s",
  }}>
    <div style={{ width: 18, height: 18, borderRadius: 999, background: "#fff", marginLeft: on ? 16 : 0, transition: "margin .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}/>
  </div>
);

const dCard = { background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" };
const DHead = ({ title, action }) => (
  <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--dh-gray-100)" }}>
    <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>{title}</div>
    {action && <button style={{ ...espBtnGhost, fontSize: 11, color: "var(--dh-turquoise-700)", fontWeight: 600 }}>{action}</button>}
  </div>
);

Object.assign(window, { DispEsp });
