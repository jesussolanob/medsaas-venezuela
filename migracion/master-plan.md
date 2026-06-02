# Plan Maestro de Migración — Delta Medical CRM
## De: Next.js monolítico + Supabase → NX Monorepo + NestJS + PostgreSQL + GCP

**Versión:** 1.0
**Fecha:** 2026-05-07
**Estado:** PLANIFICACIÓN — Sin cambios de código aún
**Proyecto:** medsaas-venezuela (Delta Medical CRM)

---

## AUDIT REPORT — Estado actual del proyecto

### Stack actual detectado
- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Auth:** Supabase Auth (email/password + magic link)
- **Base de datos:** PostgreSQL vía Supabase (con RLS policies)
- **Storage:** Supabase Storage
- **ORM:** Ninguno — queries directas con `@supabase/supabase-js`
- **Deploy:** Vercel (frontend) + Supabase Cloud (backend)
- **Caché:** Ninguna
- **Testing:** Playwright (E2E básico)

### Acoplamiento detectado (problemas a resolver)
1. **Lógica de negocio en Server Actions (`actions.ts`):** Cada módulo del doctor y admin tiene su propio archivo `actions.ts` con queries directas a Supabase. No hay separación de capas.
2. **Auth embebida en el middleware:** `middleware.ts` llama directamente a Supabase para verificar sesión y rol en cada request.
3. **Sin tipado compartido:** Los tipos de `profiles`, `appointments`, `patients`, etc. están duplicados o inferidos inline por toda la app.
4. **Sin ORM ni migrations gestionadas:** El schema vive en Supabase y se gestiona con SQL puro sin versionado reproducible.
5. **Sin caché:** Cada render hace queries en frío a la base de datos.
6. **Sin separación Front/Back:** La API de negocio (`/app/api/`) y el frontend comparten el mismo proceso Node.js de Next.js.

### Módulos existentes a conservar
- `/admin` — Super Administrador (dashboard, médicos, suscripciones, planes, features)
- `/doctor` — App del médico (agenda, pacientes, consultas, EHR, finanzas, cobros, plantillas)
- `/patient` — Portal del paciente
- `/book/[doctorId]` — Booking público (5 pasos acordeón)
- `/register`, `/login` — Registro y login unificado
- Sistema de paquetes prepagados con optimistic lock
- Feature gating por plan en sidebar del doctor

---

## MARCO LEGAL — Datos de pacientes en Venezuela

### Legislación aplicable
1. **Constitución RBV, Art. 60:** Garantiza el derecho a la privacidad y a la protección del honor. Los datos de salud son datos de carácter personalísimo.
2. **Ley Especial contra los Delitos Informáticos (Gaceta 37.313, 2001):** Tipifica el acceso indebido, sabotaje y espionaje informático. Impone responsabilidad por divulgación de datos de sistemas de información.
3. **Ley de Infogobierno (Gaceta 40.274, 2013):** Establece principios de seguridad, integridad y confidencialidad de la información en sistemas de tecnología. Exige mecanismos criptográficos para datos sensibles del Estado, extrapolable a sistemas privados de salud.
4. **Código de Deontología Médica de Venezuela (FMV):** Impone al médico el secreto profesional absoluto sobre los datos del paciente. Digitalmente, esto se traduce en la obligación de proteger el historial clínico con mecanismos técnicos.

### Campos que DEBEN encriptarse (AES-256-GCM a nivel de campo)
| Tabla | Campo | Justificación |
|-------|-------|---------------|
| `patients` | `cedula` | Identificador nacional — dato sensible |
| `patients` | `full_name` | PII directa |
| `patients` | `phone` | PII de contacto |
| `patients` | `email` | PII de contacto |
| `ehr_records` | `diagnosis` | Dato clínico — secreto médico |
| `ehr_records` | `treatment_plan` | Dato clínico |
| `consultations` | `chief_complaint` | Dato clínico |
| `consultations` | `diagnosis` | Dato clínico |
| `consultations` | `treatment` | Dato clínico |
| `prescriptions` | `medication_name` | Dato clínico |
| `prescriptions` | `dosage` | Dato clínico |

### Estrategia de encriptación
- **Algoritmo:** AES-256-GCM (autenticado, detección de tampering)
- **Gestión de claves:** GCP Secret Manager + Cloud KMS — llave accesible ÚNICAMENTE via IAM desde el backend (Cloud Run Service Account). Nunca en variables de entorno en producción, nunca en el cliente
- **IV/Nonce:** Generado aleatoriamente por campo, almacenado junto al ciphertext (base64)
- **Campos de búsqueda:** Generar un HMAC-SHA256 determinístico del valor original para permitir búsquedas exactas sin exponer el dato (columna `*_search_hash`)
- **Encriptación:** Realizada ÚNICAMENTE en el backend (NestJS) — nunca en el cliente
- **Token de sesión:** Gestionado con patrón BFF — el JWT de Auth0 vive en una cookie `httpOnly + Secure + SameSite=Strict` cifrada por `@auth0/nextjs-auth0`. El JavaScript del browser **nunca puede leer ni acceder al token** en ningún momento
- **Acceso al backend:** NestJS solo acepta conexiones desde la red VPC interna de GCP. No tiene ingress público — el browser nunca llama directamente a NestJS

---

## ARQUITECTURA OBJETIVO

```
delta-medical-nx/                        # Raíz del monorepo NX
├── apps/
│   ├── frontend/                        # Next.js 16 (App Router) — UI migrada
│   └── backend/                         # NestJS — API REST con DDD
│       └── src/
│           ├── domain/                  # Capa de dominio (entidades, value objects, repositorios abstractos)
│           ├── application/             # Casos de uso (services, DTOs, interfaces de puertos)
│           ├── infrastructure/          # Implementaciones concretas (Sequelize, Redis, GCS, Auth0)
│           └── presentation/           # Controllers HTTP, Guards, Pipes, Filters
├── libs/
│   ├── shared-types/                    # Zod schemas + tipos TypeScript compartidos
│   ├── shared-utils/                    # Funciones utilitarias puras (sin side effects)
│   └── shared-crypto/                   # Helpers AES-256-GCM + HMAC (isomórficos)
├── memory-bank/                         # Contexto persistente del proyecto para agentes IA
│   ├── 00-project-overview.md
│   ├── 01-architecture.md
│   ├── 02-components.md
│   ├── 03-development-process.md
│   ├── 04-api-documentation.md
│   ├── 05-progress-log.md
│   └── 06-mvp-planning.md               # Requerimientos del MVP Delta Saas + estado de cada ítem
├── .github/
│   └── workflows/                       # GitHub Actions (ci, deploy-staging, deploy-production, hotfix)
├── .cursor/
│   └── rules/                           # Reglas para el agente Cursor
├── infrastructure/
│   └── terraform/                       # IaC para GCP (Cloud SQL, Cloud Run, Redis, GCS, Secrets)
├── tools/
│   └── scripts/                         # Scripts de migración de datos, seeds, utilidades
├── docker/
│   └── docker-compose.yml               # Postgres 16 + Redis 7 (sin pgAdmin — usar cliente local)
├── CLAUDE.md                            # Reglas e instrucciones para Claude Code
├── nx.json
├── package.json                         # Raíz del workspace
└── tsconfig.base.json                   # Paths compartidos (@delta/*)
```

### Decisión de stack backend: NestJS + Sequelize + DDD
**Justificación:** NestJS comparte el ecosistema TypeScript con Next.js, permitiendo reusar los tipos de `shared-types` sin conversión. Sequelize provee migrations versionadas y hooks para encriptación transparente. La arquitectura DDD (Domain-Driven Design) garantiza que el código de negocio (dominio) nunca depende de frameworks de infraestructura — si mañana se cambia Sequelize por otro ORM, o Redis por otro sistema de caché, el dominio no se toca.

### Patrones de diseño obligatorios en el backend

| Patrón | Dónde se aplica | Por qué |
|--------|-----------------|---------|
| **DDD (Domain-Driven Design)** | Estructura de capas completa | Separar lógica de negocio de infraestructura |
| **Repository Pattern** | `domain/repositories/` (abstract) + `infrastructure/repositories/` (Sequelize) | El dominio depende de la abstracción, no de Sequelize |
| **Factory Pattern** | Creación de entidades de dominio complejas (ej: `AppointmentFactory`) | Encapsular lógica de construcción y validación de invariantes |
| **Singleton** | Conexiones a BD, cliente Redis, cliente Auth0 | Evitar múltiples instancias de recursos costosos (manejado por NestJS DI) |
| **Strategy Pattern** | Notificaciones (WhatsApp vs Email), métodos de pago, exportación (Excel vs PDF) | Intercambiar algoritmos sin modificar el código cliente |
| **Observer / Event-Driven** | Eventos de dominio (`AppointmentConfirmed`, `PaymentReceived`) | Desacoplar efectos secundarios (emails, invalidación de caché) de los casos de uso |
| **Decorator Pattern** | Caché, logging, métricas en los use cases | Agregar comportamiento transversal sin modificar la clase original |

### Principios SOLID — aplicación obligatoria

- **S (Single Responsibility):** Cada clase tiene una sola razón para cambiar. Un `Service` no hace queries a la BD ni formatea responses.
- **O (Open/Closed):** Extensible por herencia/composición, no por modificación. Nuevos métodos de pago: nueva clase Strategy, sin tocar la existente.
- **L (Liskov Substitution):** El repositorio Sequelize es intercambiable por cualquier otra implementación que respete la interfaz del repositorio abstracto.
- **I (Interface Segregation):** Interfaces específicas por caso de uso — `IAppointmentReader` y `IAppointmentWriter` en lugar de una sola interfaz gigante.
- **D (Dependency Inversion):** Los módulos de alto nivel (dominio, aplicación) dependen de abstracciones. Los módulos de bajo nivel (Sequelize, Redis) implementan esas abstracciones.

### Manejo de errores — política de cero errores sin controlar

- **Capa de dominio:** Lanzar clases de error propias (`DomainError`, `AppointmentConflictError`, `PatientNotFoundError`) — NUNCA `Error` genérico.
- **Capa de aplicación:** Capturar errores de dominio y traducirlos a errores de aplicación con mensajes orientados al usuario.
- **Capa de presentación:** `GlobalExceptionFilter` en NestJS captura TODO lo que no fue capturado antes — ningún error llega al cliente sin formato controlado.
- **Frontend:** `apiClient.ts` envuelve todas las llamadas HTTP — los errores de red y de API se traducen a tipos `Result<T, AppError>` antes de llegar a los componentes.
- **Regla ESLint obligatoria:** `no-floating-promises` y `@typescript-eslint/no-throw-literal` — toda promesa rechazada es capturada.

### Comunicación Front → Back
- **Durante desarrollo:** Next.js llama al NestJS API en `http://localhost:3001`
- **En producción (GCP):** Cloud Run `frontend` → Cloud Run `backend` via VPC interna (sin salir a internet público)
- **NestJS en producción:** configurado con `--ingress=internal` en Cloud Run — rechaza cualquier request que no provenga de la red VPC interna. No tiene URL pública expuesta
- **Cloudflare → Next.js → NestJS:** el tráfico público llega a Cloudflare, pasa al Cloud Run del frontend, y solo desde ahí se enruta al backend internamente. El backend nunca es alcanzable desde internet

---

## FASE 0: Pre-migración — Análisis y documentación

**Objetivo:** Completar el entendimiento del proyecto antes de tocar una sola línea de código.
**Duración estimada:** 1 sesión de trabajo
**Prerrequisito:** Ninguno

### Instrucciones para Claude Code

1. **Auditar todas las Server Actions:** Ejecuta `grep -r "\"use server\"" app/ --include="*.ts" -l` para listar todos los archivos con lógica de servidor. Para cada archivo, identificar: qué tablas consulta, qué transformaciones realiza, si hay validaciones.

2. **Mapear queries a Supabase:** Ejecuta `grep -r "supabase\." app/ lib/ --include="*.ts" -n` para obtener todas las llamadas directas a Supabase. Agrupar por tabla consultada.

