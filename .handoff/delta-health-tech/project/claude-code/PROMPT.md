# Prompt para Claude Code

Voy a construir el panel **Super Admin de Delta Health Tech**, una plataforma de telemedicina para Venezuela. Te adjunto el brand kit completo y mockups de referencia — úsalos como fuente de verdad.

## Contexto adjunto

- `brand-tokens.css` — Variables CSS de la marca. **TODOS** los colores, tipos, radios y sombras deben salir de aquí. No inventes valores.
- `logo.jsx` — Isotipo (lazo asimétrico turquesa + punto coral) y Wordmark. Úsalos tal cual.
- `ui-components.jsx` — Componentes base: `Icon`, `Button`, `Badge`, `Avatar`, `Card`, `Input`. Mantén la API.
- `admin-tabs.jsx` — Las 7 pestañas ya diseñadas con datos de ejemplo.
- `Delta Health Tech - Super Admin.html` — Mockup navegable de referencia visual. Ábrelo primero.

## Qué construir

Un panel Super Admin web (desktop-first, responsive) con estas 7 rutas:

| Ruta | Pestaña | Qué hace |
|---|---|---|
| `/admin` | Dashboard | Hero con saludo, 4 KPIs, gráfica de consultas 7 meses, cola de aprobaciones |
| `/admin/especialistas` | Especialistas | Tabla con filtros (nombre, cédula, especialidad), drawer de detalle |
| `/admin/aprobaciones` | Aprobaciones | Cola de solicitudes con modal de revisión de documentos |
| `/admin/pacientes` | Pacientes | Tabla con búsqueda y filtros |
| `/admin/finanzas` | Finanzas | KPIs, gráfica mensual, distribución por especialidad, transacciones |
| `/admin/suscripciones` | Suscripciones | 3 planes (Essential/Professional/Clinic) + renovaciones |
| `/admin/configuracion` | Configuración | Sub-nav con 8 secciones (general, branding, comisiones, equipo...) |

## Stack sugerido

- **Framework:** Next.js 14 (App Router) — o confirma conmigo si tengo stack distinto.
- **Estilos:** CSS Modules o Tailwind, pero **los tokens vienen de `brand-tokens.css`** (impórtalo globalmente, no reescribas valores).
- **Datos:** comenzar con los mocks de `admin-tabs.jsx`; reemplazar por API real después.
- **Tabla:** TanStack Table si los datasets crecen.
- **Gráficas:** Recharts o la versión SVG inline del mockup.

## Reglas de diseño NO negociables

1. **Tipografía:** Plus Jakarta Sans para todo. JetBrains Mono solo para metadata (IDs, fechas, cédulas, timestamps, números tabulares).
2. **Colores:**
   - Turquesa `#06B6D4` = acción primaria / marca
   - Coral `#FF8A65` = acento humano (usar con moderación)
   - Ink `#0A1424` = texto principal y CTA secundario oscuro
   - **Jamás** gradientes agresivos ni glass morphism.
3. **Radios:** pills 999px para botones/chips, 16-20px cards, 24px hero.
4. **Espaciado:** mucho aire. 24-40px en cards grandes, 14-20px en filas de tabla.
5. **Estados:** `StatusPill` para active/pending/suspended/paid/processing/failed con dot de color.
6. **Persistencia:** pestaña activa en localStorage (`dh-admin-tab`).
7. **Sin emoji.** Sin iconografía pop. Sin AI-slop.

## Orden recomendado

1. Monta el shell (sidebar + topbar + content area) y la navegación entre tabs.
2. Porta cada `TabXxx` como página, empezando por Dashboard.
3. Extrae los componentes reutilizables (StatCard, StatusPill, Btn, SearchBar, PageHead) a `components/`.
4. Cuando todo funcione con mocks, conecta datos reales.

---

**Antes de arrancar, pregúntame:**
1. Stack exacto (Next.js / Vite / otro)
2. Librería de estilos (CSS Modules / Tailwind / styled-components)
3. Si ya tengo auth o arranco desde cero
