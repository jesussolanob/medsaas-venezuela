/* ============================================================
   Delta Health Tech — Brand Deck Slides
   ============================================================ */

/* ---------- Helpers ---------- */
const SlideHeader = ({ section, title, num, total }) => (
  <>
    <div className="slide-header">
      <div>
        <div className="dh-eyebrow" style={{ marginBottom: 14 }}>{section}</div>
        <h1 className="dh-h1" style={{ margin: 0 }}>{title}</h1>
      </div>
      <div className="slide-meta">
        <Wordmark size={32} />
        <span className="slide-number">{String(num).padStart(2,"0")} / {String(total).padStart(2,"0")}</span>
      </div>
    </div>
    <div className="slide-divider" />
  </>
);
const SlideFooter = ({ tag }) => (
  <div className="slide-footer">
    <span>Delta Health Tech · Brand Guidelines · v1.0</span>
    <span>{tag}</span>
  </div>
);

/* ============================================================
   SLIDE 1 — Cover
   ============================================================ */
const SlideCover = () => (
  <>
    {/* Background mark — large, soft */}
    <div style={{
      position: "absolute", right: -120, top: 60, opacity: 0.08, pointerEvents: "none",
    }}>
      <Mark size={760} />
    </div>

    <div style={{ position: "relative", zIndex: 2, maxWidth: 1100 }}>
      <Wordmark size={80} />
      <div className="dh-eyebrow" style={{ marginTop: 80, marginBottom: 20 }}>
        Brand Identity Guidelines · v1.0
      </div>
      <h1 className="dh-display" style={{ margin: "0 0 28px", maxWidth: 1000 }}>
        El lazo que une<br/>
        <span style={{ color: "var(--dh-turquoise-700)" }}>especialista</span> y <span style={{ color: "var(--dh-coral)" }}>paciente</span>.
      </h1>
      <p className="dh-body-lg" style={{ maxWidth: 720, margin: 0 }}>
        Sistema visual y verbal para la primera plataforma venezolana
        de atención de especialistas hacia pacientes.
      </p>
    </div>

    <div style={{
      position: "absolute", bottom: 56, left: 96, right: 96,
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      fontFamily: "var(--dh-font-mono)", fontSize: 11,
      color: "var(--dh-gray-400)", letterSpacing: ".1em", textTransform: "uppercase",
    }}>
      <span>Caracas · 2026</span>
      <span>For Claude Cowork handoff →</span>
    </div>
  </>
);

/* ============================================================
   SLIDE 2 — Manifiesto
   ============================================================ */
const SlideManifesto = () => (
  <>
    <SlideHeader section="01 · Esencia" title="Manifiesto" num={2} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, flex: 1 }}>
      <div>
        <p style={{
          fontSize: 38, lineHeight: 1.25, fontWeight: 500,
          color: "var(--dh-ink)", margin: 0, letterSpacing: "-0.015em",
          textWrap: "balance",
        }}>
          La salud no se trata de pantallas, expedientes ni códigos.
          Se trata de <em style={{ color: "var(--dh-turquoise-700)", fontStyle: "normal" }}>una persona escuchando a otra</em>.
          <br/><br/>
          Existimos para hacer ese encuentro <em style={{ color: "var(--dh-coral)", fontStyle: "normal" }}>posible, fácil y humano</em>,
          dondequiera que estén.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <div className="dh-caption">Misión</div>
          <p style={{ margin: "10px 0 0", fontSize: 18, lineHeight: 1.5 }}>
            Conectar a cada venezolano con el especialista correcto, con la tecnología que lo hace simple.
          </p>
        </Card>
        <Card>
          <div className="dh-caption">Visión</div>
          <p style={{ margin: "10px 0 0", fontSize: 18, lineHeight: 1.5 }}>
            Ser el lazo digital de confianza entre quien cuida y quien necesita ser cuidado.
          </p>
        </Card>
        <Card accent>
          <div className="dh-caption" style={{ color: "var(--dh-turquoise-700)" }}>Promesa</div>
          <p style={{ margin: "10px 0 0", fontSize: 22, lineHeight: 1.4, fontWeight: 600 }}>
            "Tu especialista, a un lazo de distancia."
          </p>
        </Card>
      </div>
    </div>
    <SlideFooter tag="01 · Esencia" />
  </>
);