3. **Identificar tipos implícitos:** Ejecuta `grep -r "type\|interface" app/ lib/ --include="*.ts" -n` para localizar todos los tipos definidos. Listar cuáles son duplicados entre módulos.

4. **Revisar el schema SQL:** Leer todos los archivos `.sql` en la raíz y en `supabase/` para obtener el schema completo. Documentarlo en `memory-bank/01-architecture.md`.

5. **Inventariar variables de entorno:** Leer el `.env.local` (si existe) o el `.env.example`. Listar cada variable, su propósito, y clasificarla como `PUBLIC`, `SERVER_ONLY`, o `SECRET`.

6. **Revisar el MVP Delta Saas:** El archivo `MVP Delta Saas.txt` (ya leído) define los requerimientos de negocio. Mapear cada ítem del MVP a un módulo existente o a uno nuevo que habrá que crear.

7. **Generar el inventario de rutas API:** Listar todos los endpoints en `app/api/` con su método HTTP, parámetros de entrada, y qué responden.

**Entregable de esta fase:** `memory-bank/` inicializado con los archivos 00-05 completados.

---

## FASE 1: Fundación NX Monorepo + Memory Bank + Reglas de Agentes

**Objetivo:** Crear el workspace NX con la estructura correcta de carpetas, mover el proyecto Next.js existente como `apps/frontend` sin romper nada, inicializar el Memory Bank con el estado actual del proyecto, y escribir las reglas para Claude Code y Cursor. Esta fase establece las bases del proyecto antes de escribir una sola línea de lógica de negocio.
**Prerrequisito:** Fase 0 completada.

### Instrucciones para Claude Code

#### 1.1 — Inicializar el workspace NX
- Crear el directorio `delta-medical-nx/` como raíz del monorepo (fuera del repo actual).
- Inicializar workspace NX vacío con `create-nx-workspace@latest` usando el preset `ts` (TypeScript sin opinionado).
- Configurar `nx.json` con `defaultProject: "frontend"` y `tasksRunnerOptions` para caché local activado.
- Asegurar que el `package.json` raíz tenga `"workspaces": ["apps/*", "libs/*"]`.
- Crear la estructura de carpetas definida en la sección "ARQUITECTURA OBJETIVO" de este documento, incluyendo `memory-bank/`, `.github/workflows/`, `.cursor/rules/`, `infrastructure/terraform/`, `tools/scripts/`, y `docker/`.

#### 1.2 — Migrar el frontend (Next.js) como `apps/frontend`
- Copiar el proyecto Next.js actual al directorio `apps/frontend/` dentro del nuevo monorepo.
- Crear el `project.json` de NX para la app `frontend` con los targets: `build`, `serve`, `lint`, `test`.
- Actualizar todos los paths de importación relativos que rompan con la nueva ubicación.
- Verificar que `next dev` siga funcionando ejecutando `nx serve frontend`.
- El `tsconfig.json` de `apps/frontend` debe extender del `tsconfig.base.json` de la raíz.

#### 1.3 — Configurar el `tsconfig.base.json` raíz
- Definir los `paths` de TypeScript para los alias de las librerías compartidas:
  ```
  "@delta/shared-types": ["libs/shared-types/src/index.ts"]
  "@delta/shared-utils": ["libs/shared-utils/src/index.ts"]
  "@delta/shared-crypto": ["libs/shared-crypto/src/index.ts"]
  ```
- Habilitar `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true` en el `tsconfig.base.json` — estas opciones refuerzan SOLID y previenen errores sutiles.
- Esto permite que tanto `apps/frontend` como `apps/backend` importen de las libs con paths absolutos.

#### 1.4 — Crear las librerías compartidas vacías
- Usar el generador de NX para crear tres librerías TypeScript puras (sin framework):
  - `libs/shared-types/` — Tipos e interfaces + Zod schemas
  - `libs/shared-utils/` — Funciones utilitarias puras (sin side effects, sin dependencias externas)
  - `libs/shared-crypto/` — Helpers de encriptación/decriptación isomórficos
- Cada lib debe tener su `project.json`, `tsconfig.json`, y un `src/index.ts` como barrel export.
- Configurar el `lint` y `build` en cada lib via `tsc` (no Webpack/Vite — son librerías puras).
- Las librerías NO deben importar de `apps/` — solo `apps/` importa de `libs/`.

#### 1.5 — Configurar ESLint y Prettier a nivel raíz
- Un solo `eslint.config.mjs` en la raíz que aplique reglas a todos los proyectos.
- Prettier con `printWidth: 100`, `singleQuote: true`, `trailingComma: 'all'`.
- Reglas ESLint obligatorias para calidad y seguridad:
  - `@typescript-eslint/no-explicit-any: 'error'` — sin `any` en el proyecto
  - `@typescript-eslint/no-floating-promises: 'error'` — toda promesa debe ser awaited o manejada
  - `@typescript-eslint/no-throw-literal: 'error'` — solo se lanzan instancias de Error
  - `@typescript-eslint/explicit-function-return-type: 'warn'` — funciones con tipos de retorno explícitos
  - `no-console: 'warn'` — usar el logger del proyecto en lugar de console
- Ignorar `*.generated.ts` y archivos de migrations.

#### 1.6 — Configurar Git Flow y estructura de ramas
- Crear `.gitignore` unificado en la raíz del monorepo.
- Inicializar Git Flow con la siguiente convención de ramas estándar:
  - `main` → código en producción (solo recibe merges desde `release/*` y `hotfix/*`)
  - `develop` → rama de integración continua (base para todas las features)
  - `feature/<nombre-descriptivo>` → nuevas funcionalidades (salen de `develop`, mergean a `develop`)
  - `release/<version>` → preparación de release (sale de `develop`, mergea a `main` y `develop`)
  - `hotfix/<nombre-del-bug>` → fixes urgentes en producción (sale de `main`, mergea a `main` y `develop`)
- Instalar y configurar `gitflow-avh` o documentar los comandos git equivalentes en `memory-bank/03-development-process.md`.
- Proteger las ramas `main` y `develop` en GitHub: requerir PR + al menos 1 review + status checks verdes antes de mergear.
- Convención de commits: `<tipo>(<scope>): <descripción>` — tipos válidos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`. Instalar `commitlint` con el preset `@commitlint/config-conventional`.
- Crear `.github/workflows/ci.yml` que se dispare en `push` a `develop` y en `pull_request` hacia `main` o `develop`:
  - `nx affected --target=lint --base=origin/develop`
  - `nx affected --target=test --base=origin/develop`
  - `nx affected --target=build --base=origin/develop`
- Configurar `nx affected` para comparar contra `origin/develop` en PRs y contra el commit anterior en `push` directo.

#### 1.7 — Inicializar el Memory Bank
Crear los siguientes archivos en `memory-bank/` con el contenido del estado actual del proyecto (obtenido en Fase 0):

- **`00-project-overview.md`** — Nombre comercial (Delta Medical CRM), descripción del negocio, problema que resuelve, URLs de entornos, stack tecnológico completo post-migración, contactos del equipo.
- **`01-architecture.md`** — Diagrama Mermaid de la arquitectura NX + GCP, decisiones arquitectónicas (ADRs) con justificación, capas DDD del backend, estrategia de caché con TTLs, índices de base de datos, flujo de datos completo (request → response).
- **`02-components.md`** — Inventario de módulos backend (NestJS), páginas frontend (Next.js), schemas Zod en `shared-types`, tabla de feature flags con descripción de cada feature.
- **`03-development-process.md`** — Cómo arrancar el entorno local, cómo crear una migration, convención de archivos para nuevos módulos, flujo Git Flow completo con comandos, proceso de PR, proceso de hotfix, cómo correr tests.
- **`04-api-documentation.md`** — Listado completo de endpoints (método, ruta, roles, body schema, respuesta, TTL de caché). Actualizar con cada nuevo endpoint que se cree.
- **`05-progress-log.md`** — Registro cronológico: primera entrada con el estado pre-migración, una entrada por fase completada con fecha y resumen.
- **`06-mvp-planning.md`** — Transcripción y análisis del archivo `MVP Delta Saas.txt`. Para cada ítem del MVP: descripción, estado (`pendiente | en-progreso | completado`), fase del plan en la que se implementa, y notas técnicas. **Este archivo es la fuente de verdad para priorizar nuevas funcionalidades** — cualquier cambio nuevo debe verificarse primero contra este archivo.

**Regla de mantenimiento del Memory Bank:** Cada vez que se complete un cambio significativo (nuevo módulo, nuevo endpoint, decisión de arquitectura, fix de bug importante), Claude o Cursor deben actualizar el archivo correspondiente del Memory Bank antes de cerrar la sesión de trabajo. Esta regla está reforzada en las reglas de los agentes (ver sección 1.8 y 1.9).

#### 1.8 — Crear `CLAUDE.md` (reglas para Claude Code)
Crear `CLAUDE.md` en la raíz del monorepo con las siguientes instrucciones obligatorias:

```markdown
# Delta Medical CRM — Instrucciones para Claude Code

## PASO 0 — OBLIGATORIO antes de cualquier cambio
Lee estos archivos SIEMPRE antes de sugerir o aplicar cualquier modificación:
1. memory-bank/00-project-overview.md
2. memory-bank/01-architecture.md
3. memory-bank/02-components.md
4. memory-bank/06-mvp-planning.md  ← prioridades de negocio

## PASO FINAL — OBLIGATORIO al terminar cualquier cambio
Actualiza el archivo del Memory Bank correspondiente al cambio realizado:
- Nuevo endpoint → actualizar memory-bank/04-api-documentation.md
- Nueva decisión de arquitectura → actualizar memory-bank/01-architecture.md
- Nuevo componente/módulo → actualizar memory-bank/02-components.md
- Fase completada → agregar entrada en memory-bank/05-progress-log.md
- Cambio de prioridad del MVP → actualizar memory-bank/06-mvp-planning.md

## Priorización de trabajo
Toda nueva funcionalidad DEBE estar justificada en memory-bank/06-mvp-planning.md.
No implementar features que no estén en el MVP o que no hayan sido aprobadas explícitamente.

## Arquitectura — reglas críticas
- Monorepo NX: apps/frontend (Next.js), apps/backend (NestJS con DDD)
- Backend usa 4 capas DDD: domain → application → infrastructure → presentation
- NUNCA importar desde apps/backend en apps/frontend directamente — usar HTTP
- NUNCA definir tipos inline si ya existen en @delta/shared-types
- NUNCA usar `any` — es error de ESLint
- NUNCA hacer queries directas a la BD desde apps/frontend
- SIEMPRE validar inputs con Zod schemas de @delta/shared-types
- SIEMPRE manejar errores — ninguna promesa sin await ni catch

## Principios SOLID — no negociables
- S: cada clase/función tiene una única responsabilidad
- O: extender por composición, no modificar clases existentes
- L: las implementaciones son intercambiables si respetan la interfaz
- I: interfaces pequeñas y específicas, no gigantes
- D: depender de abstracciones (interfaces), no de implementaciones concretas

## Manejo de errores — política de cero errores sin controlar
- Backend: usar clases de error de dominio propias, nunca `throw new Error('string')`
- Frontend: el apiClient convierte todos los errores HTTP a tipos Result<T, AppError>
- GlobalExceptionFilter captura todo lo que no fue capturado en capas anteriores
- Regla ESLint `no-floating-promises` está activa — toda promesa debe ser handled

## Seguridad — reglas críticas
- NUNCA encriptar/decriptar datos de pacientes en apps/frontend
- NUNCA loguear campos sensibles (cedula, diagnosis, treatment, medication_name)
- NUNCA exponer ENCRYPTION_KEY ni DATABASE_URL al cliente
- NUNCA llamar directamente a apps/backend desde el browser — SIEMPRE via Server Actions o Route Handlers de Next.js (patrón BFF)
- NUNCA usar NEXT_PUBLIC_ para URLs o secrets del backend — el cliente no necesita saber que NestJS existe
- El JWT de Auth0 vive ÚNICAMENTE en la cookie httpOnly cifrada — no en localStorage, no en variables de React, no en headers visibles al cliente
- Endpoints de admin SIEMPRE con @Roles('super_admin')
- Antes de retornar datos de pacientes, verificar ownership del doctor autenticado
- Datos sensibles de pacientes: retornar SIEMPRE enmascarados en vistas de lista — solo el endpoint /reveal retorna el dato completo y registra en access_audit_log

