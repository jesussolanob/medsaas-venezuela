# Documentación de Migración — Delta Medical CRM

> Leer este README antes de abrir cualquier otro archivo de esta carpeta.

---

## Filosofía: producto primero, nube después

**Primero construir el producto que funcione completamente en local. Luego desplegar.**

No tiene sentido configurar Auth0, Cloudflare o GCP hasta que el producto esté terminado y probado. Los planes `03-seguridad.md` y `04-gcp-infra.md` existen para cuando el producto esté listo para salir a producción — no antes.

---

## Etapa 1 — Construir el producto (todo en local)

```
01-arquitectura.md              NX monorepo, Docker, git flow, Husky, Memory Bank
02-backend-core.md              NestJS DDD, Sequelize, PostgreSQL local, DevAuthGuard
modulos/ (en orden)             Un módulo por sesión de trabajo
05-performance-observabilidad.md  Lighthouse + Sentry (puede hacerse en paralelo con módulos)
```

Durante esta etapa:
- Auth → `DevAuthGuard` con headers `x-dev-user-id` y `x-dev-user-role`
- Base de datos → Docker PostgreSQL local
- Caché → Docker Redis local
- Encriptación → clave fija en `.env` local (valor hardcodeado de desarrollo)
- Sin Auth0, sin Cloudflare, sin GCP

---

## Etapa 2 — Llevar a producción (cuando el producto funciona)

```
03-seguridad.md     Auth0 BFF, Cloudflare, encriptación por IAM, sesión única
04-gcp-infra.md     Cloud Run, Cloud SQL, VPC interna, CI/CD, migración de datos
```

Abrir estos archivos solo cuando el producto esté completo y probado localmente.

---

## Equipo de agentes

Ver `06-agentes-equipo.md` — instrucciones de roles, protocolo de comunicación, e instalación de Everything-Claude-Code.

Resumen de agentes en `.claude/agents/`:

| Agente | Rol |
|--------|-----|
| `orchestrator` | Coordina al equipo, descompone módulos, consolida resultados |
| `backend-agent` | NestJS DDD, Sequelize, use cases, migraciones |
| `frontend-agent` | Next.js App Router, Server Actions, UI Tailwind |
| `code-reviewer` | Revisión de calidad después de cada implementación |
| `qa-agent` | Tests Jest + Playwright, cobertura ≥ 80% |
| `security-agent` | PHI, IDOR, encriptación, auth |

---

## Orden de módulos (Etapa 1)

Implementar en este orden — cada uno depende del anterior:

```
00-estructura-modulo.md     leer PRIMERO — plantilla y reglas de tests
01-auth.md                  sesión activa, endpoint /me, estructura base
02-patients.md              CRUD con encriptación local y masking
03-appointments.md          agenda, estados, optimistic lock en paquetes
04-consultations.md         consultas médicas, estados de pago
05-ehr-prescriptions.md     historia clínica y recetas
06-finances.md              finanzas, tasa USDT/Bs
07-packages-booking.md      paquetes prepagados, booking público
08-admin.md                 super admin, planes, features
09-doctor-settings.md       configuración del médico, horario, feature gating
10-patient-portal.md        portal del paciente
```

---

## Principios de ahorro de tokens (Claude Code $100)

1. **Un módulo por sesión** — al iniciar, leer solo `00-estructura-modulo.md` + el archivo del módulo activo. No cargar el master plan ni otros módulos.
2. **Memory Bank actualizado al final de cada sesión** — los archivos `memory-bank/` son el contexto entre sesiones. Si no se actualizan, la próxima sesión empieza a ciegas.
3. **No pedir configuración de nube en Etapa 1** — no gastar tokens en Auth0, GCP ni Cloudflare hasta que el producto funcione localmente.
4. **DevAuthGuard en todos los tests** — los tests de integración local no necesitan tokens JWT reales.
5. **Tests obligatorios antes de pasar al siguiente módulo** — cobertura ≥ 80% global, 100% en `domain/`.

---

## Seguridad — resumen (se implementa en Etapa 2)

| Capa | Mecanismo |
|------|-----------|
| Perimetral | Cloudflare WAF + Bot Fight Mode + Turnstile |
| Token | httpOnly cookie — JavaScript nunca ve el JWT |
| Backend | `--ingress=internal` Cloud Run — no accesible desde internet |
| Datos en BD | AES-256-GCM por campo con IV aleatorio |
| Llave de cifrado | GCP Secret Manager + IAM — nunca en variables de entorno en producción |
| Sesión | Una por usuario — Redis + Auth0 Action |
| Datos en pantalla | Masking por defecto en listas, `reveal` con audit log |

En local (Etapa 1): la encriptación funciona igual pero con clave fija en `.env`. El masking también funciona. Solo el origen de la clave y el token cambian en producción.

---

## Pre-commit hook

- `develop` y `main`: ESLint + lint-staged + tests afectados (NX affected)
- `feature/*`, `hotfix/*`, `release/*`: solo lint-staged — más rápido para trabajo incremental
- Configuración completa en `01-arquitectura.md` Paso 7
