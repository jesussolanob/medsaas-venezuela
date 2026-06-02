# Documentación de referencia — Delta Medical CRM

Esta carpeta (`docs/`) reúne **material de referencia** para el equipo: arquitectura, migraciones, guías operativas e integraciones. No sustituye al README de onboarding en la raíz del repositorio.

## Índice

### En este repositorio

| Ubicación | Contenido |
|-----------|-----------|
| [architecture/](./architecture/) | Decisiones de arquitectura, flujos, capas del sistema |
| [migrations/](./migrations/) | Convenciones y notas sobre migraciones SQL / Supabase |
| [guides/](./guides/) | Guías paso a paso (deploy, integraciones, QA, etc.) |
| [SETUP_RESEND.md](./SETUP_RESEND.md) | Configuración de emails con Resend |

### Fuera de `docs/` (raíz u otros paths)

| Documento | Descripción |
|-----------|-------------|
| [../CLAUDE.md](../CLAUDE.md) | Contexto completo del producto, rutas, BD y convenciones (fuente principal para agentes) |
| [../README.md](../README.md) | Onboarding rápido para desarrolladores |
| [../README_DEPLOY.md](../README_DEPLOY.md) | Guía de despliegue y variables de entorno |
| [../migration-master-plan.md](../migration-master-plan.md) | Plan maestro de migración (permanece en raíz hasta decisión explícita de moverlo) |

## Convenciones

- Archivos en **español**, nombres en **kebab-case** (ej. `booking-flow.md`).
- **No** incluir secretos, API keys ni credenciales de Supabase.
- Un tema por documento; enlazar a `CLAUDE.md` en lugar de duplicar tablas o listas largas.

## Contribuir

Al añadir documentación nueva, actualiza este índice y coloca el archivo en la subcarpeta que corresponda.