## Idioma
- Código y comentarios técnicos: inglés
- UI y mensajes al usuario: español Venezuela (locale es-VE)
- Errores mostrados al usuario: español, tono profesional y claro
```

#### 1.9 — Crear reglas para Cursor (`.cursor/rules/`)
Crear los siguientes archivos en `.cursor/rules/`:

**`01-memory-bank.mdc`** — Carga del Memory Bank y regla de actualización:
```
---
description: Cargar Memory Bank y actualizar al terminar
globs: ["**/*.ts", "**/*.tsx", "**/*.md"]
alwaysApply: true
---
ANTES de cualquier cambio: leer memory-bank/00-project-overview.md,
memory-bank/01-architecture.md, memory-bank/02-components.md, y
memory-bank/06-mvp-planning.md.

DESPUÉS de cualquier cambio significativo: actualizar el archivo del
Memory Bank correspondiente. Los archivos del Memory Bank son documentos
vivos — deben reflejar siempre el estado actual del proyecto.

Nuevas funcionalidades deben estar en memory-bank/06-mvp-planning.md
antes de implementarse.
```

**`02-ddd-architecture.mdc`** — Arquitectura DDD del backend:
```
---
description: Arquitectura DDD para apps/backend
globs: ["apps/backend/**/*.ts"]
alwaysApply: true
---
El backend usa DDD con 4 capas estrictas:

DOMAIN (src/domain/):
- Entidades de negocio con identidad (Appointment, Patient, Consultation)
- Value Objects inmutables (AppointmentStatus, Money, DateRange)
- Interfaces de repositorios abstractas (IAppointmentRepository)
- Eventos de dominio (AppointmentConfirmedEvent)
- Errores de dominio (AppointmentConflictError extends DomainError)
- NUNCA importar de infrastructure/, presentation/, o frameworks externos

APPLICATION (src/application/):
- Use Cases (uno por caso de uso de negocio)
- DTOs de entrada/salida (usar schemas Zod de @delta/shared-types)
- Interfaces de puertos de salida (INotificationPort, ICachePort)
- NUNCA importar de infrastructure/ directamente

INFRASTRUCTURE (src/infrastructure/):
- Implementaciones de repositorios con Sequelize
- Implementaciones de puertos (RedisCache, Auth0Client, GCSStorage)
- Modelos de Sequelize (solo para mapeo BD — no son entidades de dominio)
- Configuraciones (database.config, redis.config)

PRESENTATION (src/presentation/):
- Controllers NestJS (solo rutar — sin lógica de negocio)
- Guards (AuthGuard, RolesGuard)
- Pipes (ZodValidationPipe)
- Filters (GlobalExceptionFilter)
- Interceptors (CacheInterceptor, LoggingInterceptor)

Reglas de dependencia: presentation → application → domain ← infrastructure
```

**`03-solid-principles.mdc`** — Principios SOLID y manejo de errores:
```
---
description: SOLID y error handling en todo el proyecto
globs: ["**/*.ts"]
alwaysApply: true
---
SOLID obligatorio:
- Una clase = una responsabilidad (S)
- Extender por composición, no modificar (O)
- Las subclases deben ser sustituibles por su tipo base (L)
- Interfaces pequeñas y específicas, no monolíticas (I)
- Depender de abstracciones, no de implementaciones (D)

Error handling — cero errores sin controlar:
- Backend: lanzar clases de error propias que extienden DomainError
- Frontend: apiClient convierte errores HTTP a Result<T, AppError>
- Toda promesa es awaited o tiene .catch()
- GlobalExceptionFilter captura lo que escape de las capas anteriores
- Nunca: throw new Error('mensaje genérico')
- Siempre: throw new PatientNotFoundError(patientId)
```

**`04-security.mdc`** — Reglas de seguridad:
```
---
description: Seguridad y manejo de datos sensibles
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: true
---
- Encriptación AES-256-GCM SOLO en apps/backend — nunca en apps/frontend
- Nunca loguear: cedula, diagnosis, treatment, medication_name, phone, email de pacientes
- Endpoints sin autenticación solo: /api/auth/*, /api/booking/*, /api/settings/usdt-rate
- Rate limiting obligatorio en auth y booking
- Sanitizar HTML en cualquier campo de texto libre
- Validar MIME type de archivos en el servidor antes de guardar en GCS
- Nunca exponer stack traces al cliente en producción
```

**`05-git-flow.mdc`** — Flujo de ramas y commits:
```
---
description: Git Flow — convención de ramas y commits
globs: ["**/*"]
alwaysApply: true
---
Ramas: main (prod), develop (integración), feature/* (desde develop),
release/<version> (desde develop), hotfix/* (desde main).
NUNCA commitear directo a main ni develop — siempre via PR.
Commits: <type>(<scope>): <desc> — types: feat, fix, chore, docs, refactor, test, perf.
Push a develop → deploy automático a staging (GitHub Actions).
Push a main → deploy automático a producción con smoke test (GitHub Actions).
Hotfix: merge a main Y back-merge a develop.
```

**`06-naming-conventions.mdc`** — Convenciones de nombres:
```
---
description: Convenciones de nombres en todo el proyecto
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: true
---
Backend (NestJS/DDD):
- Entidades: PascalCase (Appointment, Patient)
- Use Cases: PascalCase + verbo (CreateAppointmentUseCase, CancelAppointmentUseCase)
- Repositorios abstractos: I + PascalCase (IAppointmentRepository)
- Repositorios concretos: PascalCase + Impl (SequelizeAppointmentRepositoryImpl)
- Errores de dominio: PascalCase + Error (AppointmentConflictError)
- Eventos de dominio: PascalCase + Event (AppointmentConfirmedEvent)
- Controllers: PascalCase + Controller (AppointmentsController)
- Constantes: SCREAMING_SNAKE_CASE

Frontend (Next.js):
- Componentes: PascalCase
- Hooks: use + PascalCase (useAppointments)
- Archivos de Server Components: page.tsx, layout.tsx (Next.js convention)
- Archivos de Client Components: ComponentName.client.tsx o con 'use client' explícito
- Funciones de API client: verbo + recurso (fetchAppointments, createPatient)

Compartido:
- Schemas Zod: PascalCase + Schema (AppointmentSchema)
- Tipos inferidos: PascalCase sin sufijo (Appointment, Patient)
- Enums: PascalCase para el tipo, SCREAMING_SNAKE para los valores
```

**Verificación de fase:** `nx graph` debe mostrar las tres librerías, `apps/frontend` y `apps/backend` (aunque el backend esté vacío aún). `nx serve frontend` debe arrancar el proyecto existente sin errores. La carpeta `memory-bank/` debe existir con los 7 archivos creados y completados. `CLAUDE.md` y los 6 archivos `.cursor/rules/*.mdc` deben existir.

---

## FASE 2: Librerías compartidas — Tipos Zod + TypeScript

**Objetivo:** Extraer todos los tipos del proyecto actual y convertirlos en Zod schemas en `shared-types`, garantizando type-safety end-to-end.
**Prerrequisito:** Fase 1 completada.

### Instrucciones para Claude Code

#### 2.1 — Auditar y centralizar tipos existentes
- Lee todos los archivos `actions.ts`, `page.tsx`, y rutas de API del proyecto. Extrae todos los tipos e interfaces inline o importados.
- Identifica los tipos duplicados (por ejemplo, `Patient` probablemente está definido de forma diferente en varios módulos).
- Crea un inventario en `memory-bank/02-components.md` con todos los tipos encontrados.

#### 2.2 — Crear Zod schemas en `libs/shared-types/src/`
- Para cada entidad principal de la base de datos, crea un Zod schema:
  - `profile.schema.ts` — Perfiles de usuario (doctor, admin, patient)
  - `appointment.schema.ts` — Citas con todos sus estados válidos
  - `patient.schema.ts` — Pacientes con campos encriptables marcados
  - `consultation.schema.ts` — Consultas médicas
  - `ehr.schema.ts` — Registros de historia clínica
  - `subscription.schema.ts` — Suscripciones y planes
  - `prescription.schema.ts` — Recetas
  - `finance.schema.ts` — Transacciones financieras
- Cada schema debe exportar: el schema Zod, el tipo inferido (`z.infer<typeof Schema>`), y el schema de creación (`Schema.omit({ id: true, createdAt: true })`).

#### 2.3 — Schemas de DTOs para la API
- Crea schemas específicos para los DTOs de la API NestJS (entradas y salidas de endpoints):
  - `CreateAppointmentDto.schema.ts`
  - `UpdateAppointmentStatusDto.schema.ts`
  - `CreateConsultationDto.schema.ts`
  - `CreatePatientDto.schema.ts`
  - etc.
- Estos DTOs son más estrictos que los schemas de entidad — no permiten campos extras.

#### 2.4 — Enums compartidos
- Crea `enums.ts` con todos los valores de estado definidos en el CLAUDE.md:
  - `AppointmentStatus`: `scheduled | confirmed | cancelled | completed | no_show`
  - `PaymentStatus`: `pending | approved`
  - `SubscriptionStatus`: `trial | active | past_due | suspended`
  - `UserRole`: `super_admin | doctor | patient`
  - `PackageStatus`: `active | completed`

#### 2.5 — Actualizar `apps/frontend` para usar `@delta/shared-types`
- Reemplaza las importaciones de tipos locales con los de la librería compartida.
- Usa `tsc --noEmit` para verificar que no hay errores de tipo.

**Verificación de fase:** `nx build shared-types` debe compilar sin errores. `nx build web` también debe compilar (aunque use Supabase temporalmente).

---

## FASE 3: Backend Core — NestJS + Sequelize + PostgreSQL

**Objetivo:** Crear el backend NestJS dentro del monorepo, con Sequelize conectado a PostgreSQL local via Docker, y migrar la lógica de las Server Actions.
**Prerrequisito:** Fase 2 completada.

### Instrucciones para Claude Code

#### 3.1 — Scaffolding de la app NestJS
- Usa el plugin `@nx/nest` para generar `apps/backend/` dentro del monorepo.
- Configura el `project.json` con targets: `build`, `serve`, `lint`, `test`.
- El servidor NestJS debe arrancar en el puerto `3001`.
- Configura `CORS` en `main.ts` para aceptar requests desde `http://localhost:3000` (web).

#### 3.2 — Estructura de módulos NestJS con DDD
Organiza el backend en cuatro capas estrictas según DDD. La regla de dependencia es unidireccional: `presentation → application → domain ← infrastructure`.

```
apps/backend/src/
├── main.ts                              # Bootstrap NestJS
├── app.module.ts                        # Root module
│
├── domain/                              # CAPA DE DOMINIO — sin dependencias externas
│   ├── entities/                        # Entidades con identidad de negocio
│   │   ├── appointment.entity.ts        # Appointment (con invariantes de negocio)
│   │   ├── patient.entity.ts
│   │   ├── consultation.entity.ts
│   │   ├── ehr-record.entity.ts
│   │   ├── prescription.entity.ts
│   │   └── subscription.entity.ts
│   ├── value-objects/                   # Value Objects inmutables
│   │   ├── appointment-status.vo.ts     # Encapsula la lógica de transición de estado
│   │   ├── money.vo.ts                  # Monto + moneda (USD/BS) con conversión
│   │   ├── date-range.vo.ts
│   │   └── cedula.vo.ts                 # Valida formato de cédula venezolana
│   ├── repositories/                    # Interfaces abstractas (contratos)
│   │   ├── appointment.repository.ts    # IAppointmentRepository
│   │   ├── patient.repository.ts
│   │   ├── consultation.repository.ts
│   │   └── ...                          # Una interfaz por agregado
│   ├── events/                          # Eventos de dominio
│   │   ├── appointment-confirmed.event.ts
│   │   ├── appointment-cancelled.event.ts
│   │   └── payment-received.event.ts
│   ├── errors/                          # Errores de dominio tipados
│   │   ├── domain.error.ts              # Clase base DomainError
│   │   ├── appointment-conflict.error.ts
│   │   ├── patient-not-found.error.ts
│   │   ├── subscription-expired.error.ts
│   │   └── insufficient-sessions.error.ts
│   └── factories/                       # Factory Pattern para construcción de entidades
│       ├── appointment.factory.ts
│       └── patient.factory.ts
│
├── application/                         # CAPA DE APLICACIÓN — casos de uso
│   ├── use-cases/                       # Un archivo por caso de uso (SRP)
│   │   ├── appointments/
│   │   │   ├── create-appointment.use-case.ts
│   │   │   ├── confirm-appointment.use-case.ts
│   │   │   ├── cancel-appointment.use-case.ts
│   │   │   ├── reschedule-appointment.use-case.ts
│   │   │   └── get-doctor-agenda.use-case.ts
│   │   ├── patients/
│   │   │   ├── create-patient.use-case.ts
│   │   │   ├── get-patient-profile.use-case.ts
│   │   │   └── search-patients.use-case.ts
│   │   ├── consultations/
│   │   │   ├── start-consultation.use-case.ts
│   │   │   └── complete-consultation.use-case.ts
│   │   └── ...                          # Un directorio por dominio
│   ├── ports/                           # Interfaces de puertos de salida (Strategy/DIP)
│   │   ├── notification.port.ts         # INotificationPort (WhatsApp, Email)
│   │   ├── cache.port.ts                # ICachePort (Redis)
│   │   ├── storage.port.ts              # IStoragePort (GCS)
│   │   └── exchange-rate.port.ts        # IExchangeRatePort (Binance/BCV)
│   └── dtos/                            # DTOs de entrada/salida (usan @delta/shared-types)
│       ├── create-appointment.dto.ts
│       └── ...
│
├── infrastructure/                      # CAPA DE INFRAESTRUCTURA — implementaciones concretas
│   ├── database/
│   │   ├── models/                      # Modelos Sequelize (solo para mapeo BD)
│   │   │   ├── appointment.model.ts
│   │   │   ├── patient.model.ts
│   │   │   └── ...
│   │   ├── migrations/                  # Archivos de migration versionados
│   │   ├── seeders/                     # Seeds de desarrollo
│   │   └── repositories/               # Implementaciones concretas (Sequelize)
│   │       ├── sequelize-appointment.repository.ts
│   │       └── ...
│   ├── cache/
│   │   └── redis-cache.adapter.ts       # Implementa ICachePort con Redis
│   ├── storage/
│   │   └── gcs-storage.adapter.ts       # Implementa IStoragePort con GCS
│   ├── notifications/
│   │   ├── whatsapp.adapter.ts          # Strategy: WhatsApp Business API
│   │   └── email.adapter.ts             # Strategy: SendGrid/Resend
│   ├── auth/
│   │   └── auth0-jwt.strategy.ts        # Validación de JWT de Auth0
│   ├── exchange-rate/
│   │   └── binance-rate.adapter.ts      # Implementa IExchangeRatePort
│   └── config/
│       ├── database.config.ts
│       ├── redis.config.ts
│       └── auth.config.ts
│
└── presentation/                        # CAPA DE PRESENTACIÓN — HTTP
    ├── controllers/                     # Rutas HTTP (solo delegan a use cases)
    │   ├── appointments.controller.ts
    │   ├── patients.controller.ts
    │   ├── consultations.controller.ts
    │   ├── booking.controller.ts        # Endpoints públicos de booking
    │   ├── admin.controller.ts
    │   └── health.controller.ts         # GET /api/health para smoke tests
    ├── guards/
    │   ├── auth.guard.ts                # Valida JWT de Auth0
    │   └── roles.guard.ts               # Verifica custom claim de rol
    ├── decorators/
    │   ├── roles.decorator.ts           # @Roles('super_admin', 'doctor')
    │   └── current-user.decorator.ts    # @CurrentUser() extrae payload del JWT
    ├── filters/
    │   └── global-exception.filter.ts   # Captura TODOS los errores — respuesta siempre controlada
    ├── interceptors/
    │   ├── cache.interceptor.ts         # Cache-aside automático por ruta
    │   └── logging.interceptor.ts       # Logging estructurado de requests
    └── pipes/
        └── zod-validation.pipe.ts       # Valida body con Zod schemas de @delta/shared-types
```

**Regla de dependencias (enforced por ESLint `@nx/enforce-module-boundaries`):**
- `domain/` no importa de ninguna otra capa ni de frameworks
- `application/` solo importa de `domain/`
- `infrastructure/` importa de `domain/` y `application/` (para implementar sus contratos)
- `presentation/` importa de `application/` (invoca use cases) y de `infrastructure/` (para inyección de dependencias en módulos NestJS)

#### 3.3 — Configurar Sequelize con PostgreSQL
- Instalar: `@nestjs/sequelize`, `sequelize`, `sequelize-typescript`, `pg`, `pg-hstore`.
- Crear `database.config.ts` que lea `DATABASE_URL` del entorno.
- Configurar `SequelizeModule.forRootAsync()` en `AppModule` con:
  - `dialect: 'postgres'`
  - `models: [__dirname + '/database/models/**/*.model.ts']`
  - `synchronize: false` — NUNCA sincronizar automáticamente, usar migrations
  - `logging: process.env.NODE_ENV === 'development'`