/* ============================================================
   SLIDE 3 — Concepto del logo (el lazo)
   ============================================================ */
const SlideConcept = () => (
  <>
    <SlideHeader section="02 · Símbolo" title="El concepto del lazo" num={3} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, flex: 1, alignItems: "center" }}>
      <div style={{
        background: "var(--dh-white)",
        border: "1px solid var(--dh-gray-100)",
        borderRadius: "var(--dh-r-xl)",
        padding: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        minHeight: 480,
      }}>
        <Mark size={360} />
        {/* Anotaciones */}
        <div style={{
          position: "absolute", top: 60, left: 50,
          fontFamily: "var(--dh-font-mono)", fontSize: 11,
          color: "var(--dh-turquoise-700)", letterSpacing: ".06em",
        }}>
          ↘ curva guía<br/>
          <span style={{ color: "var(--dh-gray-400)" }}>el especialista</span>
        </div>
        <div style={{
          position: "absolute", bottom: 70, right: 70,
          fontFamily: "var(--dh-font-mono)", fontSize: 11,
          color: "var(--dh-coral-600)", letterSpacing: ".06em",
          textAlign: "right",
        }}>
          curva receptiva ↖<br/>
          <span style={{ color: "var(--dh-gray-400)" }}>el paciente</span>
        </div>
      </div>
      <div>
        <h2 className="dh-h2" style={{ margin: "0 0 24px", maxWidth: 540 }}>
          Asimétrico por diseño. Equilibrado por intención.
        </h2>
        <p className="dh-body-lg" style={{ marginBottom: 32 }}>
          Dos curvas orgánicas se encuentran. Una <strong style={{ color: "var(--dh-turquoise-700)" }}>guía</strong> con experticia.
          La otra <strong style={{ color: "var(--dh-coral-600)" }}>recibe</strong> con confianza.
          Juntas forman un lazo que no se cierra del todo —porque la relación cuidador/paciente siempre está abierta a crecer.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card style={{ padding: 20 }}>
            <div className="dh-caption" style={{ color: "var(--dh-turquoise-700)" }}>Curva guía</div>
            <div style={{ fontSize: 16, marginTop: 6, fontWeight: 600 }}>Más larga · envolvente</div>
            <div style={{ fontSize: 13, color: "var(--dh-gray-600)", marginTop: 4 }}>Experticia, contención, dirección</div>
          </Card>
          <Card style={{ padding: 20 }}>
            <div className="dh-caption" style={{ color: "var(--dh-coral-600)" }}>Curva receptiva</div>
            <div style={{ fontSize: 16, marginTop: 6, fontWeight: 600 }}>Más corta · contenida</div>
            <div style={{ fontSize: 13, color: "var(--dh-gray-600)", marginTop: 4 }}>Apertura, confianza, descanso</div>
          </Card>
        </div>
      </div>
    </div>
    <SlideFooter tag="02 · Símbolo" />
  </>
);

/* ============================================================
   SLIDE 4 — Variaciones del logo
   ============================================================ */
