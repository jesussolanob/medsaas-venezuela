/* ============================================================
   Delta Health Tech — Especialista · Recetas
   Lista de recetas emitidas + editor inline para nueva receta
   ============================================================ */

const RECETAS = [
  { id: "RX-2026-0412", patient: "Tomás Salazar",  init: "TS", color: "var(--dh-coral-600)", date: "20 abr 2026", status: "Vigente",  items: 2, expires: "20 jul 2026", firmada: true },
  { id: "RX-2026-0411", patient: "Jorge Ramírez",  init: "JR", color: "var(--dh-ink)",       date: "18 abr 2026", status: "Vigente",  items: 1, expires: "18 jul 2026", firmada: true },
  { id: "RX-2026-0408", patient: "Elena Campos",   init: "EC", color: "var(--dh-turquoise-700)", date: "12 abr 2026", status: "Vigente",  items: 3, expires: "12 jul 2026", firmada: true },
  { id: "RX-2026-0402", patient: "Pedro Méndez",   init: "PM", color: "var(--dh-gray-600)",  date: "08 abr 2026", status: "Canjeada", items: 1, expires: "—",          firmada: true },
  { id: "RX-2026-0398", patient: "Andrea Soto",    init: "AS", color: "var(--dh-turquoise)", date: "02 abr 2026", status: "Canjeada", items: 2, expires: "—",          firmada: true },
  { id: "RX-2026-0391", patient: "Mario Delgado",  init: "MD", color: "var(--dh-ink)",       date: "28 mar 2026", status: "Vencida",  items: 1, expires: "28 mar 2026",firmada: true },
  { id: "RX-2026-0385", patient: "Camila Villa",   init: "CV", color: "var(--dh-turquoise)", date: "21 mar 2026", status: "Vigente",  items: 2, expires: "21 jun 2026", firmada: true },
];

const STATUS_TONES = {
  "Vigente":   { bg: "rgba(6,182,212,.12)",   fg: "var(--dh-turquoise-700)" },
  "Canjeada":  { bg: "var(--dh-gray-100)",    fg: "var(--dh-gray-600)" },
  "Vencida":   { bg: "rgba(255,138,101,.14)", fg: "var(--dh-coral-600)" },
  "Borrador":  { bg: "#FEF3C7",               fg: "#92400E" },
};