#### 3.4 — Crear los Sequelize Models
- Para cada tabla principal, crear un modelo que extienda `Model` de `sequelize-typescript`.
- Los modelos deben usar los tipos de `@delta/shared-types` para los campos.
- Los campos encriptables (definidos en la sección de marco legal) deben tener hooks `beforeCreate` y `beforeUpdate` que llamen a `@delta/shared-crypto` para encriptar, y `afterFind` para decriptar.
- Configurar las relaciones (`@HasMany`, `@BelongsTo`) correctamente.
- Importante: los campos `search_hash` (HMAC) deben actualizarse automáticamente via hook cuando su campo original cambia.

#### 3.5 — Sistema de Migrations con Sequelize CLI
- Configurar `.sequelizerc` en la raíz de `apps/backend/` para apuntar a `src/database/`.
- Crear la migration inicial `001-initial-schema.ts` que reproduzca el schema actual de Supabase (obtenido en Fase 0).
- Convención de nombres: `NNN-descripcion-en-kebab-case.ts` (numeración secuencial).
- Crear un script `nx run backend:migrate` que ejecute `sequelize-cli db:migrate`.
- Crear un script `nx run backend:migrate:undo` para rollback.

#### 3.6 — Docker Compose para desarrollo local
Crea `docker/docker-compose.yml` con exactamente dos servicios (sin herramientas de administración gráfica — usar cliente local como TablePlus, DBeaver, o DataGrip):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    # Puerto: 5432
    # Variables: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
    # Volumen nombrado para datos persistentes entre reinicios
    # Healthcheck: pg_isready -U ${POSTGRES_USER}
    # restart: unless-stopped

  redis:
    image: redis:7-alpine
    # Puerto: 6379
    # Comando: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    # Volumen nombrado para persistencia
    # Healthcheck: redis-cli ping
    # restart: unless-stopped
```
- Crear `.env.docker` con las variables para el compose (nunca commitear con valores reales — agregar al `.gitignore`).
- Crear `.env.docker.example` con las variables documentadas pero sin valores.
- Crear `docker/init.sql` con las extensiones necesarias para PostgreSQL: `uuid-ossp` (para `gen_random_uuid()`), `pgcrypto` (para funciones de hash nativas).
- Crear el script `tools/scripts/docker-reset.sh` que baje los contenedores, elimine los volúmenes, y los vuelva a levantar — útil para resetear el entorno de desarrollo limpiamente.

#### 3.7 — Migrar lógica de Server Actions al backend
- Para cada `actions.ts` del frontend, analizar su lógica y crear el endpoint NestJS equivalente.
- Priorizar módulos en este orden: `appointments` → `patients` → `consultations` → `finances` → `admin`.
- Cada endpoint debe:
  1. Validar el JWT de Auth0 via `AuthGuard`
  2. Verificar el rol del usuario via `RolesGuard`
  3. Validar el body con `ZodValidationPipe` usando los DTOs de `@delta/shared-types`
  4. Llamar al `Service` correspondiente
  5. El `Service` usa el `Repository` de Sequelize

#### 3.8 — ZodValidationPipe global
- Crea un `ZodValidationPipe` global que tome el schema Zod del DTO y valide el request body.
- Si la validación falla, lanzar `BadRequestException` con los errores formateados de Zod.
- Esto garantiza que los DTOs en el backend y los schemas en el frontend son los mismos objetos Zod de `@delta/shared-types`.

#### 3.9 — Actualizar `apps/frontend` para llamar a la API
- Reemplaza gradualmente las llamadas directas a Supabase en las Server Actions con llamadas HTTP al backend NestJS.
- Usa un `apiClient.ts` en `apps/frontend/src/lib/` que configure los headers de Authorization automáticamente.
- Durante la transición, mantén las llamadas a Supabase como fallback hasta que cada módulo sea migrado.

**Verificación de fase:** `nx serve backend` debe arrancar el servidor NestJS. `docker compose up` debe levantar Postgres y Redis. `nx run backend:migrate` debe crear las tablas. Al menos un endpoint (`GET /appointments`) debe funcionar con auth.

---

## FASE 4: Seguridad e Identidad

**Objetivo:** Migrar de Supabase Auth a Auth0 (passwordless), implementar patrón BFF para que el token nunca llegue al browser, encriptación a nivel de campo con clave vía IAM, un dispositivo activo por usuario, y Cloudflare como capa de seguridad perimetral.
**Prerrequisito:** Fase 3 completada.

### Instrucciones para Claude Code

#### 4.1 — Configurar Auth0 Tenant
- Crear un tenant en Auth0 para el proyecto (instrucción: crear una cuenta en auth0.com, un tenant con nombre `delta-medical`).
- Configurar una **Regular Web Application** (NO SPA) para `apps/frontend` (Next.js) — este tipo de app soporta el flujo server-side con cookies httpOnly correctamente.
- Configurar una **API** en Auth0 con el identificador `https://api.deltamedical.com`.
- Habilitar la conexión **Email Passwordless** (Magic Link) — esto reemplaza el sistema de claves.
- Configurar reglas/actions en Auth0 para inyectar el `role` del usuario en el JWT como custom claim: `https://deltamedical.com/role`.
- Configurar las URLs permitidas de callback, logout, y CORS para los entornos de dev y prod.

**Configuración de tokens y sesiones (crítico):**
- **Access Token TTL:** 900 segundos (15 minutos) — ventana máxima de exposición si hay sesión comprometida
- **Refresh Token Rotation:** HABILITADO — cada uso del refresh token genera uno nuevo e invalida el anterior
- **Refresh Token Reuse Detection:** HABILITADO — si se detecta reutilización de un refresh token ya rotado, Auth0 revoca toda la familia de tokens automáticamente (indica probable robo de token)
- **Absolute Session Lifetime:** 86400 segundos (24 horas) — cierre de sesión forzado independientemente de actividad
- **Inactivity Session Lifetime:** 1800 segundos (30 minutos) — cierre automático por inactividad
- **Refresh Token Absolute Expiry:** 2592000 segundos (30 días)

#### 4.2 — Integrar Auth0 en `apps/frontend` (Next.js) — Patrón BFF

**Principio:** el browser NUNCA ve el JWT. El token vive exclusivamente en una cookie `httpOnly + Secure + SameSite=Strict` cifrada por el SDK. JavaScript del lado cliente no puede leerla.

- Instalar `@auth0/nextjs-auth0`.
- Reemplazar el `middleware.ts` actual (que usa Supabase) con el middleware de Auth0.
- Crear el route handler en `app/api/auth/[auth0]/route.ts`.
- Reemplazar todos los `supabase.auth.getUser()` en Server Components y Server Actions con `getSession()` de Auth0.
- La redirección post-login debe seguir el mismo flujo: leer el custom claim `role` → redirigir a `/admin`, `/doctor`, o `/patient`.

