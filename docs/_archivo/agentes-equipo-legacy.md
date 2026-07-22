# Equipo de Agentes — Delta Medical CRM

> Documento de referencia para el equipo de desarrollo con Claude Code.
> Leer antes de iniciar cualquier sesión de desarrollo.

---

## Por qué un equipo de agentes

El proyecto tiene 10 módulos con implementación paralela posible (backend + frontend + tests). Un solo agente no puede mantener todo el contexto sin degradación. El equipo divide el trabajo por especialización y permite que backend y frontend avancen en paralelo.

---

## Equipo (6 agentes)

| Agente             | Archivo                            | Modelo     | Cuándo usarlo                                   |
| ------------------ | ---------------------------------- | ---------- | ----------------------------------------------- |
| **Orchestrator**   | `.claude/agents/orchestrator.md`   | Opus 4.7   | Siempre primero — descompone, asigna, consolida |
| **Backend Agent**  | `.claude/agents/backend-agent.md`  | Sonnet 4.6 | NestJS, DDD, Sequelize, use cases, migraciones  |
| **Frontend Agent** | `.claude/agents/frontend-agent.md` | Sonnet 4.6 | Next.js, Server Components, Server Actions, UI  |
| **Code Reviewer**  | `.claude/agents/code-reviewer.md`  | Sonnet 4.6 | Después de cada implementación — siempre        |
| **QA Agent**       | `.claude/agents/qa-agent.md`       | Sonnet 4.6 | Tests Jest + Playwright, cobertura, reportes    |
| **Security Agent** | `.claude/agents/security-agent.md` | Sonnet 4.6 | Módulos con PHI, auth, encriptación, IDOR       |

---

## Everything-Claude-Code (ECC)

Los agentes del proyecto son orquestadores con contexto de Delta Medical. Para tareas técnicas profundas, delegan en los agentes de ECC.

### Qué aporta ECC

- **48 agentes especializados** ya configurados (code-reviewer, security-reviewer, typescript-reviewer, tdd-guide, e2e-runner, etc.)
- **182 skills** con patrones para NestJS, Next.js, testing, seguridad
- **68 slash commands** (/plan, /tdd, /code-review, /build-fix, etc.)

### Instalación para el nuevo proyecto NX

**Paso 1** — Instalar el plugin globalmente en Claude Code:

```bash
# En cualquier sesión de Claude Code
/plugin marketplace add https://github.com/affaan-m/everything-claude-code
/plugin install everything-claude-code@everything-claude-code
```

**Paso 2** — Copiar las reglas al proyecto:

```bash
cd /Users/lucasrivas/Documents/repositorios/everything-claude-code

# Reglas comunes (obligatorio)
cp -r rules/common ~/.claude/rules/ecc/common

# Reglas TypeScript (este proyecto es TS)
cp -r rules/typescript ~/.claude/rules/ecc/typescript

# Reglas web/frontend
cp -r rules/web ~/.claude/rules/ecc/web
```

**Paso 3** — Verificar que los agentes ECC están disponibles:

```bash
ls ~/.claude/agents/ | grep -E "(code-reviewer|security-reviewer|tdd-guide)"
```

**⚠️ IMPORTANTE**: No mezclar métodos. Si instalaste via `/plugin install`, no corras `./install.sh` manualmente — crea duplicados que se pisan entre sí.

### Instalación para Cursor

```bash
cd /Users/lucasrivas/Documents/repositorios/everything-claude-code
./install.sh --target cursor typescript web
```

### Cuándo usar ECC directamente vs agentes del proyecto

| Tarea                               | Usar                         |
| ----------------------------------- | ---------------------------- |
| Implementar un módulo Delta Medical | `backend-agent` del proyecto |
| Review de calidad de un módulo      | `code-reviewer` del proyecto |
| Auditoría OWASP completa            | `security-reviewer` de ECC   |
| Type safety exhaustivo              | `typescript-reviewer` de ECC |
| E2E con configuración avanzada      | `e2e-runner` de ECC          |
| Planificación de arquitectura       | `architect` de ECC           |

