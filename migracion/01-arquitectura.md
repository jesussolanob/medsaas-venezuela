# Plan Detallado — Fase 1: Arquitectura NX Monorepo

> Referencia: `master-plan.md` Fases 0 y 1
> Prerrequisito: ninguno
> Entregable: workspace NX funcionando con frontend migrado, Memory Bank completo, Git Flow activo, hooks de calidad configurados

---

## Paso 0 — Auditoría previa (no tocar código)

Ejecutar en el repo actual antes de crear el monorepo:

```bash
# Listar todos los archivos con lógica server-side
grep -r '"use server"' app/ --include="*.ts" -l

# Todas las llamadas a Supabase (agrupar por tabla)
grep -r "supabase\." app/ lib/ --include="*.ts" -n

# Tipos e interfaces definidos en el proyecto
grep -r "^type \|^interface \|^export type \|^export interface " app/ lib/ --include="*.ts" -n

# Todas las rutas de API
find app/api -name "route.ts" | sort

# Variables de entorno en uso
grep -r "process\.env\." app/ lib/ --include="*.ts" -n | grep -v node_modules
```

Documentar los resultados en `memory-bank/00-project-overview.md` antes de continuar.

---

## Paso 1 — Crear el workspace NX

```bash
# Crear fuera del repo actual
cd ~/Documents/repositorios
npx create-nx-workspace@latest delta-medical-nx \
  --preset=ts \
  --nxCloud=skip \
  --pm=pnpm

cd delta-medical-nx
```

Estructura de carpetas a crear manualmente después del init:

```
delta-medical-nx/
├── apps/
│   ├── frontend/          # se puebla en paso 3
│   └── backend/           # se puebla en Fase 2
├── libs/
│   ├── shared-types/
│   ├── shared-utils/
│   └── shared-crypto/
├── memory-bank/
├── .github/
│   └── workflows/
├── .cursor/
│   └── rules/
├── infrastructure/
│   └── terraform/
├── tools/
│   └── scripts/
└── docker/
```

```bash
mkdir -p apps/frontend apps/backend \
         libs/shared-types/src libs/shared-utils/src libs/shared-crypto/src \
         memory-bank .github/workflows .cursor/rules \
         infrastructure/terraform tools/scripts docker
```

---

## Paso 2 — tsconfig.base.json