**Patrón BFF — reglas de implementación obligatorias:**
- Crear `apps/frontend/src/lib/api-client.server.ts` (archivo con sufijo `.server.ts` para garantizar que Next.js nunca lo incluya en el bundle del cliente):
  ```typescript
  import { getAccessToken } from '@auth0/nextjs-auth0';

  export async function serverFetch(path: string, options?: RequestInit) {
    const { accessToken } = await getAccessToken();
    return fetch(`${process.env.BACKEND_INTERNAL_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }
  ```
- `BACKEND_INTERNAL_URL` es una variable de entorno del servidor (sin prefijo `NEXT_PUBLIC_`). El cliente nunca sabe que NestJS existe.
- Todos los Server Actions y Route Handlers del frontend usan `serverFetch` — NUNCA `fetch` directo a NestJS desde componentes cliente.
- El refresh silencioso del access token lo maneja `@auth0/nextjs-auth0` automáticamente en el servidor cuando el token expira — el usuario no percibe nada.
- Configurar cookie de sesión en `auth0.config.ts`:
  ```typescript
  export default {
    session: {
      rolling: true,           // extiende sesión con actividad
      rollingDuration: 1800,   // 30 min inactividad → logout
      absoluteDuration: 86400, // 24h máximo absoluto
    },
    routes: { callback: '/api/auth/callback', login: '/api/auth/login', logout: '/api/auth/logout' },
  };
  ```

#### 4.3 — Integrar Auth0 en `apps/backend` (NestJS)
- Instalar `passport`, `passport-jwt`, `@nestjs/passport`, `jwks-rsa`.
- Crear `JwtStrategy` que valide el JWT de Auth0 usando el endpoint JWKS público del tenant.
- El `JwtStrategy` debe extraer el `sub` (user ID de Auth0), el `role` (custom claim), y el `email`.
- Crear `AuthGuard('jwt')` y `RolesGuard` globales.
- El `CurrentUser` decorator debe retornar el payload del JWT para usar en los controllers.

#### 4.4 — Migración de usuarios de Supabase Auth a Auth0
- Exportar los usuarios existentes de Supabase Auth.
- Crear un script de migración en `tools/scripts/migrate-users-to-auth0.ts` que:
  1. Lea cada usuario de Supabase
  2. Llame a la Auth0 Management API para crear el usuario preservando su email
  3. Actualice la tabla `profiles` en PostgreSQL con el nuevo `auth0_user_id`
- Los usuarios recibirán un magic link en su primer login (no necesitan crear contraseña).

#### 4.5 — Un dispositivo activo por usuario

**Objetivo:** si el doctor inicia sesión en un nuevo dispositivo o browser, la sesión anterior queda invalidada automáticamente. Previene uso compartido de cuentas y reduce superficie de ataque por sesiones abandonadas.

**Implementación:**

1. **Tabla en Redis** con TTL igual al `absoluteDuration` de la sesión:
   ```
   active_session:{userId}  →  { sessionId, deviceInfo, ip, loginAt }
   ```

2. **Auth0 Action (Post-Login trigger)** que llama al backend para registrar la nueva sesión:
   ```javascript
   // Auth0 Action: registrar sesión activa
   exports.onExecutePostLogin = async (event, api) => {
     await fetch(`${event.secrets.BACKEND_INTERNAL_URL}/auth/register-session`, {
       method: 'POST',
       headers: { 'x-action-secret': event.secrets.ACTION_SECRET },
       body: JSON.stringify({
         userId: event.user.user_id,
         sessionId: event.transaction.id,
         ip: event.request.ip,
         userAgent: event.request.user_agent,
       }),
     });
   };
   ```

3. **NestJS endpoint** `POST /auth/register-session` (protegido por `x-action-secret`, no por JWT):
   - Guarda en Redis: `SET active_session:{userId} {sessionData} EX 86400`
   - Si ya existía una sesión anterior, la sobreescribe (la anterior queda huérfana y expira)

4. **Guard global en NestJS** `ActiveSessionGuard` que en cada request verifica:
   - Extrae `sub` (userId) y `sid` (session ID) del JWT
   - Consulta Redis: `GET active_session:{userId}`
   - Si el `sessionId` del JWT no coincide con el de Redis → retorna `401 SESSION_SUPERSEDED`
   - El frontend recibe ese error y ejecuta logout limpio

5. **En el frontend**, `apiClient.server.ts` maneja el error `SESSION_SUPERSEDED` con un redirect a `/api/auth/logout?message=session_superseded` que muestra al usuario: *"Tu sesión fue iniciada en otro dispositivo."*

#### 4.6 — Encriptación a nivel de campo en los Sequelize Models
- Crea `libs/shared-crypto/src/field-encryption.ts` con las funciones:
  - `encrypt(plaintext: string, key: Buffer): string` — AES-256-GCM, retorna `iv:ciphertext:authTag` en base64
  - `decrypt(encoded: string, key: Buffer): string` — falla explícitamente si el authTag no coincide (tampering detectado)
  - `hashForSearch(plaintext: string, secret: string): string` — HMAC-SHA256 determinístico
- **La clave de encriptación en producción:** el Service Account del Cloud Run backend tiene el rol IAM `roles/secretmanager.secretAccessor`. Al arrancar NestJS, `EncryptionKeyService` llama a la API de Secret Manager una sola vez y guarda la clave en memoria. Nunca toca disco. NUNCA configurar `ENCRYPTION_KEY` como variable de entorno en producción.
- Implementa los hooks de Sequelize en los modelos afectados:
  - `beforeCreate` y `beforeUpdate`: encriptar campos sensibles, actualizar `*_search_hash`
  - `afterFind`: decriptar campos sensibles automáticamente
- Los campos `*_search_hash` deben tener índice en la base de datos para búsquedas por cédula o nombre.

#### 4.7 — Cloudflare — Capa de seguridad perimetral (plan gratuito)

Cloudflare se posiciona entre el usuario y el Cloud Run del frontend. El backend (NestJS) **nunca** pasa por Cloudflare — es interno y no tiene URL pública.

```
Usuario → Cloudflare (DNS + WAF + DDoS) → Cloud Run frontend (Next.js) → VPC interna → Cloud Run backend (NestJS)
```

**Configuración en Cloudflare (Free tier):**

1. **DNS:** Apuntar el dominio a la URL del Cloud Run de Next.js con proxy habilitado (nube naranja). SSL/TLS en modo `Full (Strict)`.

2. **WAF — Managed Rules (gratis desde 2022):**
   - Habilitar el ruleset `Cloudflare Managed Ruleset` — bloquea automáticamente OWASP Top 10, SQLi, XSS conocidos
   - Habilitar `Cloudflare OWASP Core Ruleset` — reglas de detección de ataques web estándar
   - Sensitivity: `Medium` para inicio (ajustar si hay falsos positivos)

3. **Bot Fight Mode (gratis):**
   - Habilitar en Security → Bots — bloquea bots de scraping automatizados conocidos antes de que lleguen al servidor

4. **DDoS Protection:** activo automáticamente en el plan gratuito — mitiga ataques volumétricos sin configuración adicional

5. **Cloudflare Turnstile (gratis, reemplaza CAPTCHA):**
   - Integrar en los formularios de mayor riesgo: `/register` (registro de médicos), `/book/[doctorId]` (booking público), `/login` (si se agrega formulario de email)
   - Turnstile es invisible para usuarios reales — solo desafía cuando detecta comportamiento sospechoso
   - Instalar `@marsidev/react-turnstile` en el frontend
   - Validar el token de Turnstile en el Server Action antes de procesar el formulario: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`

6. **Security Headers via Cloudflare Transform Rules (gratis):**
   Agregar estos headers a todas las respuestas:
   ```
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   Referrer-Policy: strict-origin-when-cross-origin
   Permissions-Policy: camera=(), microphone=(), geolocation=()
   ```

7. **Analytics (gratis):** Cloudflare provee métricas de tráfico, amenazas bloqueadas, y distribución geográfica sin JavaScript adicional en la página — no impacta Core Web Vitals.

8. **Rate Limiting básico via WAF Custom Rules (gratis):**
   Crear reglas WAF personalizadas para las rutas más expuestas:
   - `(http.request.uri.path eq "/api/auth/login")` → bloquear si más de 10 requests/minuto por IP
   - `(http.request.uri.path contains "/book/")` → challenge si más de 30 requests/minuto por IP
   Nota: el rate limiting avanzado es de pago, pero las Custom Rules del plan gratuito permiten reglas básicas efectivas.

**Variables de entorno adicionales necesarias:**
```env
# apps/frontend
CLOUDFLARE_TURNSTILE_SECRET_KEY=   # para validación server-side del Turnstile
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=  # este sí es público — solo identifica el sitio
```

#### 4.6 — Estrategia de caché con Redis

**Caché global (Cache Manager de NestJS):**
- Instalar `@nestjs/cache-manager`, `cache-manager-redis-yet`.
- Configurar `CacheModule.registerAsync()` con la URL de Redis.
- TTLs por tipo de dato:
  - Datos de configuración (planes, features, especialidades): **1 hora**
  - Perfil del doctor (settings, logo): **15 minutos**
  - Slots de disponibilidad de agenda: **2 minutos** (datos muy dinámicos)
  - Dashboard KPIs del admin: **5 minutos**
  - Tasa USDT/Binance: **10 minutos** (con invalidación manual)

**Invalidación de caché por evento:**
- Cada vez que se actualiza un perfil, invalidar la key `profile:{doctorId}`.
- Cada vez que se crea/cancela una cita, invalidar `slots:{doctorId}:{date}`.
- Cada vez que se cobra una suscripción, invalidar `dashboard:admin:*`.

**Caché a nivel de ruta (Next.js `apps/frontend`):**
- Usar `revalidate` de Next.js para las páginas que muestran datos semi-estáticos.
- La landing page (`/`) debe tener `revalidate: 3600` (revalidar cada hora).
- Páginas de booking público (`/book/[doctorId]`): `revalidate: 300` (5 minutos).
- Dashboards de doctor y admin: sin caché estático (datos en tiempo real).

**Instrucción para Claude:** Analiza cada endpoint del NestJS y determina si aplica `@UseInterceptors(CacheInterceptor)`. Documenta en `memory-bank/04-api-documentation.md` qué endpoints tienen caché y con qué TTL.

**Verificación de fase:**
- [ ] Login con Auth0 magic link funciona end-to-end
- [ ] `document.cookie` en DevTools del browser NO muestra el token JWT (solo la cookie opaca de sesión)
- [ ] Abrir DevTools → Network: ningún request del browser muestra `Authorization: Bearer` en los headers (solo los requests de Next.js server-to-server lo tienen)
- [ ] Una llamada directa a la URL de NestJS desde el browser (o curl externo) retorna conexión rechazada — el backend no es alcanzable desde internet
- [ ] Iniciar sesión en un segundo dispositivo invalida la sesión del primero con mensaje `SESSION_SUPERSEDED`
- [ ] `patients.cedula` está cifrado en la base de datos — un dump directo de la tabla muestra ciphertext, no datos reales
- [ ] Formularios de booking y registro muestran y validan Cloudflare Turnstile
- [ ] Cloudflare dashboard muestra el dominio activo con proxy habilitado y WAF managed rules activadas

---

## FASE 5: Migración a Google Cloud Platform (GCP)

**Objetivo:** Reemplazar Supabase Cloud y Vercel con una infraestructura GCP controlada.
**Prerrequisito:** Fase 4 completada y probada en entorno local.

### Instrucciones para Claude Code

#### 5.1 — Auditoría de dependencias Supabase a reemplazar
- **Supabase Auth:** Reemplazado por Auth0 (Fase 4).
- **Supabase PostgreSQL:** Reemplazado por Cloud SQL (PostgreSQL 16) en GCP.
- **Supabase Storage:** Reemplazado por Google Cloud Storage (GCS) con signed URLs.
- **Supabase RLS Policies:** Reemplazadas por la lógica de autorización en NestJS (Guards + Scopes).
- **Supabase Realtime:** Evaluar si se necesita — alternativa: WebSockets en NestJS con `@nestjs/websockets`.
- **Supabase Edge Functions:** Reemplazadas por Cloud Functions o Cloud Run Jobs (para crons).

