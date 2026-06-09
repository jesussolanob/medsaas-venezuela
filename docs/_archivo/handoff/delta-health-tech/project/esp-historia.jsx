/* ============================================================
   Delta Health Tech — Especialista · Historia clínica
   Vista detallada del expediente de un paciente
   ============================================================ */

const HC_PATIENT = {
  name: "Laura Castro", age: 32, sex: "Femenino", since: "Enero 2025",
  init: "LC", color: "var(--dh-coral)",
  id: "DHT-2025-0148",
  phone: "+57 301 234 5678",
  email: "laura.castro@mail.co",
  city: "Bogotá",
  occupation: "Diseñadora de producto",
  insurance: "Delta Premium",
  emergency: "Miguel Castro (hermano) · +57 300 987 6543",
};

const HC_TABS = ["Resumen", "Antecedentes", "Sesiones", "Medicación", "Adjuntos"];

const HistoriaEsp = () => {
  const [tab, setTab] = React.useState("Resumen");

  return (
    <div style={{ fontFamily: "var(--dh-font-body)" }}>
      <EspPageHeader
        eyebrow="Historia clínica · DHT-2025-0148"
        title={HC_PATIENT.name}
        subtitle={<>{HC_PATIENT.age} años · {HC_PATIENT.sex} · Paciente desde {HC_PATIENT.since} · <strong style={{ color: "var(--dh-turquoise-700)" }}>8 sesiones</strong></>}
        actions={<>
          <button style={espBtnSecondary}><Icon name="clipboard" size={14}/>Exportar PDF</button>
          <button style={espBtnSecondary}><Icon name="chat" size={14}/>Mensaje</button>
          <button style={espBtnPrimary}><Icon name="plus" size={15}/>Nueva nota</button>
        </>}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--dh-gray-100)", marginBottom: 24 }}>
        {HC_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "12px 18px", border: "none", background: "transparent",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            color: tab === t ? "var(--dh-ink)" : "var(--dh-gray-400)",
            borderBottom: "2px solid " + (tab === t ? "var(--dh-turquoise)" : "transparent"),
            marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {tab === "Resumen"      && <ResumenTab/>}
      {tab === "Antecedentes" && <AntecedentesTab/>}
      {tab === "Sesiones"     && <SesionesTab/>}
      {tab === "Medicación"   && <MedicacionTab/>}
      {tab === "Adjuntos"     && <AdjuntosTab/>}
    </div>
  );
};