const RecetasEsp = () => {
  const [tab, setTab] = React.useState("lista");
  return (
    <div style={{ fontFamily: "var(--dh-font-body)" }}>
      <EspPageHeader
        eyebrow="Prescripción digital"
        title="Recetas"
        subtitle={<><strong>42 emitidas</strong> este mes · 38 vigentes · firma digital activa</>}
        actions={<>
          <button style={espBtnSecondary}><Icon name="clipboard" size={14}/>Plantillas</button>
          <button style={espBtnPrimary} onClick={() => setTab("nueva")}><Icon name="plus" size={15}/>Nueva receta</button>
        </>}
      />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <EspMiniStat label="Emitidas (mes)" value="42" sub="+8 vs. marzo" icon="pill" tone="turquoise"/>
        <EspMiniStat label="Vigentes" value="38" sub="En farmacia" icon="check"/>
        <EspMiniStat label="Por vencer" value="5" sub="Próximos 30 días" icon="bell" tone="coral"/>
        <EspMiniStat label="Firma digital" value="100%" sub="Verificación activa" icon="shield"/>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--dh-gray-100)", marginBottom: 24 }}>
        {[["lista", "Todas las recetas"], ["nueva", "Nueva receta"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "12px 18px", border: "none", background: "transparent",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
            color: tab === id ? "var(--dh-ink)" : "var(--dh-gray-400)",
            borderBottom: "2px solid " + (tab === id ? "var(--dh-turquoise)" : "transparent"),
            marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>

      {tab === "lista" ? <RecetasLista/> : <RecetaEditor/>}
    </div>
  );
};

const RecetasLista = () => (
  <div style={{ background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr 1fr 80px 1fr 1fr 80px", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--dh-gray-100)", fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>
      <div>ID</div><div>Paciente</div><div>Fecha</div><div>Ítems</div><div>Vence</div><div>Estado</div><div style={{ textAlign: "right" }}>Acción</div>
    </div>
    {RECETAS.map((r, i) => (
      <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.8fr 1fr 80px 1fr 1fr 80px", gap: 12, padding: "14px 20px", borderBottom: i < RECETAS.length - 1 ? "1px solid var(--dh-gray-100)" : "none", alignItems: "center", fontSize: 13 }}>
        <div style={{ fontFamily: "var(--dh-font-mono)", fontSize: 12, fontWeight: 600, color: "var(--dh-turquoise-700)" }}>{r.id}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar initials={r.init} color={r.color} size={32}/>
          <div style={{ fontWeight: 600 }}>{r.patient}</div>
        </div>
        <div style={{ fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)", fontSize: 12 }}>{r.date}</div>
        <div style={{ fontFamily: "var(--dh-font-mono)", fontWeight: 700 }}>{r.items}</div>
        <div style={{ fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-600)", fontSize: 12 }}>{r.expires}</div>
        <div><span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: STATUS_TONES[r.status].bg, color: STATUS_TONES[r.status].fg, fontWeight: 700 }}>{r.status}</span></div>
        <div style={{ textAlign: "right" }}>
          <button style={{ ...espBtnGhost, fontSize: 11, color: "var(--dh-turquoise-700)", fontWeight: 600 }}>Ver ›</button>
        </div>
      </div>
    ))}
  </div>
);

const RecetaEditor = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
    {/* FORM */}
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Paciente */}
      <section style={rxCard}>
        <RxHead title="Paciente"/>
        <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 14, background: "var(--dh-turquoise-50)", borderTop: "1px solid var(--dh-gray-100)" }}>
          <Avatar initials="LC" color="var(--dh-coral)" size={48}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Laura Castro</div>
            <div style={{ fontSize: 12, color: "var(--dh-gray-600)", fontFamily: "var(--dh-font-mono)" }}>32 años · F · DHT-2025-0148 · Alergia: penicilina</div>
          </div>
          <button style={espBtnSecondary}>Cambiar</button>
        </div>
      </section>

      {/* Medicamentos */}
      <section style={rxCard}>
        <RxHead title="Medicamentos" action="+ Agregar ítem"/>
        <div style={{ padding: 20 }}>
          {[
            { name: "Sertralina", dose: "50 mg", route: "Oral", freq: "1 comprimido cada 24h", qty: "30 comprimidos", note: "Tomar por la mañana con alimento" },
            { name: "Propranolol", dose: "40 mg", route: "Oral", freq: "Cada 12h según necesidad", qty: "20 comprimidos", note: "Para episodios de taquicardia" },
          ].map((m, i) => (
            <div key={i} style={{
              padding: 16, border: "1px solid var(--dh-gray-100)", borderRadius: 12,
              marginBottom: 10, position: "relative",
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 18, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 13, color: "var(--dh-turquoise-700)", fontWeight: 700 }}>{m.dose}</div>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--dh-gray-100)", color: "var(--dh-gray-800)", fontWeight: 600, marginLeft: "auto" }}>{m.route}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase" }}>Frecuencia</div>
                  <div style={{ marginTop: 3, color: "var(--dh-ink)" }}>{m.freq}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase" }}>Cantidad</div>
                  <div style={{ marginTop: 3, color: "var(--dh-ink)" }}>{m.qty}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, padding: 10, background: "var(--dh-bone)", borderRadius: 8, fontSize: 12, color: "var(--dh-gray-600)", fontStyle: "italic" }}>
                <strong style={{ fontStyle: "normal", color: "var(--dh-gray-800)" }}>Indicación:</strong> {m.note}
              </div>
            </div>
          ))}
          <button style={{
            width: "100%", padding: 14, border: "1.5px dashed var(--dh-gray-200)", background: "#fff",
            borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "var(--dh-gray-600)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Icon name="plus" size={14}/> Agregar medicamento
          </button>
        </div>
      </section>

      {/* Diagnóstico + notas */}
      <section style={rxCard}>
        <RxHead title="Diagnóstico y observaciones"/>
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Diagnóstico (CIE-10)</div>
            <div style={{ padding: "11px 14px", border: "1px solid var(--dh-gray-200)", borderRadius: 10, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>F41.1 · Trastorno de ansiedad generalizada</span>
              <Icon name="arrow" size={14} color="var(--dh-gray-400)"/>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Vigencia</div>
            <div style={{ padding: "11px 14px", border: "1px solid var(--dh-gray-200)", borderRadius: 10, fontSize: 13 }}>
              90 días desde emisión (expira 20 jul 2026)
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>Observaciones para el paciente</div>
            <textarea defaultValue="Mantener adherencia al tratamiento. Consultar en caso de efectos adversos (náuseas persistentes, insomnio, somnolencia excesiva)."
              style={{ width: "100%", padding: 14, border: "1px solid var(--dh-gray-200)", borderRadius: 10, fontSize: 13, fontFamily: "inherit", color: "var(--dh-ink)", resize: "vertical", minHeight: 80, outline: "none" }}/>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={espBtnGhost}>Descartar</button>
        <button style={espBtnSecondary}>Guardar borrador</button>
        <button style={{ ...espBtnPrimary, background: "var(--dh-turquoise)" }}>
          <Icon name="shield" size={14}/>Firmar y emitir
        </button>
      </div>
    </div>

    {/* PREVIEW */}
    <aside style={{ position: "sticky", top: 20, alignSelf: "start" }}>
      <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Vista previa</div>
      <div style={{
        background: "#fff", borderRadius: 16, border: "1px solid var(--dh-gray-100)",
        padding: 28, boxShadow: "0 10px 30px rgba(10,10,11,.08)",
      }}>
        {/* Header receta */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "2px solid var(--dh-ink)" }}>
          <div>
            <Wordmark size={20}/>
            <div style={{ fontSize: 9, fontFamily: "var(--dh-font-mono)", color: "var(--dh-coral-600)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: 4 }}>Prescripción digital</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", textTransform: "uppercase", letterSpacing: ".06em" }}>ID</div>
            <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", fontWeight: 700 }}>RX-2026-0413</div>
          </div>
        </div>

        {/* Médico */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--dh-gray-100)" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Dra. María Rivas</div>
          <div style={{ fontSize: 11, color: "var(--dh-gray-600)" }}>Psicología clínica · Reg. 12345</div>
        </div>

        {/* Paciente */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--dh-gray-100)" }}>
          <div style={{ fontSize: 9, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Paciente</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Laura Castro · 32 años</div>
        </div>

        {/* Rx items */}
        <div style={{ padding: "16px 0" }}>
          <div style={{ fontFamily: "var(--dh-font-display)", fontSize: 34, fontWeight: 700, color: "var(--dh-coral-600)", lineHeight: 1, marginBottom: 14 }}>℞</div>
          {[
            { name: "Sertralina 50 mg", freq: "1 cada 24h · 30 comprimidos" },
            { name: "Propranolol 40 mg", freq: "c/12h SOS · 20 comprimidos" },
          ].map((m, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px dashed var(--dh-gray-100)" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}. {m.name}</div>
              <div style={{ fontSize: 11, color: "var(--dh-gray-600)", marginTop: 2 }}>{m.freq}</div>
            </div>
          ))}
        </div>

        {/* Firma */}
        <div style={{ marginTop: 20, padding: 12, background: "var(--dh-turquoise-50)", borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="shield" size={18} color="var(--dh-turquoise-700)"/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: "var(--dh-font-mono)", color: "var(--dh-turquoise-700)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>Firma digital verificada</div>
            <div style={{ fontSize: 10, color: "var(--dh-gray-600)", fontFamily: "var(--dh-font-mono)" }}>SHA-256 · 20 abr 2026 · 09:42</div>
          </div>
        </div>
      </div>
    </aside>
  </div>
);

const rxCard = { background: "#fff", borderRadius: "var(--dh-r-lg)", border: "1px solid var(--dh-gray-100)", overflow: "hidden" };
const RxHead = ({ title, action }) => (
  <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", color: "var(--dh-gray-400)", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>{title}</div>
    {action && <button style={{ ...espBtnGhost, fontSize: 11, color: "var(--dh-turquoise-700)", fontWeight: 600 }}>{action}</button>}
  </div>
);

Object.assign(window, { RecetasEsp });