#### 5.2 — Infraestructura como código (IaC) con Terraform
- Crear `infrastructure/terraform/` con los siguientes módulos:
  - `modules/cloud-sql/` — Instancia PostgreSQL 16 en Cloud SQL (High Availability)
  - `modules/cloud-run/` — Servicios para `apps/frontend` y `apps/backend`
  - `modules/redis/` — Memorystore for Redis
  - `modules/cloud-storage/` — Buckets para archivos de pacientes (con lifecycle policies)
  - `modules/secret-manager/` — Secrets: encryption key, Auth0 secrets, DB password
  - `modules/vpc/` — Red privada para que Cloud Run → Cloud SQL no salga por internet
- Variables de Terraform separadas por entorno: `environments/dev/`, `environments/prod/`.

**Instrucción para Claude:** NO generar el código Terraform aún. Primero documentar en `memory-bank/01-architecture.md` el diagrama de arquitectura GCP con todos los servicios y sus relaciones de red.

#### 5.3 — Cloud SQL (PostgreSQL)
- Tipo de instancia: `db-standard-2` para producción.
- Habilitar `point-in-time recovery` y backups automáticos diarios.
- VPC privada — Cloud Run se conecta via `Cloud SQL Auth Proxy` o `Cloud SQL connector`.
- La `DATABASE_URL` en producción usará el socket Unix del proxy, no TCP.
- Ejecutar las migrations de Sequelize como parte del pipeline de GitHub Actions (step previo al deploy del servicio `api`).

#### 5.4 — Cloud Run (apps/frontend y apps/backend)
- Cada app tiene su propio servicio en Cloud Run.

**`apps/frontend` (Next.js):**
- Imagen Docker multi-stage con `node:20-alpine`.
- `next build` produce output standalone (`output: 'standalone'` en `next.config.ts`).
- Variables de entorno inyectadas desde Secret Manager.
- **Ingress:** `--ingress=all` — acepta tráfico público (llega desde Cloudflare).
- Configurar el header `CF-Connecting-IP` para extraer la IP real del usuario (Cloudflare lo inyecta).

**`apps/backend` (NestJS):**
- Imagen Docker multi-stage con `node:20-alpine`.
- `nest build` → ejecutar imagen con Node.js.
- **Ingress: `--ingress=internal`** — este es el cambio crítico. Cloud Run rechaza cualquier request que NO provenga de la red VPC interna del proyecto. El backend no tiene URL pública accesible desde internet bajo ninguna circunstancia.
- Para que Next.js pueda llamar a NestJS internamente, configurar Serverless VPC Access connector y usar la URL interna de Cloud Run: `https://backend-<hash>-<region>.a.run.app` — esta URL funciona solo dentro de la VPC.
- La variable `BACKEND_INTERNAL_URL` en el frontend apunta a esta URL interna.

**Escalado:**
- Configurar Cloud Run para escalar a 0 instancias en entorno dev (ahorro de costos).
- En prod: mínimo 1 instancia, máximo 10.
- El backend puede escalar más agresivamente que el frontend si hay alta carga de API.

#### 5.5 — Google Cloud Storage (reemplaza Supabase Storage)
- Crear un bucket privado para archivos de pacientes: `delta-medical-patients-files`.
- Los archivos NUNCA son públicos — acceso via signed URLs generadas por el backend (expiración: 15 minutos).
- Habilitar Object Versioning en el bucket.
- Habilitar Cloud Audit Logs para accesos al bucket.
- Crear un bucket separado para assets públicos (logos de doctores): `delta-medical-public-assets`.
- Los logos de doctores sí son públicos (no contienen datos sensibles).

#### 5.6 — Pipeline CI/CD con GitHub Actions + Git Flow

Crear los siguientes workflows en `.github/workflows/`:

**`ci.yml` — Integración continua (se dispara en todo PR hacia `develop` y `main`)**
Pasos en orden:
1. Checkout del repo con `fetch-depth: 0` (necesario para que `nx affected` compare correctamente).
2. Setup de Node.js (versión LTS) con caché de `npm`.
3. `nx affected --target=lint --base=origin/develop` — lint solo de proyectos afectados.
4. `nx affected --target=test --base=origin/develop` — tests unitarios de proyectos afectados.
5. `nx affected --target=build --base=origin/develop` — build para verificar compilación.
6. El workflow falla si cualquier step retorna error — el PR queda bloqueado hasta que se corrija.

**`deploy-staging.yml` — Deploy a staging (se dispara en `push` a `develop`)**
Pasos en orden:
1. Checkout + setup Node.js.
2. Autenticación con GCP usando `google-github-actions/auth` y un Service Account dedicado para staging (credenciales almacenadas como GitHub Secret `GCP_SA_KEY_STAGING`).
3. `nx affected --target=build --base=HEAD~1` — build de lo que cambió.
4. `nx affected --target=docker-build` — construir imagen Docker de las apps afectadas.
5. Push de la imagen al Artifact Registry de GCP: `us-central1-docker.pkg.dev/<project>/delta-medical/<app>:develop-<sha>`.
6. Ejecutar migrations: `gcloud run jobs execute migrate-db --region=us-central1 --wait` (Cloud Run Job dedicado para migrations).
7. `gcloud run deploy <service> --image=<image> --region=us-central1 --project=<staging-project>` — deploy del servicio actualizado.
8. Notificación de resultado al PR (comentario automático con la URL del servicio en staging).

**`deploy-production.yml` — Deploy a producción (se dispara en `push` a `main`)**
Pasos en orden:
1. Checkout + setup Node.js.
2. Autenticación con GCP usando `google-github-actions/auth` con Service Account de producción (`GCP_SA_KEY_PROD`).
3. Detectar qué apps cambiaron comparando el merge commit contra el commit anterior en `main`.
4. Build + push de imágenes al Artifact Registry con tag `main-<sha>` y adicionalmente el tag `latest`.
5. Ejecutar migrations con `--wait` (el pipeline se detiene si la migration falla — rollback automático de la migration, NO del deploy previo).
6. Deploy a Cloud Run de producción con `--no-traffic` primero (traffic splitting: 0% al nuevo, 100% al anterior).
7. Smoke test: esperar 30 segundos y hacer `curl` al endpoint de health check (`GET /api/health`).
8. Si el smoke test pasa: cambiar el tráfico al 100% de la nueva revisión con `gcloud run services update-traffic`.
9. Si el smoke test falla: el pipeline falla y el tráfico sigue en la revisión anterior — notificar al equipo via GitHub issue automático.

**`hotfix-flow.yml` — Validación extra para ramas `hotfix/*`**
Se dispara en `push` a ramas que comiencen con `hotfix/`:
1. CI completo (lint + test + build) igual que `ci.yml`.
2. Verificar que la rama `hotfix/*` salió de `main` (no de `develop`).
3. Generar un resumen del diff contra `main` en el PR como recordatorio de impacto.

**Secretos de GitHub requeridos (configurar en Settings > Secrets):**
- `GCP_SA_KEY_STAGING` — JSON del Service Account de GCP para staging
- `GCP_SA_KEY_PROD` — JSON del Service Account de GCP para producción
- `GCP_PROJECT_ID_STAGING` — ID del proyecto GCP de staging
- `GCP_PROJECT_ID_PROD` — ID del proyecto GCP de producción
- `GCP_REGION` — región de GCP (ej: `us-central1`)

**Flujo completo Git Flow → GitHub Actions:**
```
feature/nueva-funcionalidad
        │ PR hacia develop
        ▼
    develop ──────────────────── push → deploy-staging.yml → Cloud Run staging
        │ PR hacia main (release)
        ▼
      main ─────────────────────── push → deploy-production.yml → Cloud Run prod
        ▲
hotfix/bug-critico (sale de main)
        │ PR hacia main (y back-merge a develop)
        └─ push → hotfix-flow.yml → deploy-production.yml → Cloud Run prod
```

**Nota sobre NX Affected en GitHub Actions:**
- En `push` a `develop` o `main`: comparar con `HEAD~1` (el commit anterior).
- En `pull_request`: comparar con `origin/<base-branch>` (la rama destino del PR).
- Configurar `nxCloudAccessToken` en `nx.json` si se usa NX Cloud para caché distribuida de builds (recomendado para acelerar CI).

#### 5.7 — Migración de datos de Supabase a Cloud SQL
- Crear un script `tools/scripts/migrate-supabase-to-cloudsql.ts` que:
  1. Conecte a Supabase (source) y a Cloud SQL (target)
  2. Migre tabla por tabla en orden de dependencias (sin violar FKs)
  3. Durante la migración de `patients`, `ehr_records`, y `consultations`, encripte los campos sensibles con AES-256-GCM
  4. Verifique conteos antes y después
  5. Genere un reporte de migración
- La migración debe ejecutarse en una ventana de mantenimiento con el frontend en modo "readonly".

**Verificación de fase:** `terraform plan` debe mostrar el plan sin errores. `gcloud run services list` debe mostrar ambos servicios desplegados. Los datos migrados deben ser accesibles desde la app con los campos sensibles encriptados.

---

## FASE 6: Performance y Optimización

**Objetivo:** Implementar lazy loading, optimización de rendering, y estrategias de caché a nivel de sitio.
**Prerrequisito:** Fase 5 completada (o puede hacerse en paralelo con Fase 4/5 en el frontend).

### Instrucciones para Claude Code

#### 6.1 — Code Splitting y Lazy Loading en Next.js
- Audita el `apps/frontend` con `next build && next analyze` para identificar los bundles más pesados.
- Aplica `dynamic(() => import(...), { loading: () => <Skeleton /> })` a:
  - El calendario de la agenda (componente grande de terceros)
  - Los gráficos de Recharts en el dashboard
  - Los modales grandes (NewDoctorModal, DoctorDetailDrawer)
  - El editor de bloques de consulta
  - El CommandPalette de búsqueda
- Crea componentes `Skeleton` para cada uno de los anteriores — evitar Cumulative Layout Shift (CLS).

#### 6.2 — Optimización de imágenes
- Reemplaza todas las etiquetas `<img>` con el componente `<Image>` de Next.js.
- Configura `next.config.ts` con `images.remotePatterns` para GCS (logos de doctores).
- Habilita WebP/AVIF automático via `images.formats: ['image/avif', 'image/webp']`.
- Los avatares de doctores deben cargarse con `loading="lazy"` excepto el avatar del perfil principal.

#### 6.3 — Caché HTTP y headers
- Configura headers de caché en `next.config.ts` para assets estáticos (`/_next/static/*`): `Cache-Control: public, max-age=31536000, immutable`.
- Para la landing page: `Cache-Control: public, max-age=0, must-revalidate` (ya configurado, mantener).
- Configura `stale-while-revalidate` para las páginas de booking público.

#### 6.4 — Optimización de queries a la base de datos
- Audita los N+1 queries: busca todos los lugares donde se hace un loop con queries adentro.
- Usa `include` de Sequelize para eager loading de relaciones necesarias.
- Crea índices en PostgreSQL para:
  - `appointments(doctor_id, scheduled_at)` — consultas de agenda
  - `patients(doctor_id)` — lista de pacientes por doctor
  - `patients(cedula_search_hash)` — búsqueda por cédula
  - `consultations(doctor_id, consultation_date)` — historial de consultas
  - `subscriptions(doctor_id, status)` — verificación de suscripción activa
- Documenta cada índice en `memory-bank/01-architecture.md`.

#### 6.5 — Server-side rendering y Suspense
- Convierte las páginas de dashboard (`/doctor/page.tsx`, `/admin/page.tsx`) a Server Components que hagan el fetch inicial en el servidor.
- Usa `<Suspense>` boundaries con Skeletons para partes de la página que tienen datos menos críticos.
- El layout del doctor y admin deben pre-cargar el perfil y los feature flags en el servidor — evitar waterfalls en el cliente.

#### 6.6 — Service Worker y PWA (opcional pero recomendado)
- Configura `next-pwa` para cachear assets estáticos y el shell de la app.
- El Service Worker debe cachear la última versión de la agenda del doctor para funcionamiento offline básico.
- Habilita notificaciones push via Web Push API (integrar con el módulo de notificaciones del backend).