const SlideVariations = () => (
  <>
    <SlideHeader section="02 · Símbolo" title="Cuatro exploraciones" num={4} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, flex: 1 }}>
      {[
        { Comp: Mark, label: "Lazo abierto", role: "PRIMARIO", desc: "Asimétrico, gestual, abierto" },
        { Comp: MarkV2, label: "Nudo infinito", role: "Alternativa", desc: "Vínculo cerrado, continuo" },
        { Comp: MarkV3, label: "Gota guía", role: "Alternativa", desc: "Más sólida, abrazo visible" },
        { Comp: MarkV4, label: "Delta abrazado", role: "Alternativa", desc: "Letra Δ + base receptiva" },
      ].map(({ Comp, label, role, desc }, i) => (
        <Card key={i} accent={i===0} style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          <div style={{
            flex: 1, background: i===0 ? "var(--dh-turquoise-50)" : "var(--dh-bone)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 40, minHeight: 220,
          }}>
            <Comp size={140} />
          </div>
          <div style={{ padding: 22, borderTop: "1px solid var(--dh-gray-100)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{label}</div>
              <Badge tone={i===0 ? "turquoise" : "gray"}>{role}</Badge>
            </div>
            <div style={{ fontSize: 13, color: "var(--dh-gray-600)" }}>{desc}</div>
          </div>
        </Card>
      ))}
    </div>
    <SlideFooter tag="02 · Símbolo" />
  </>
);

/* ============================================================
   SLIDE 5 — Lockups (horizontal, vertical, isotipo)
   ============================================================ */
const SlideLockups = () => (
  <>
    <SlideHeader section="02 · Símbolo" title="Lockups y aplicación" num={5} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr", gap: 24, flex: 1 }}>
      {/* Horizontal */}
      <Card style={{ padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Wordmark size={88} />
        </div>
        <div style={{ padding: 20, borderTop: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>Horizontal</span>
          <span className="dh-caption">Default · Web</span>
        </div>
      </Card>
      {/* Vertical */}
      <Card style={{ padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Wordmark size={84} vertical />
        </div>
        <div style={{ padding: 20, borderTop: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>Vertical</span>
          <span className="dh-caption">App · Splash</span>
        </div>
      </Card>
      {/* Isotipo */}
      <Card style={{ padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, background: "var(--dh-ink)" }}>
          <Mark size={130} primary="var(--dh-turquoise-500)" accent="var(--dh-coral)" />
        </div>
        <div style={{ padding: 20, borderTop: "1px solid var(--dh-gray-100)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700 }}>Isotipo</span>
          <span className="dh-caption">Avatar · Favicon</span>
        </div>
      </Card>
    </div>

    {/* Reglas */}
    <div style={{
      marginTop: 24,
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
    }}>
      {[
        ["Espacio mínimo", "x = altura del isotipo ÷ 2"],
        ["Tamaño mínimo digital", "Isotipo 24px · Wordmark 120px"],
        ["Tamaño mínimo impreso", "Isotipo 8mm · Wordmark 30mm"],
        ["No alterar", "Colores, proporción, rotación o relleno"],
      ].map(([k, v], i) => (
        <div key={i} style={{ padding: "16px 18px", background: "var(--dh-gray-50)", borderRadius: "var(--dh-r-md)" }}>
          <div className="dh-caption">{k}</div>
          <div style={{ fontSize: 14, marginTop: 4, color: "var(--dh-gray-800)" }}>{v}</div>
        </div>
      ))}
    </div>
    <SlideFooter tag="02 · Símbolo" />
  </>
);

/* ============================================================
   SLIDE 6 — Paleta
   ============================================================ */
const SlidePalette = () => {
  const Swatch = ({ name, hex, var_, fg = "var(--dh-white)", role, large = false }) => (
    <div style={{
      background: hex,
      borderRadius: "var(--dh-r-lg)",
      padding: large ? 32 : 22,
      color: fg,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      minHeight: large ? 240 : 140,
      border: hex === "#FFFFFF" || hex === "#FAFBFC" || hex === "#F4F6F8" ? "1px solid var(--dh-gray-100)" : "none",
    }}>
      <div>
        <div style={{ fontSize: 11, fontFamily: "var(--dh-font-mono)", letterSpacing: ".08em", opacity: .7, textTransform: "uppercase" }}>{role}</div>
        <div style={{ fontSize: large ? 28 : 18, fontWeight: 700, marginTop: 6 }}>{name}</div>
      </div>
      <div style={{ fontFamily: "var(--dh-font-mono)", fontSize: large ? 14 : 12, opacity: .85 }}>
        {hex}<br/>
        <span style={{ opacity: .65 }}>{var_}</span>
      </div>
    </div>
  );
  return (
    <>
      <SlideHeader section="03 · Color" title="Paleta cromática" num={6} total={11} />
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.7fr", gridTemplateRows: "1fr 1fr", gap: 16, flex: 1 }}>
        <div style={{ gridRow: "1 / 3" }}>
          <Swatch name="Turquoise" hex="#06B6D4" var_="--dh-turquoise" role="Primario" large />
        </div>
        <Swatch name="Turq. 700" hex="#0891B2" var_="--dh-turquoise-700" role="Hover / texto" />
        <Swatch name="Coral" hex="#FF8A65" var_="--dh-coral" role="Acento cálido" />
        <Swatch name="Ink" hex="#0F1A2A" var_="--dh-ink" role="Texto / dark" />
        <Swatch name="Turq. 100" hex="#CFFAFE" var_="--dh-turquoise-100" role="Surface" fg="var(--dh-turquoise-700)" />
        <Swatch name="Gray 50" hex="#F4F6F8" var_="--dh-gray-50" role="Background" fg="var(--dh-gray-800)" />
        <Swatch name="Gray 600" hex="#5A6773" var_="--dh-gray-600" role="Body text" />
      </div>
      <SlideFooter tag="03 · Color" />
    </>
  );
};

/* ============================================================
   SLIDE 7 — Tipografía
   ============================================================ */
const SlideType = () => (
  <>
    <SlideHeader section="04 · Tipografía" title="Plus Jakarta Sans" num={7} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 60, flex: 1 }}>
      <div>
        <div style={{
          fontFamily: "var(--dh-font-display)",
          fontSize: 240, fontWeight: 700, lineHeight: .85,
          letterSpacing: "-.04em", color: "var(--dh-ink)",
        }}>Aa</div>
        <div style={{ marginTop: 32, display: "flex", gap: 28, flexWrap: "wrap" }}>
          {["300 Light","400 Regular","500 Medium","600 SemiBold","700 Bold"].map(w => (
            <span key={w} style={{
              fontFamily: "var(--dh-font-display)",
              fontSize: 18, fontWeight: parseInt(w),
              color: "var(--dh-gray-800)",
            }}>{w}</span>
          ))}
        </div>
        <div style={{
          marginTop: 28, padding: 20,
          background: "var(--dh-gray-50)", borderRadius: "var(--dh-r-md)",
          fontFamily: "var(--dh-font-mono)", fontSize: 13, color: "var(--dh-gray-600)",
        }}>
          ABCDEFGHIJKLMNÑOPQRSTUVWXYZ<br/>
          abcdefghijklmnñopqrstuvwxyz<br/>
          0123456789 — “¿áéíóú?” · @#$%
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {[
          { label: "Display · 96/98 · -3.5%", sample: "Salud humana", size: 56, weight: 700, ls: "-.03em" },
          { label: "H1 · 64/65 · -2.8%", sample: "Tu especialista", size: 40, weight: 700, ls: "-.025em" },
          { label: "H2 · 36/40 · -1.8%", sample: "Agenda hoy", size: 28, weight: 600, ls: "-.018em" },
          { label: "Body · 18/28", sample: "Conectamos pacientes con especialistas en Venezuela.", size: 17, weight: 400, color: "var(--dh-gray-600)" },
          { label: "Caption · Mono · 12/16", sample: "DELTA.HEALTH/V1", size: 12, mono: true, color: "var(--dh-gray-400)" },
        ].map((t, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--dh-gray-100)", paddingTop: 14 }}>
            <div className="dh-caption">{t.label}</div>
            <div style={{
              fontFamily: t.mono ? "var(--dh-font-mono)" : "var(--dh-font-display)",
              fontSize: t.size, fontWeight: t.weight || 400,
              letterSpacing: t.ls, marginTop: 6,
              color: t.color || "var(--dh-ink)",
            }}>{t.sample}</div>
          </div>
        ))}
      </div>
    </div>
    <SlideFooter tag="04 · Tipografía" />
  </>
);

/* ============================================================
   SLIDE 8 — Iconografía
   ============================================================ */
const SlideIcons = () => (
  <>
    <SlideHeader section="05 · Iconografía" title="Sistema de íconos" num={8} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 60, flex: 1 }}>
      <div>
        <h2 className="dh-h2" style={{ margin: "0 0 16px", maxWidth: 380 }}>
          Línea continua,<br/>esquinas redondeadas.
        </h2>
        <p className="dh-body" style={{ marginBottom: 22 }}>
          Trazos de 1.8px sobre grilla de 24px. Esquinas y terminales redondeados — el mismo lenguaje orgánico del isotipo.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["Grid", "24 × 24 px"],
            ["Trazo", "1.8 px (default), 2.2 px (énfasis)"],
            ["Esquinas", "Round caps · Round joins"],
            ["Color", "currentColor — heredan del contexto"],
          ].map(([k,v],i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--dh-gray-100)" }}>
              <span style={{ fontSize:13, fontWeight:600, color:"var(--dh-gray-800)" }}>{k}</span>
              <span style={{ fontSize:13, fontFamily:"var(--dh-font-mono)", color:"var(--dh-gray-600)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, alignContent:"start" }}>
        {["calendar","chat","user","shield","heart","sparkle","arrow","check","plus","bell","stethoscope","clipboard","video","pill"].map((n,i)=>(
          <div key={i} style={{
            background:"var(--dh-white)", border:"1px solid var(--dh-gray-100)",
            borderRadius:"var(--dh-r-md)", padding:18,
            display:"flex", flexDirection:"column", alignItems:"center", gap:10,
            minHeight: 100,
          }}>
            <Icon name={n} size={28} color="var(--dh-ink)" />
            <span style={{ fontSize:11, fontFamily:"var(--dh-font-mono)", color:"var(--dh-gray-400)" }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
    <SlideFooter tag="05 · Iconografía" />
  </>
);

/* ============================================================
   SLIDE 9 — Componentes UI
   ============================================================ */
const SlideComponents = () => (
  <>
    <SlideHeader section="06 · Componentes" title="UI Kit base" num={9} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1 }}>

      {/* Botones */}
      <Card>
        <div className="dh-caption" style={{ marginBottom: 18 }}>Botones</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <Button>Agendar consulta</Button>
          <Button variant="accent" icon="arrow">Empezar ahora</Button>
          <Button variant="ghost">Ver más</Button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Button size="sm">Pequeño</Button>
          <Button size="sm" variant="ghost">Cancelar</Button>
        </div>
      </Card>

      {/* Inputs */}
      <Card>
        <div className="dh-caption" style={{ marginBottom: 18 }}>Inputs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Cédula o correo" placeholder="V-12.345.678" icon="user" />
          <Input label="Especialidad" placeholder="Cardiología, Psicología…" icon="sparkle" />
        </div>
      </Card>

      {/* Badges */}
      <Card>
        <div className="dh-caption" style={{ marginBottom: 18 }}>Etiquetas</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Badge>Disponible hoy</Badge>
          <Badge tone="coral">Nuevo</Badge>
          <Badge tone="success">✓ Verificado</Badge>
          <Badge tone="gray">Cardiología</Badge>
        </div>
      </Card>

      {/* Card de especialista */}
      <Card accent>
        <div className="dh-caption" style={{ marginBottom: 14 }}>Card · Especialista</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar initials="MR" color="var(--dh-turquoise)" size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Dra. María Rivas</div>
            <div style={{ fontSize: 13, color: "var(--dh-gray-600)" }}>Psicóloga clínica · 12 años</div>
          </div>
          <Badge tone="success">Hoy</Badge>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {["09:00","10:30","14:00","16:30"].map(h=>(
            <span key={h} style={{
              padding:"8px 12px", borderRadius:"var(--dh-r-pill)",
              background:"var(--dh-turquoise-50)", color:"var(--dh-turquoise-700)",
              fontSize:13, fontWeight:600,
            }}>{h}</span>
          ))}
        </div>
      </Card>
    </div>
    <SlideFooter tag="06 · Componentes" />
  </>
);

/* ============================================================
   SLIDE 10 — Hero web (handoff)
   ============================================================ */
const SlideHero = () => (
  <>
    <SlideHeader section="07 · Aplicación" title="Hero web — handoff" num={10} total={11} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Browser frame */}
      <div style={{
        background: "var(--dh-white)",
        border: "1px solid var(--dh-gray-100)",
        borderRadius: "var(--dh-r-xl)",
        overflow: "hidden",
        flex: 1,
        display: "flex", flexDirection: "column",
        boxShadow: "var(--dh-shadow-lg)",
      }}>
        {/* Browser bar */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--dh-gray-100)",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57" }}/>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E" }}/>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C841" }}/>
          </div>
          <div style={{
            flex: 1, padding: "6px 14px", background: "var(--dh-gray-50)",
            borderRadius: 6, fontSize: 12, fontFamily: "var(--dh-font-mono)",
            color: "var(--dh-gray-600)",
          }}>delta.health</div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Nav */}
          <nav style={{
            padding: "20px 56px", display: "flex", alignItems: "center",
            justifyContent: "space-between", borderBottom: "1px solid var(--dh-gray-100)",
          }}>
            <Wordmark size={32} />
            <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
              {["Especialistas","Para profesionales","Cómo funciona","Soporte"].map(l => (
                <span key={l} style={{ fontSize: 14, color: "var(--dh-gray-600)", fontWeight: 500 }}>{l}</span>
              ))}
              <Button size="sm" variant="ghost">Ingresar</Button>
              <Button size="sm">Soy especialista</Button>
            </div>
          </nav>

          {/* Hero */}
          <div style={{
            flex: 1, padding: "48px 56px",
            background: "linear-gradient(180deg, var(--dh-turquoise-50) 0%, var(--dh-bone) 100%)",
            display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 40, alignItems: "center",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: -100, bottom: -80, opacity: .07 }}>
              <Mark size={500} />
            </div>
            <div style={{ position: "relative", zIndex: 2 }}>
              <Badge tone="coral">🇻🇪 Hecho en Venezuela</Badge>
              <h1 style={{
                fontFamily: "var(--dh-font-display)", fontWeight: 700,
                fontSize: 56, lineHeight: 1, letterSpacing: "-.03em",
                margin: "20px 0 18px", color: "var(--dh-ink)",
                textWrap: "balance",
              }}>
                Tu especialista,<br/>
                a un <span style={{ color: "var(--dh-turquoise-700)" }}>lazo</span> de distancia.
              </h1>
              <p style={{ fontSize: 18, color: "var(--dh-gray-600)", lineHeight: 1.5, maxWidth: 460, margin: "0 0 28px" }}>
                Médicos, psicólogos, odontólogos y nutricionistas verificados. Una sola plataforma para agendar, consultar y darle seguimiento.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <Button variant="accent" icon="arrow">Buscar especialista</Button>
                <Button variant="ghost">Cómo funciona</Button>
              </div>
              <div style={{ display: "flex", gap: 28, marginTop: 32 }}>
                {[["+1.200","especialistas"],["12","especialidades"],["24/7","disponibilidad"]].map(([n,l],i)=>(
                  <div key={i}>
                    <div style={{ fontFamily:"var(--dh-font-display)", fontSize: 28, fontWeight: 700, color: "var(--dh-ink)" }}>{n}</div>
                    <div style={{ fontSize: 12, color: "var(--dh-gray-600)", textTransform: "uppercase", letterSpacing: ".08em" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mock product card */}
            <div style={{
              background: "var(--dh-white)", borderRadius: "var(--dh-r-xl)",
              padding: 24, boxShadow: "var(--dh-shadow-lg)", border: "1px solid var(--dh-gray-100)",
              position: "relative", zIndex: 2,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span className="dh-caption">Próxima consulta</span>
                <Badge tone="success">En 25 min</Badge>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
                <Avatar initials="MR" color="var(--dh-turquoise)" size={52} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Dra. María Rivas</div>
                  <div style={{ fontSize: 13, color: "var(--dh-gray-600)" }}>Psicóloga · Sesión inicial</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div style={{ padding:12, background:"var(--dh-gray-50)", borderRadius:"var(--dh-r-sm)" }}>
                  <div style={{ fontSize:10, color:"var(--dh-gray-400)", textTransform:"uppercase", letterSpacing:".08em" }}>Hora</div>
                  <div style={{ fontSize:15, fontWeight:600, marginTop:2 }}>10:30 AM</div>
                </div>
                <div style={{ padding:12, background:"var(--dh-gray-50)", borderRadius:"var(--dh-r-sm)" }}>
                  <div style={{ fontSize:10, color:"var(--dh-gray-400)", textTransform:"uppercase", letterSpacing:".08em" }}>Modalidad</div>
                  <div style={{ fontSize:15, fontWeight:600, marginTop:2 }}>Videollamada</div>
                </div>
              </div>
              <button className="dh-btn dh-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 15 }}>
                Unirme a la consulta
                <Icon name="video" size={18} stroke={2.2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <SlideFooter tag="07 · Aplicación · Listo para Claude Cowork" />
  </>
);

/* ============================================================
   SLIDE 11 — Voz & cierre
   ============================================================ */
const SlideVoice = () => (
  <>
    <SlideHeader section="08 · Voz" title="Tono de voz" num={11} total={11} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, flex: 1 }}>
      <div>
        <h2 className="dh-h2" style={{ marginTop: 0, maxWidth: 480 }}>
          Hablamos como un colega de confianza —no como un manual médico.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
          {[
            ["Cercano", "no distante"],
            ["Claro", "no técnico"],
            ["Cálido", "no frío"],
            ["Confiable", "no solemne"],
          ].map(([a,b],i)=>(
            <div key={i} style={{ padding: 18, background: "var(--dh-gray-50)", borderRadius: "var(--dh-r-md)" }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: "var(--dh-turquoise-700)" }}>{a}</div>
              <div style={{ fontSize: 13, color: "var(--dh-gray-600)", marginTop: 2 }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[
          { yes: "Tu próxima consulta es a las 10:30. Te avisaremos 15 min antes.", no: "Notificación: Recordatorio de cita programada para las 10:30 AM." },
          { yes: "Encuentra el especialista correcto en menos de un minuto.", no: "Sistema de búsqueda avanzada de profesionales de la salud." },
          { yes: "Tu historial vive contigo, no en un cajón.", no: "Gestión digital integral del expediente clínico." },
        ].map((p,i)=>(
          <Card key={i} style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <span style={{ color: "var(--dh-success)", fontWeight: 700, fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 16, lineHeight: 1.4 }}>{p.yes}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, opacity: .55 }}>
              <span style={{ color: "var(--dh-error)", fontWeight: 700, fontSize: 16 }}>✗</span>
              <span style={{ fontSize: 14, lineHeight: 1.4, textDecoration: "line-through", color: "var(--dh-gray-600)" }}>{p.no}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <SlideFooter tag="08 · Voz · Fin del documento" />
  </>
);

Object.assign(window, {
  SlideCover, SlideManifesto, SlideConcept, SlideVariations,
  SlideLockups, SlidePalette, SlideType, SlideIcons,
  SlideComponents, SlideHero, SlideVoice,
});