/* ---------- RESUMEN ---------- */
const ResumenTab = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Diagnóstico */}
      <section style={cardStyle}>
        <SectionHead title="Diagnóstico principal" action="Editar"/>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 20 }}>
          <div style={{ width: 44, height: 44, background: "rgba(255,138,101,.14)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="heart" size={20} color="var(--dh-coral-600)"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Trastorno de ansiedad generalizada</div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)", marginBottom: 8 }}>CIE-10 · F41.1 · Diagnosticado 15 ene 2025</div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--dh-gray-600)", lineHeight: 1.6 }}>
              Paciente presenta cuadro de ansiedad anticipatoria relacionada con entorno laboral. Síntomas somáticos moderados. Buena insight y motivación al cambio. Sin comorbilidad psiquiátrica relevante.
            </p>
          </div>
        </div>
      </section>

      {/* Plan terapéutico */}
      <section style={cardStyle}>
        <SectionHead title="Plan terapéutico" action="Actualizar"/>
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            ["Enfoque", "Terapia cognitivo-conductual", "var(--dh-turquoise-700)"],
            ["Frecuencia", "Semanal · 45 min", "var(--dh-ink)"],
            ["Duración estimada", "12–16 sesiones", "var(--dh-ink)"],
            ["Progreso", "67% del plan", "var(--dh-turquoise-700)"],
          ].map(([k, v, c]) => (
            <div key={k}>
              <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c }}>{v}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <div style={{ height: 6, background: "var(--dh-gray-100)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: "67%", height: "100%", background: "linear-gradient(90deg, var(--dh-turquoise), var(--dh-turquoise-700))" }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)" }}>
              <span>Sesión 8 de 12</span><span>4 sesiones restantes</span>
            </div>
          </div>
        </div>
      </section>

      {/* Evolución — bars chart */}
      <section style={cardStyle}>
        <SectionHead title="Evolución sintomática" action="Últimas 8 sesiones"/>
        <div style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, alignItems: "end", height: 140, marginBottom: 12 }}>
            {[8, 7, 7, 6, 5, 5, 4, 3].map((v, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)", fontWeight: 700 }}>{v}</div>
                <div style={{
                  width: "100%", height: `${v * 12}px`,
                  background: v >= 7 ? "var(--dh-coral)" : v >= 5 ? "var(--dh-coral-100)" : "var(--dh-turquoise)",
                  borderRadius: "4px 4px 0 0",
                }}/>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", textAlign: "center" }}>
            {["#1","#2","#3","#4","#5","#6","#7","#8"].map(s => <div key={s}>{s}</div>)}
          </div>
          <div style={{ marginTop: 14, padding: 12, background: "var(--dh-turquoise-50)", borderRadius: 10, fontSize: 12, color: "var(--dh-gray-800)" }}>
            <strong style={{ color: "var(--dh-turquoise-700)" }}>↓ 62% de reducción</strong> en escala GAD-7 desde inicio del tratamiento.
          </div>
        </div>
      </section>

      {/* Notas recientes */}
      <section style={cardStyle}>
        <SectionHead title="Última nota clínica" action="Ver todas"/>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", textTransform: "uppercase", letterSpacing: ".08em" }}>Sesión #8 · 18 abr 2026 · 45 min</span>
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: "var(--dh-turquoise-50)", color: "var(--dh-turquoise-700)", fontWeight: 700 }}>SOAP</span>
          </div>
          {[
            ["S", "Subjetivo", "Paciente reporta mejoría en síntomas de ansiedad anticipatoria. Ha podido aplicar técnica de respiración diafragmática en 3 situaciones laborales esta semana."],
            ["O", "Objetivo", "Afecto estable, contacto visual adecuado, discurso fluido y coherente. GAD-7: 8 (baseline: 16)."],
            ["A", "Análisis", "Respuesta favorable a intervención TCC. Consolidando estrategias de afrontamiento."],
            ["P", "Plan", "Continuar con exposición gradual. Tarea: registro de pensamientos automáticos. Próxima sesión: 25 abr."],
          ].map(([letter, label, body]) => (
            <div key={letter} style={{ display: "grid", gridTemplateColumns: "30px 100px 1fr", gap: 12, padding: "10px 0", borderBottom: "1px dashed var(--dh-gray-100)" }}>
              <div style={{ width: 28, height: 28, borderRadius: 999, background: "var(--dh-ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: "var(--dh-font-mono)", fontWeight: 700 }}>{letter}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--dh-gray-800)", alignSelf: "center" }}>{label}</div>
              <div style={{ fontSize: 13, color: "var(--dh-gray-600)", lineHeight: 1.55, alignSelf: "center" }}>{body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>

    {/* Sidebar */}
    <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Datos personales */}
      <section style={{ ...cardStyle }}>
        <SectionHead title="Datos de contacto"/>
        <div style={{ padding: 20 }}>
          {[
            ["ID", HC_PATIENT.id],
            ["Teléfono", HC_PATIENT.phone],
            ["Email", HC_PATIENT.email],
            ["Ciudad", HC_PATIENT.city],
            ["Ocupación", HC_PATIENT.occupation],
            ["Plan", HC_PATIENT.insurance],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--dh-gray-100)" : "none", fontSize: 12, gap: 10 }}>
              <span style={{ color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)", textTransform: "uppercase", letterSpacing: ".06em", fontSize: 10 }}>{k}</span>
              <span style={{ fontWeight: 500, color: "var(--dh-ink)", textAlign: "right", minWidth: 0 }}>{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Contacto de emergencia */}
      <section style={{ ...cardStyle, background: "rgba(255,138,101,.06)", borderColor: "rgba(255,138,101,.2)" }}>
        <div style={{ padding: "16px 20px 6px", fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-coral-600)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>Contacto de emergencia</div>
        <div style={{ padding: "0 20px 18px", fontSize: 13, color: "var(--dh-ink)", lineHeight: 1.5 }}>{HC_PATIENT.emergency}</div>
      </section>

      {/* Alertas */}
      <section style={cardStyle}>
        <SectionHead title="Alertas clínicas"/>
        <div style={{ padding: "4px 20px 16px" }}>
          {[
            { t: "Alergia medicamentosa", d: "Penicilina", tone: "coral" },
            { t: "Sin medicación psiquiátrica", d: "Actualmente", tone: "gray" },
            { t: "Factor protector", d: "Red de apoyo sólida", tone: "turquoise" },
          ].map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--dh-gray-100)" : "none", alignItems: "flex-start" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6,
                background: a.tone === "coral" ? "var(--dh-coral)" : a.tone === "turquoise" ? "var(--dh-turquoise)" : "var(--dh-gray-400)" }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{a.t}</div>
                <div style={{ fontSize: 11, color: "var(--dh-gray-400)" }}>{a.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Próxima cita */}
      <section style={{ ...cardStyle, background: "var(--dh-ink)", borderColor: "var(--dh-ink)", color: "#fff" }}>
        <div style={{ padding: "16px 20px 6px", fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "rgba(255,255,255,.5)", letterSpacing: ".08em", textTransform: "uppercase" }}>Próxima cita</div>
        <div style={{ padding: "0 20px 18px" }}>
          <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Hoy · 11:30 AM</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 12 }}>Seguimiento · TCC · Video</div>
          <button style={{ background: "var(--dh-turquoise)", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="video" size={14}/>Iniciar videoconsulta
          </button>
        </div>
      </section>
    </aside>
  </div>
);

/* ---------- ANTECEDENTES ---------- */
const AntecedentesTab = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
    {[
      { t: "Antecedentes personales", items: [
        "Sin antecedentes psiquiátricos previos",
        "Cuadro depresivo leve en 2019 (autolimitado)",
        "Consumo ocasional de alcohol (fines de semana)",
        "No fumadora · actividad física 3x/semana",
      ]},
      { t: "Antecedentes familiares", items: [
        "Madre: trastorno depresivo tratado (en remisión)",
        "Tía materna: trastorno de pánico",
        "Sin antecedentes de enfermedad médica grave",
      ]},
      { t: "Antecedentes médicos", items: [
        "Hipotiroidismo subclínico (controlado)",
        "Cirugía apendicectomía (2018)",
        "Alergia a penicilina",
      ]},
      { t: "Historia psicosocial", items: [
        "Convive con pareja desde 2022",
        "Red de apoyo: familiar y de amigos sólida",
        "Trabajo de alta exigencia (principal estresor)",
        "Sin hijos · mascotas (2 gatos)",
      ]},
    ].map(s => (
      <section key={s.t} style={cardStyle}>
        <SectionHead title={s.t} action="Editar"/>
        <ul style={{ margin: 0, padding: "8px 20px 20px", listStyle: "none" }}>
          {s.items.map((it, i) => (
            <li key={i} style={{ padding: "10px 0", fontSize: 13, color: "var(--dh-gray-800)", borderBottom: i < s.items.length - 1 ? "1px dashed var(--dh-gray-100)" : "none", display: "flex", gap: 10 }}>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--dh-turquoise)", marginTop: 8, flexShrink: 0 }}/>
              {it}
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

/* ---------- SESIONES ---------- */
const SESIONES = [
  { n: 8, d: "18 abr 2026", dur: "45 min", type: "Seguimiento", mode: "Video", gad: 8, status: "Completada" },
  { n: 7, d: "11 abr 2026", dur: "45 min", type: "Seguimiento", mode: "Video", gad: 9, status: "Completada" },
  { n: 6, d: "04 abr 2026", dur: "50 min", type: "Sesión extendida", mode: "Presencial", gad: 10, status: "Completada" },
  { n: 5, d: "28 mar 2026", dur: "45 min", type: "Seguimiento", mode: "Video", gad: 11, status: "Completada" },
  { n: 4, d: "21 mar 2026", dur: "45 min", type: "Seguimiento", mode: "Video", gad: 12, status: "Completada" },
  { n: 3, d: "14 mar 2026", dur: "45 min", type: "Seguimiento", mode: "Video", gad: 13, status: "Completada" },
  { n: 2, d: "07 mar 2026", dur: "45 min", type: "Seguimiento", mode: "Presencial", gad: 14, status: "Completada" },
  { n: 1, d: "28 feb 2026", dur: "60 min", type: "Sesión inicial", mode: "Presencial", gad: 16, status: "Completada" },
];
const SesionesTab = () => (
  <section style={cardStyle}>
    <div style={{ padding: 20, borderBottom: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase" }}>Historial</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>8 sesiones completadas</div>
      </div>
      <button style={espBtnSecondary}><Icon name="plus" size={14}/>Registrar sesión</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "60px 110px 1.5fr 1fr 1fr 80px 100px", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--dh-gray-100)", fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>
      <div>#</div><div>Fecha</div><div>Tipo</div><div>Modalidad</div><div>Duración</div><div>GAD-7</div><div>Estado</div>
    </div>
    {SESIONES.map(s => (
      <div key={s.n} style={{ display: "grid", gridTemplateColumns: "60px 110px 1.5fr 1fr 1fr 80px 100px", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--dh-gray-100)", alignItems: "center", fontSize: 13 }}>
        <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 20, fontWeight: 700, color: "var(--dh-turquoise-700)" }}>#{s.n}</div>
        <div style={{ fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)", fontSize: 12 }}>{s.d}</div>
        <div style={{ fontWeight: 600 }}>{s.type}</div>
        <div style={{ color: "var(--dh-gray-600)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name={s.mode === "Video" ? "video" : "heart"} size={13} color={s.mode === "Video" ? "var(--dh-turquoise-700)" : "var(--dh-coral-600)"}/>
          {s.mode}
        </div>
        <div style={{ fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)" }}>{s.dur}</div>
        <div style={{ fontFamily: "var(--dh-font-mono)", fontWeight: 700, color: s.gad >= 10 ? "var(--dh-coral-600)" : "var(--dh-turquoise-700)" }}>{s.gad}</div>
        <div><span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: "var(--dh-turquoise-50)", color: "var(--dh-turquoise-700)", fontWeight: 700 }}>{s.status}</span></div>
      </div>
    ))}
  </section>
);

/* ---------- MEDICACIÓN ---------- */
const MedicacionTab = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
    <section style={cardStyle}>
      <SectionHead title="Medicación activa"/>
      <div style={{ padding: 20, textAlign: "center", color: "var(--dh-gray-400)" }}>
        <Icon name="pill" size={32} color="var(--dh-gray-200)"/>
        <div style={{ fontSize: 13, marginTop: 10 }}>Sin medicación psiquiátrica activa</div>
        <button style={{ ...espBtnSecondary, marginTop: 14 }}><Icon name="plus" size={14}/>Prescribir</button>
      </div>
    </section>
    <section style={cardStyle}>
      <SectionHead title="Historial"/>
      <div style={{ padding: 20 }}>
        {[
          { m: "Sertralina 50 mg", d: "Ene – Mar 2025", reason: "Ansiedad · retirado por buena respuesta a TCC" },
          { m: "Alprazolam 0.25 mg", d: "Feb 2025 (SOS)", reason: "Uso ocasional · sin dependencia" },
        ].map((m, i) => (
          <div key={i} style={{ padding: "12px 0", borderBottom: i === 0 ? "1px dashed var(--dh-gray-100)" : "none" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.m}</div>
            <div style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>{m.d}</div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-600)", marginTop: 4 }}>{m.reason}</div>
          </div>
        ))}
      </div>
    </section>
  </div>
);

/* ---------- ADJUNTOS ---------- */
const AdjuntosTab = () => (
  <section style={cardStyle}>
    <SectionHead title="Archivos adjuntos" action="Subir archivo"/>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, padding: 20 }}>
      {[
        { n: "Consentimiento informado", t: "PDF · 120 KB", d: "15 ene 2025" },
        { n: "Evaluación GAD-7 inicial", t: "PDF · 80 KB", d: "28 feb 2026" },
        { n: "Registro pensamientos", t: "DOCX · 45 KB", d: "11 abr 2026" },
        { n: "Plan terapéutico firmado", t: "PDF · 210 KB", d: "15 ene 2025" },
        { n: "Análisis hormonal", t: "PDF · 1.2 MB", d: "10 mar 2026" },
      ].map((f, i) => (
        <div key={i} style={{ padding: 16, border: "1px solid var(--dh-gray-100)", borderRadius: 12, cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, background: "var(--dh-turquoise-50)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <Icon name="clipboard" size={16} color="var(--dh-turquoise-700)"/>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{f.n}</div>
          <div style={{ fontSize: 11, color: "var(--dh-gray-400)", fontFamily: "var(--dh-font-mono)" }}>{f.t} · {f.d}</div>
        </div>
      ))}
    </div>
  </section>
);

/* ---------- shared ---------- */
const cardStyle = {
  background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden",
};
const SectionHead = ({ title, action }) => (
  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>{title}</div>
    {action && <button style={{ ...espBtnGhost, fontSize: 11, color: "var(--dh-turquoise-700)", fontWeight: 600 }}>{action}</button>}
  </div>
);

Object.assign(window, { HistoriaEsp });