**Verificación de fase:** Lighthouse score de las páginas principales debe ser ≥ 80 en Performance. No debe haber N+1 queries evidentes. El bundle principal (`main.js`) debe ser < 200KB gzipped.

---

## FASE 7: MVP Delta Saas — Nuevas Funcionalidades

**Objetivo:** Implementar los requerimientos del MVP Delta Saas definidos en el archivo de referencia, sobre la nueva arquitectura migrada.
**Prerrequisito:** Fases 1-4 completadas (mínimo Fase 3 para poder agregar endpoints).

### Mapa de requerimientos MVP → Implementación

#### 7.1 — Landing Page
- Quitar el botón de paciente del nav.
- Actualizar el contador de especialistas con dato real de la API.
- Actualizar la sección "Cómo funciona" con el copy correcto (3 pasos).
- Agregar sección de especialidades más comunes en Venezuela (datos en `shared-utils/`).
- Implementar la página de precios con 3 planes: Free Trial, Especialista ($30), Clínica (contacto ventas).

#### 7.2 — Dashboard Admin (nuevas métricas)
- Endpoint `GET /admin/dashboard/stats` que retorne:
  - Cantidad de especialistas (total, activos, fríos, inactivos)
  - Cantidad de citas agendadas (últimos 30 días)
  - Cantidad de pacientes registrados
  - Gráfica de crecimiento de especialistas (datos históricos por mes)
  - Gráfica de crecimiento de pacientes
  - Resumen CxC y cobrado a especialistas
- La definición de "activo/frío/inactivo" basada en `last_sign_in_at` de Auth0 (webhook para mantener sincronizado).

#### 7.3 — Gestión de especialistas con estados
- En el listado de médicos, agregar columna de "Estado" calculada:
  - **Activo:** último ingreso hace 7 días o menos
  - **Frío:** entre 7 y 30 días sin ingresar
  - **Inactivo:** más de 30 días sin ingresar
- Columna de "Vencimiento" (fecha de expiración de suscripción).
- Botón de exportar en Excel y PDF.

#### 7.4 — Configuración de tasa USDT/Binance
- Endpoint `POST /admin/settings/usdt-rate` para actualizar la tasa.
- Endpoint `GET /settings/usdt-rate` (público) para que la app del doctor y el booking puedan consultarla.
- La tasa se almacena en Redis con TTL de 10 minutos y en la tabla `settings`.
- En el booking público, mostrar el precio en USD y en Bs equivalente según la tasa actual.

#### 7.5 — Dashboard Especialista mejorado
- Agregar botón "Registrar Pago" en el dashboard.
- Agregar botón "Registrar Gasto" en el dashboard.
- Notificaciones cuando se aproximan citas (30 min antes) via WebSockets.
- "Cita actual": mostrar la cita del momento de forma destacada, con botón de abrir consulta.

#### 7.6 — Agenda del Especialista — Mejoras
- Eliminar los filtros de pagos de la vista de agenda.
- Agregar filtros: "Completadas" y "Canceladas".
- KPIs de agenda (marcados como "deseable" en el MVP):
  - Horas en consulta (mes actual)
  - Month over Month de citas
  - Promedio de consultas por día
  - Mejor día de la semana

#### 7.7 — Consultorio — Historial del Paciente
- En el historial, al hacer click en una consulta anterior, abrir la consulta en modo lectura/edición.
- Seguimientos: adjuntos relevantes del historial del paciente, cargados en consulta o por el paciente.
- Datos médicos del paciente editables desde dentro de una consulta activa.

#### 7.8 — Sistema de Plantillas para PDF
- Nueva tabla `doctor_templates` con: encabezado, logo, firma, sello, pie de página, matrícula, tipografía, color, tamaño de hoja.
- Endpoint `POST /doctor/templates` para crear/actualizar plantilla.
- Tipos de documentos con orientación configurable por bloque: Informe, Recipe, Indicaciones.
- Generación de PDF usando `@react-pdf/renderer` en el backend.

#### 7.9 — Finanzas del Especialista — Mejoras
- Agregar sección "Por ingresar" (pagos pendientes).
- Poder generar ingresos diferentes a consultas (asociados a un paciente).
- Revisar y corregir la gráfica de finanzas (bug reportado en MVP).

#### 7.10 — Cobros — Mejoras
- Filtro de estado de consulta en la vista de cobros.
- Botón de cobro por WhatsApp: genera un mensaje pre-formateado con el link de pago y lo abre en WhatsApp Web.
  - Investigar integración con WhatsApp Business API (número único de Delta o número del especialista).

#### 7.11 — Servicios del Especialista
- Agregar campo de descripción del servicio (se muestra en el booking público).

#### 7.12 — Base de datos — Limpieza
- Quitar el campo `ID de cita` visible en la UI (mantenerlo en BD pero no mostrarlo al usuario).
- Revisar y eliminar los campos marcados como eliminados en el CLAUDE.md.

---

## FASE 8: Mantenimiento del Memory Bank y Reglas de Agentes

> **Nota:** La inicialización del Memory Bank y la creación de `CLAUDE.md` y `.cursor/rules/` se realizan en la **Fase 1** (secciones 1.7, 1.8, y 1.9). Esta fase cubre el mantenimiento continuo a lo largo de todo el proyecto.

**Objetivo:** Garantizar que el Memory Bank y las reglas de agentes se mantienen actualizadas a medida que el proyecto evoluciona. Los archivos del Memory Bank son documentos vivos — deben reflejar siempre el estado real del proyecto.
**Prerrequisito:** Fase 1 completada.

### Instrucciones para Claude Code — Mantenimiento continuo

#### 8.1 — Protocolo de actualización obligatorio
Después de cada sesión de trabajo significativa, verificar y actualizar según corresponda:

| Si se hizo... | Actualizar este archivo |
|---------------|------------------------|
| Nuevo endpoint o cambio de API | `memory-bank/04-api-documentation.md` |
| Nueva decisión de arquitectura o ADR | `memory-bank/01-architecture.md` |
| Nuevo módulo, componente, o schema Zod | `memory-bank/02-components.md` |
| Fase del plan completada | `memory-bank/05-progress-log.md` |
| Ítem del MVP implementado o priorizado | `memory-bank/06-mvp-planning.md` |
| Cambio en proceso de desarrollo | `memory-bank/03-development-process.md` |
| Cambio en el stack o visión del proyecto | `memory-bank/00-project-overview.md` |

#### 8.2 — Mantenimiento de `memory-bank/06-mvp-planning.md`
Este es el archivo más crítico para priorización. Debe estar siempre actualizado con:
- Estado de cada ítem del MVP: `pendiente | en-progreso | completado | descartado`
- Fecha en que se inició y se completó cada ítem
- Notas técnicas relevantes (decisiones tomadas, limitaciones encontradas)
- Nuevos requerimientos aprobados con su justificación de negocio

**Regla:** Antes de iniciar cualquier nueva funcionalidad, verificar que existe en `06-mvp-planning.md`. Si no existe, agregarla con justificación antes de implementar.

#### 8.3 — Revisión periódica de las reglas de agentes
Cada vez que se adopte un nuevo patrón, convención, o se descubra un anti-pattern recurrente:
- Actualizar el archivo `.cursor/rules/` correspondiente
- Actualizar la sección relevante de `CLAUDE.md`
- Agregar una nota en `memory-bank/05-progress-log.md` con la razón del cambio

#### 8.4 — Verificación de consistencia del Memory Bank
Antes de cada release (merge a `main`), verificar que:
- Los endpoints en `04-api-documentation.md` coinciden con los controllers reales
- La arquitectura en `01-architecture.md` refleja la estructura real del proyecto
- El `06-mvp-planning.md` tiene correctamente marcado lo que se incluyó en el release
- El `05-progress-log.md` tiene la entrada de este release con fecha y descripción

---

## APÉNDICE A — Variables de entorno requeridas

### `apps/frontend` (.env.local)
```env
# Auth0 — todos son server-side (sin NEXT_PUBLIC_)
AUTH0_SECRET=                          # Generado: openssl rand -hex 32 — cifra la cookie de sesión
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<tenant>.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

# Backend — URL interna, nunca expuesta al cliente
BACKEND_INTERNAL_URL=http://localhost:3001   # dev: localhost | prod: URL interna VPC Cloud Run
# NOTA: NO usar NEXT_PUBLIC_API_URL — el cliente nunca debe saber que NestJS existe

# Cloudflare Turnstile — solo el site key es público
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=   # identifica el sitio (no es un secreto)
CLOUDFLARE_TURNSTILE_SECRET_KEY=             # para validación server-side — NO exponer al cliente

# Entorno
NEXT_PUBLIC_ENV=development
```

### `apps/backend` (.env)
```env
# Database
DATABASE_URL=postgres://delta:delta@localhost:5432/deltamedical

# Auth0
AUTH0_DOMAIN=<tenant>.auth0.com
AUTH0_AUDIENCE=https://api.deltamedical.com

# Auth0 Action Secret — para el endpoint /auth/register-session
AUTH0_ACTION_SECRET=                   # Generado: openssl rand -hex 32

# Redis
REDIS_URL=redis://localhost:6379

# Encryption
# EN DESARROLLO: variables locales aceptables
# EN PRODUCCIÓN: estas variables NO deben existir — el backend las obtiene de GCP Secret Manager via IAM
ENCRYPTION_KEY=                        # 32 bytes en hex: openssl rand -hex 32
ENCRYPTION_HMAC_SECRET=                # Diferente al anterior — openssl rand -hex 32

# GCS (en prod)
GCS_BUCKET_NAME=delta-medical-patients-files
GCS_PUBLIC_BUCKET_NAME=delta-medical-public-assets
GOOGLE_APPLICATION_CREDENTIALS=       # Path al service account JSON (solo dev)

# App
NODE_ENV=development
PORT=3001
```

---

## APÉNDICE B — Orden de ejecución recomendado

Para un equipo de 1-2 personas trabajando en este proyecto, el orden recomendado es:

```
Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 7 (iterativo)
                    ↕           ↕         ↕
                  Fase 6     Fase 9    Fase 8 (continuo)
              (paralelo)  (paralelo)
```

- **Fase 0:** Análisis puro — no se toca código, solo se recolecta información.
- **Fase 1:** La más importante — estructura NX, Memory Bank, reglas de agentes. Sin esto Claude y Cursor trabajarán sin contexto. No saltarla ni abreviarla.
- **Fase 2:** Tipos Zod compartidos — en paralelo con Fase 3 (el backend los consume a medida que se crean).
- **Fase 3:** Backend NestJS con DDD — el frontend sigue en Supabase durante esta fase como fallback.
- **Fase 4:** Auth0 + encriptación — requiere Fase 3 completa. Frontend puede integrarse en paralelo.
- **Fase 5:** GCP — requiere que todo esté probado y estable localmente.
- **Fase 6:** Performance frontend — independiente del backend, se puede trabajar en cualquier momento.
- **Fase 7:** MVP features — comienza desde Fase 3 e itera continuamente. Cada sprint prioriza según `memory-bank/06-mvp-planning.md`.
- **Fase 8:** Sin fecha de fin — mantenimiento continuo del Memory Bank durante toda la vida del proyecto.
- **Fase 9:** Observabilidad, analytics y notificaciones — puede iniciarse desde Fase 3. Sentry y Resend/Twilio son especialmente útiles desde el primer usuario en staging.

---

## FASE 9: Observabilidad, Analytics y Notificaciones

**Objetivo:** Instrumentar la aplicación completa para medir comportamiento de usuarios, rastrear errores en frontend y backend, monitorear costos de IA, y establecer el stack de comunicación (email + WhatsApp) sobre el que se construirán los recordatorios y notificaciones del MVP.
**Prerrequisito:** Fase 3 (backend operativo). Puede ejecutarse en paralelo con Fases 4-7.

### Instrucciones para Claude Code

---

#### 9.1 — Sentry: rastreo de errores frontend y backend