`tsconfig.base.json` en la raíz:

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "paths": {
      "@delta/shared-types": ["libs/shared-types/src/index.ts"],
      "@delta/shared-utils": ["libs/shared-utils/src/index.ts"],
      "@delta/shared-crypto": ["libs/shared-crypto/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

---

## Paso 3 — Migrar el frontend como apps/frontend

```bash
# Copiar el proyecto Next.js existente
cp -r ../medsaas-venezuela/. apps/frontend/

# Limpiar lo que no debe estar dentro del monorepo
rm -rf apps/frontend/.git apps/frontend/node_modules apps/frontend/.next
```

Crear `apps/frontend/project.json`:

```json
{
  "name": "frontend",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/frontend",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/next:build",
      "options": { "root": "apps/frontend" }
    },
    "serve": {
      "executor": "@nx/next:server",
      "options": { "buildTarget": "frontend:build", "dev": true }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": { "lintFilePatterns": ["apps/frontend/**/*.{ts,tsx}"] }
    },
    "test": {
      "executor": "@nx/jest:jest",
      "options": { "jestConfig": "apps/frontend/jest.config.ts" }
    }
  }
}
```

`apps/frontend/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "allowJs": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.d.ts"],
  "exclude": ["node_modules"]
}
```

---

## Paso 4 — Crear librerías compartidas vacías

### shared-types

`libs/shared-types/src/index.ts`:
```typescript
// Barrel export — se puebla en Fase 2
export {};
```

`libs/shared-types/project.json`:
```json
{
  "name": "shared-types",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/shared-types/src",
  "projectType": "library",
  "targets": {
    "build": { "executor": "@nx/js:tsc", "options": { "main": "libs/shared-types/src/index.ts" } },
    "lint": { "executor": "@nx/eslint:lint" },
    "test": { "executor": "@nx/jest:jest", "options": { "jestConfig": "libs/shared-types/jest.config.ts" } }
  }
}
```

Repetir estructura para `shared-utils` y `shared-crypto`.

---

## Paso 5 — ESLint y Prettier

`eslint.config.mjs` en la raíz:

```js
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-throw-literal': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  {
    ignores: ['**/*.generated.ts', '**/migrations/**', 'dist/**', '.next/**'],
  },
];
```

`.prettierrc` en la raíz:

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "tabWidth": 2
}
```

---

## Paso 6 — Git Flow y protección de ramas

```bash
git init
git checkout -b main
git checkout -b develop

# Crear ramas de ejemplo (se borrarán)
# Convención: feature/<nombre>, release/<version>, hotfix/<nombre>
```

En GitHub, configurar branch protection rules para `main` y `develop`:
- Require pull request before merging
- Require at least 1 approval
- Require status checks to pass (lint, test, build)
- Do not allow bypassing the above settings

`.gitignore` en la raíz (adicional al existente):
```
.env
.env.local
.env.docker
*.local
.DS_Store
dist/
.next/
node_modules/
*.log
```

---

## Paso 7 — Husky + lint-staged (pre-commit hook)

```bash
pnpm add -D husky lint-staged
npx husky init
```

**Regla del hook:** en ramas `develop` y `main` ejecutar lint + tests afectados. En ramas `feature/*`, `hotfix/*`, `release/*` solo ejecutar lint-staged sobre los archivos modificados (sin tests completos — son más rápidos para trabajo incremental).

`.husky/pre-commit`:

```bash
#!/bin/sh

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)

if [ "$BRANCH" = "develop" ] || [ "$BRANCH" = "main" ]; then
  echo "⚡ Rama protegida ($BRANCH) — ejecutando lint + tests afectados..."
  
  # Lint y format sobre archivos staged
  npx lint-staged || exit 1
  
  # Tests de proyectos afectados por los cambios staged
  npx nx affected --target=test --base=HEAD~1 --passWithNoTests || exit 1
  
  echo "✅ Todos los checks pasaron"
else
  echo "🔧 Rama de trabajo ($BRANCH) — ejecutando solo lint-staged..."
  npx lint-staged || exit 1
fi
```

`package.json` — agregar sección `lint-staged`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "prettier --write",
      "eslint --fix --max-warnings=0"
    ],
    "*.{json,md,css}": [
      "prettier --write"
    ]
  }
}
```

`commitlint.config.js`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'ci']],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-max-length': [2, 'always', 100],
  },
};
```

`.husky/commit-msg`:

```bash
#!/bin/sh
npx commitlint --edit "$1"
```

---

## Paso 8 — Docker Compose (desarrollo local)

`docker/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-deltamedical}
      POSTGRES_USER: ${POSTGRES_USER:-delta}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-delta_dev_password}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-delta}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis_dev_password}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-redis_dev_password}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

`docker/init.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

`docker/.env.docker.example`:

```env
POSTGRES_DB=deltamedical
POSTGRES_USER=delta
POSTGRES_PASSWORD=CAMBIAR_EN_LOCAL
REDIS_PASSWORD=CAMBIAR_EN_LOCAL
```

`tools/scripts/docker-reset.sh`:

```bash
#!/bin/bash
echo "🔄 Reiniciando entorno Docker..."
cd docker
docker compose down -v
docker compose up -d
echo "✅ Docker reiniciado. Esperar ~10s para que Postgres esté listo."
```

---

## Paso 9 — Memory Bank

Crear estos archivos en `memory-bank/` con el contenido obtenido en Paso 0:

| Archivo | Contenido |
|---------|-----------|
| `00-project-overview.md` | Nombre, descripción, URLs, stack completo, contactos |
| `01-architecture.md` | Diagrama Mermaid NX + GCP, ADRs con justificación, capas DDD |
| `02-components.md` | Inventario de módulos, páginas, schemas Zod |
| `03-development-process.md` | Cómo arrancar entorno local, crear migrations, flujo Git Flow |
| `04-api-documentation.md` | Endpoints (método, ruta, roles, body, respuesta) |
| `05-progress-log.md` | Estado pre-migración como primera entrada |
| `06-mvp-planning.md` | Todos los ítems del MVP con estado inicial `pendiente` |

---

## Paso 10 — CLAUDE.md

Ver contenido completo en `master-plan.md` sección 1.8. Crear en la raíz del monorepo.

---

## Paso 11 — Cursor Rules

Ver contenido completo en `master-plan.md` sección 1.9. Crear archivos en `.cursor/rules/`.

---

## Verificación de Fase 1 ✓

```bash
# Monorepo NX reconoce los proyectos
npx nx graph

# Frontend arranca sin errores
npx nx serve frontend

# Lint pasa en todos los proyectos
npx nx run-many --target=lint --all

# Build de shared-types compila
npx nx build shared-types

# Docker levanta correctamente
cd docker && docker compose up -d && docker compose ps

# Pre-commit hook funciona (crear commit de prueba en develop)
git checkout develop
git commit --allow-empty -m "test: verificar pre-commit hook"
# Debe ejecutar lint-staged + tests afectados
```

**Criterios de aceptación:**
- [ ] `nx graph` muestra `frontend`, `backend` (vacío), `shared-types`, `shared-utils`, `shared-crypto`
- [ ] `nx serve frontend` levanta el proyecto Next.js existente sin cambios funcionales
- [ ] Commit en `develop` ejecuta lint + tests
- [ ] Commit en `feature/test` ejecuta solo lint-staged
- [ ] `docker compose ps` muestra postgres y redis `healthy`
- [ ] Los 7 archivos de `memory-bank/` existen y tienen contenido real del proyecto auditado
