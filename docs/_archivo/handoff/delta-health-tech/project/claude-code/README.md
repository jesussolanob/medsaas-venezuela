# Delta Health Tech — Handoff para Claude Code

Este folder contiene todo lo necesario para construir el panel Super Admin de Delta Health Tech con fidelidad a la marca.

## Contenido

- `brand-tokens.css` — Variables CSS de la marca (colores, tipos, radios, sombras). **Fuente de verdad.**
- `logo.jsx` — Isotipo (Mark) + Wordmark en React/SVG.
- `ui-components.jsx` — Componentes base reutilizables: Icon, Button, Input, Badge, Card, Avatar.
- `admin-tabs.jsx` — Las 7 pestañas del Super Admin (Dashboard, Especialistas, Aprobaciones, Pacientes, Finanzas, Suscripciones, Configuración).
- `Delta Health Tech - Super Admin.html` — Mockup navegable de referencia. Ábrelo en el navegador para ver el diseño final.
- `PROMPT.md` — Prompt listo para pegar en Claude Code.

## Cómo usarlo

1. Pega el contenido de `PROMPT.md` en Claude Code.
2. Adjunta los archivos de este folder como contexto.
3. Claude Code construirá la aplicación real respetando exactamente estos tokens y layouts.