**Backend (NestJS):**
- Instalar `@sentry/nestjs` y `@sentry/profiling-node`.
- Inicializar Sentry en `main.ts` antes del bootstrap de NestJS, con `dsn` cargado desde GCP Secret Manager.
- Configurar `SentryModule.forRootAsync()` con:
  - `tracesSampleRate: 0.1` en producción (10% de transacciones trazadas — ajustar según volumen)
  - `profilesSampleRate: 0.1` — profiling de performance
  - `environment: process.env.NODE_ENV` — separar errores de staging y producción en Sentry
- Integrar con el `GlobalExceptionFilter`: en el catch, llamar a `Sentry.captureException(error)` antes de formatear la respuesta.
- **Datos sensibles:** configurar `beforeSend` para redactar automáticamente los campos `cedula`, `diagnosis`, `treatment`, `medication_name`, `phone`, y `email` de los payloads antes de enviarlos a Sentry. NUNCA enviar PII de pacientes a servicios externos.
- Crear alertas en Sentry para: error rate > 1% en producción, new issue detected, regression detected.

**Frontend (Next.js):**
- Instalar `@sentry/nextjs` y ejecutar el wizard de configuración (`npx @sentry/wizard@latest -i nextjs`).
- Configurar `sentry.client.config.ts`, `sentry.server.config.ts`, y `sentry.edge.config.ts`.
- Habilitar Session Replay con `replaysSessionSampleRate: 0.01` y `replaysOnErrorSampleRate: 0.5` (replay completo cuando hay error).
- Configurar `tunnel` route (`/api/sentry-tunnel`) para evitar que adblockers bloqueen los reportes.
- Aplicar el mismo `beforeSend` de redacción de datos sensibles que en el backend.
- Crear un componente `<ErrorBoundary>` global que use `Sentry.ErrorBoundary` como wrapper de la app.

---

#### 9.2 — Google Analytics 4: comportamiento de usuarios

- Instalar `@next/third-parties` (la forma oficial de Next.js para cargar GA4 sin penalizar Core Web Vitals).
- Agregar `<GoogleAnalytics gaId="G-XXXXXXXXXX" />` en el `layout.tsx` raíz usando `@next/third-parties/google`.
- Configurar eventos personalizados para los flujos críticos del negocio:
  - `booking_started` — cuando el paciente abre el formulario de booking
  - `booking_completed` — cuando se crea la cita exitosamente
  - `booking_abandoned` — si el usuario cierra el formulario antes de completar
  - `doctor_registered` — cuando un médico completa el registro
  - `subscription_upgraded` — cuando se cambia de plan (post-beta)
  - `consultation_started` — cuando el doctor inicia una consulta
  - `document_generated` — cuando se genera un informe/receta PDF
- Configurar conversiones en GA4 para `booking_completed` y `doctor_registered`.
- **Privacidad:** activar la anonimización de IPs en GA4 (`anonymize_ip: true`). No enviar cédulas, nombres de pacientes, ni diagnósticos como parámetros de eventos.
- Excluir las rutas `/admin/*` y `/doctor/consultations/*` del tracking — son interfaces internas.

---

#### 9.3 — Helicone: monitoreo de costos y uso de IA

- El proyecto ya tiene funcionalidades de IA (mejora de redacción, resumen de informes en consultas). Centralizar todas las llamadas a LLMs a través de Helicone como proxy.
- Configurar Helicone como gateway entre el backend NestJS y la API de OpenAI/Anthropic:
  - Reemplazar `baseURL` de la SDK con el proxy de Helicone (`https://oai.helicone.ai/v1`)
  - Agregar header `Helicone-Auth: Bearer <HELICONE_API_KEY>`
  - Agregar header `Helicone-Property-DoctorId: <doctorId>` para atribuir el gasto por doctor
  - Agregar header `Helicone-Property-Feature: <feature>` para clasificar por funcionalidad (`consultation-summary`, `report-improve`, etc.)
- Configurar alertas de costo en Helicone: notificar si el gasto diario supera un umbral configurable.
- Crear un endpoint interno `GET /admin/analytics/ai-costs` que consulte la API de Helicone y retorne:
  - Gasto total del mes
  - Gasto por funcionalidad (breakdown por `Feature` property)
  - Gasto por doctor (breakdown por `DoctorId` property) — útil para saber si hay doctores con uso anormal
  - Número de requests y tokens consumidos
- Mostrar este resumen en el dashboard de admin de Delta.
- Almacenar en Redis los datos de Helicone con TTL de 1 hora — evitar llamar a la API de Helicone en cada request del dashboard.

---

#### 9.5 — Stack de notificaciones: Resend (email) + Twilio (WhatsApp)

**Decisión de stack:**
- **Email transaccional:** Resend (`resend.com`) — SDK TypeScript nativo, integración con `react-email` para templates, excelente DX, sin la complejidad de SendGrid.
- **WhatsApp:** Twilio WhatsApp Business API — estándar de la industria, cobertura confiable en Venezuela, un solo SDK para WhatsApp + SMS como canal de fallback.
- **Marketing/lifecycle emails (futuro):** Customer.io — evaluar cuando el volumen de usuarios justifique automatización de campañas. No implementar en esta fase.

**Instrucción para Claude:** La implementación del stack de notificaciones va en `apps/backend/src/infrastructure/notifications/`. El dominio ya tiene la interfaz `INotificationPort` definida en la Fase 3. Esta fase la implementa con adaptadores concretos.

**9.5.1 — Adapter de Resend (`resend-email.adapter.ts`):**
- Implementa `INotificationPort` para el canal email.
- Instalar `resend` en el backend.
- Los templates de email se crean con `react-email` en `apps/backend/src/infrastructure/notifications/templates/`:
  - `appointment-confirmation.email.tsx` — confirmación al paciente cuando el doctor aprueba la cita
  - `appointment-reminder.email.tsx` — recordatorio 24h y 1h antes de la cita
  - `appointment-cancelled.email.tsx` — notificación de cancelación
  - `doctor-welcome.email.tsx` — bienvenida al médico tras el registro
  - `magic-link.email.tsx` — (si se decide customizar el email de Auth0 passwordless)
- Cada template recibe props tipadas con schemas Zod de `@delta/shared-types`.
- El `RESEND_API_KEY` se almacena en GCP Secret Manager.
- Configurar el dominio de envío (ej: `notificaciones@deltamedical.com`) con los registros DNS de Resend.

**9.5.2 — Adapter de Twilio WhatsApp (`twilio-whatsapp.adapter.ts`):**
- Implementa `INotificationPort` para el canal WhatsApp.
- Instalar `twilio` en el backend.
- Templates de WhatsApp (deben ser aprobados por Meta antes de uso):
  - `appointment_confirmation` — al paciente: "Tu cita con el Dr. {nombre} está confirmada para el {fecha} a las {hora}."
  - `appointment_reminder_24h` — recordatorio 24h antes
  - `appointment_reminder_1h` — recordatorio 1h antes
  - `appointment_cancelled` — notificación de cancelación con opción de reagendar
  - `payment_reminder` — recordatorio de pago pendiente con link de WhatsApp Pay (si aplica)
- Configurar fallback: si el envío de WhatsApp falla (número no registrado, mensaje rechazado), intentar por SMS via Twilio SMS, y si falla, por email via Resend.
- El `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` se almacenan en GCP Secret Manager.
- Definir si el número de WhatsApp es único de Delta o uno por especialista — documentar la decisión en `memory-bank/01-architecture.md`.

**9.5.3 — Servicio de notificaciones orquestador (`notification.service.ts`):**
- En la capa de `application/`, crear `NotificationService` que:
  - Determine el canal preferido del usuario (WhatsApp > Email, configurable por doctor)
  - Ejecute la notificación con el canal primario
  - En caso de fallo, ejecute el fallback automáticamente
  - Registre cada intento de notificación en la tabla `notification_log` (canal, estado, error si aplica)
- Las notificaciones se encolan en Redis con `Bull` (queue) para no bloquear el flujo principal:
  - Si falla el encolado, loguear el error pero no romper la operación principal (crear cita, confirmar cita)
  - El worker de Bull procesa la cola de notificaciones de forma asíncrona

**9.5.4 — Cloud Scheduler para recordatorios automáticos:**
- Crear un Cloud Run Job `send-appointment-reminders` que se ejecuta cada hora via Cloud Scheduler.
- El job consulta las citas de las próximas 25 horas (para los recordatorios de 24h) y de la próxima hora y 10 minutos (para los de 1h).
- Encola las notificaciones pendientes en Redis/Bull.
- Registrar en `memory-bank/03-development-process.md` cómo configurar y monitorear este job.

---

#### 9.6 — Dashboard de observabilidad interno

Crear una sección en el dashboard de admin (`/admin/observability`) que consolide:
- **Errores activos** — count de issues abiertos en Sentry (vía Sentry API) con link al issue
- **Costos de IA** — datos de Helicone: gasto del mes, breakdown por feature y por doctor
- **Notificaciones** — tasa de entrega de emails (Resend webhook) y WhatsApp (Twilio webhook), errores de envío
- **Uso de la plataforma** — métricas clave desde la BD: citas del día, consultas del mes, nuevos registros de la semana
- Todos los datos de este dashboard deben cachearse en Redis (TTL: 5 minutos) — no hacer queries en tiempo real en cada carga.

---

#### 9.7 — Variables de entorno adicionales (Fase 9)

Agregar al `.env` de `apps/backend`:
```env
# Sentry
SENTRY_DSN=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=notificaciones@deltamedical.com

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Sandbox para dev, número real para prod

# Helicone
HELICONE_API_KEY=
HELICONE_COST_ALERT_THRESHOLD_USD=50         # Alerta si el gasto diario supera este valor
```

Agregar al `.env.local` de `apps/frontend`:
```env
# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=

# Google Analytics
NEXT_PUBLIC_GA_ID=

```

**Verificación de fase:** Un error lanzado en el backend debe aparecer en Sentry con el stack trace correcto y sin datos de pacientes en el payload. Un evento `booking_completed` debe aparecer en GA4 Real-Time. Un email de confirmación de cita debe enviarse via Resend y recibirse correctamente. Un mensaje de WhatsApp de prueba debe entregarse via Twilio. El dashboard `/admin/observability` debe mostrar datos de Sentry, Helicone, y métricas de notificaciones.

---

## APÉNDICE C — Checklist de seguridad pre-producción

Antes de lanzar a producción, verificar:

- [ ] `ENCRYPTION_KEY` almacenada en GCP Secret Manager (no en `.env`)
- [ ] `AUTH0_CLIENT_SECRET` almacenada en GCP Secret Manager
- [ ] `DATABASE_URL` almacenada en GCP Secret Manager (con password fuerte)
- [ ] Todos los buckets de GCS con acceso privado (excepto el de assets públicos)
- [ ] Cloud SQL sin IP pública — solo acceso via Private IP en VPC
- [ ] Auth0 tenant con solo las conexiones necesarias habilitadas (Email Passwordless)
- [ ] Rate limiting configurado en los endpoints de auth y booking
- [ ] CORS del backend NestJS solo permite el dominio del frontend en producción
- [ ] `NODE_ENV=production` en todos los servicios Cloud Run
- [ ] Logs de Cloud Run no contienen datos de pacientes
- [ ] `audit_log` table activa para cambios en datos de pacientes
- [ ] Backups automáticos de Cloud SQL habilitados y probados
- [ ] Plan de recuperación ante desastres documentado en memory-bank/03-development-process.md
- [ ] Todos los tests E2E pasan contra el entorno de staging
- [ ] Penetration test básico ejecutado (OWASP Top 10)
- [ ] Sentry `beforeSend` configurado — verificar que PII de pacientes NO aparece en los payloads de Sentry
- [ ] `SENTRY_DSN`, `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `HELICONE_API_KEY` almacenados en GCP Secret Manager
- [ ] Twilio configurado con número de producción (no sandbox) y templates de WhatsApp aprobados por Meta
- [ ] Dominio de email verificado en Resend con registros SPF, DKIM, y DMARC configurados
- [ ] GA4 con `anonymize_ip: true` y sin parámetros de eventos que contengan PII
- [ ] Alerta de costo de IA configurada en Helicone
- [ ] Cloud Scheduler del job de recordatorios configurado y probado en staging