---

## Flujo de trabajo por módulo

```
┌─────────────────────────────────────────────────────┐
│  ORCHESTRATOR lee migracion/modulos/XX-nombre.md    │
│  y descompone en tareas                              │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
  BACKEND-AGENT    FRONTEND-AGENT
  (en paralelo)    (en paralelo)
       │                │
       └───────┬────────┘
               ▼
        CODE-REVIEWER
    (bloquea si hay CRITICAL/HIGH)
               │
       ┌───────┴────────┐
       ▼                ▼
   QA-AGENT        SECURITY-AGENT
   (cobertura)     (si hay PHI/auth)
       │                │
       └───────┬────────┘
               ▼
     ORCHESTRATOR consolida
     y marca módulo como ✅
```

---

## Protocolo de comunicación

### Cómo el Orchestrator asigna tareas

El Orchestrator usa el parámetro de `prompt` del Agent tool con este formato:

```
Implementar [módulo] — [descripción corta]

Archivos de referencia:
- migracion/modulos/XX-nombre.md (leer completo)
- migracion/02-backend-core.md (secciones: DDD, DevAuthGuard)

Tarea específica:
[descripción detallada]

Criterios de aceptación:
- [criterio 1]
- [criterio 2]

Cuando termines, reportar al Orchestrator.
```

### Cómo el QA Agent reporta fallos

Si un test falla, el QA Agent reporta al Orchestrator:

```
❌ TEST FALLO — <módulo>

Archivo: tests/unit/modules/<módulo>/application/use-cases/<name>.spec.ts:45
Test: "throws error when patient not found"
Error: Expected PatientNotFoundError but got TypeError: Cannot read 'id' of undefined

Causa probable: El use case no valida si el repositorio retorna null antes de acceder a .id
Acción solicitada: Reasignar a backend-agent para corregir CreatePatientUseCase.execute()
```

### Escalada al Security Agent

El Code Reviewer o el Orchestrator escalan al Security Agent cuando detectan:

- Datos de pacientes en respuestas sin `toMasked()`
- Endpoints sin guard
- Acceso a recursos sin verificar ownership (IDOR potencial)

---

## Sesión típica de desarrollo

### Iniciar una sesión con el Orchestrator

```
Hola, vamos a implementar el módulo 02-patients.
Lee migracion/modulos/02-patients.md y asigna las tareas al equipo.
Backend y Frontend pueden arrancar en paralelo.
```

### Comandos ECC útiles durante el desarrollo

```bash
# Al empezar un módulo nuevo
/plan

# Cuando el build falla
/build-fix

# Para revisión de código
/code-review

# Para asegurar cobertura de tests
/tdd

# Para auditoría de seguridad antes de mergear
/security-review
```

---

## Presupuesto de tokens ($100 USD)

Estrategia para no agotar los créditos:

| Práctica                                                                | Ahorro estimado |
| ----------------------------------------------------------------------- | --------------- |
| Un módulo por sesión (no abrir todo a la vez)                           | Alto            |
| Leer solo el .md del módulo actual, no todos                            | Alto            |
| backend-agent + frontend-agent en paralelo (no secuencial)              | Medio           |
| Usar Haiku para tasks simples (reviews de formato, naming)              | Medio           |
| Terminar la sesión al finalizar un módulo (no dejar contexto acumulado) | Alto            |

**Modelo recomendado por tarea**:

- Orchestrator + revisiones complejas: **Opus 4.7**
- Implementación de módulos: **Sonnet 4.6**
- Reviews simples, formateo, naming: **Haiku 4.5**

---

## Estado del proyecto

Ver `migracion/README.md` para el estado actualizado de cada etapa.

**Etapa 1** (build local): Módulos 01–10 sin Auth0 ni GCP
**Etapa 2** (deploy): `migracion/03-seguridad.md` + `migracion/04-gcp-infra.md`
