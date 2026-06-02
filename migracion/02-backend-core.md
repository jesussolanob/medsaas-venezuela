# Plan Detallado — Fase 2+3: Backend Core (NestJS + Sequelize + PostgreSQL)

> Referencia: `master-plan.md` Fases 2 y 3
> Prerrequisito: `01-arquitectura.md` completado
> Entregable: NestJS corriendo en local con DDD, migrations, Sequelize, y al menos un endpoint migrado de Supabase

---

## Entorno local — simplificaciones deliberadas

En desarrollo local **NO se usan**:
- Auth0 → se usa un `DevAuthGuard` que acepta un header `x-dev-user-id` + `x-dev-user-role`
- GCP Secret Manager → las claves de encriptación van en `.env`
- Cloudflare → no aplica en local
- Cloud Run / VPC → todo corre en localhost

Estas simplificaciones se reemplazan por las versiones de producción en `03-seguridad.md` y `04-gcp-infra.md`.

---

## Paso 1 — Scaffolding NestJS

```bash
# Desde la raíz del monorepo
pnpm add -D @nx/nest

npx nx generate @nx/nest:application backend \
  --directory=apps/backend \
  --strict \
  --unitTestRunner=jest

# El servidor debe arrancar en puerto 3001
# En apps/backend/src/main.ts:
# await app.listen(process.env.PORT ?? 3001);
```

Instalar dependencias del backend:

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/sequelize \
         @nestjs/config @nestjs/cache-manager @nestjs/throttler \
         sequelize sequelize-typescript pg pg-hstore \
         cache-manager-redis-yet ioredis \
         zod class-transformer class-validator \
         bcryptjs jsonwebtoken \
         @google-cloud/secret-manager

pnpm add -D @types/sequelize @types/bcryptjs @types/jsonwebtoken \
            sequelize-cli @types/node
```

---

## Paso 2 — Estructura DDD del backend

Crear la estructura de carpetas en `apps/backend/src/`:

```
src/
├── main.ts
├── app.module.ts
│
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── repositories/          # interfaces abstractas (IXxxRepository)
│   ├── events/
│   ├── errors/
│   │   └── domain.error.ts    # clase base
│   └── factories/
│
├── application/
│   ├── use-cases/
│   │   ├── appointments/
│   │   ├── patients/
│   │   ├── consultations/
│   │   ├── auth/
│   │   └── admin/
│   ├── ports/
│   │   ├── cache.port.ts
│   │   ├── notification.port.ts
│   │   └── storage.port.ts
│   └── dtos/
│
├── infrastructure/
│   ├── database/
│   │   ├── models/            # modelos Sequelize
│   │   ├── migrations/
│   │   ├── seeders/
│   │   └── repositories/      # implementaciones Sequelize
│   ├── cache/
│   │   └── redis-cache.adapter.ts
│   ├── auth/
│   │   ├── dev-auth.guard.ts  # SOLO desarrollo — ver Paso 5
│   │   └── jwt.strategy.ts    # usado en producción (Fase 3)
│   └── config/
│       ├── database.config.ts
│       └── redis.config.ts
│
└── presentation/
    ├── controllers/
    ├── guards/
    ├── decorators/
    │   ├── roles.decorator.ts
    │   └── current-user.decorator.ts
    ├── filters/
    │   └── global-exception.filter.ts
    ├── interceptors/
    │   └── logging.interceptor.ts
    └── pipes/
        └── zod-validation.pipe.ts
```

---

## Paso 3 — Clase base de errores de dominio

`apps/backend/src/domain/errors/domain.error.ts`:

```typescript
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class PatientNotFoundError extends DomainError {
  readonly code = 'PATIENT_NOT_FOUND';
  constructor(id: string) { super(`Patient ${id} not found`); }
}

export class AppointmentConflictError extends DomainError {
  readonly code = 'APPOINTMENT_CONFLICT';
  constructor() { super('Time slot is already taken'); }
}

export class InsufficientSessionsError extends DomainError {
  readonly code = 'INSUFFICIENT_SESSIONS';
  constructor() { super('No sessions available in package'); }
}

export class SubscriptionExpiredError extends DomainError {
  readonly code = 'SUBSCRIPTION_EXPIRED';
  constructor() { super('Doctor subscription has expired'); }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  constructor() { super('Not authorized to access this resource'); }
}
```

---

## Paso 4 — Configurar Sequelize

`apps/backend/src/infrastructure/config/database.config.ts`:

```typescript
import { SequelizeModuleOptions } from '@nestjs/sequelize';

export const databaseConfig = (): SequelizeModuleOptions => ({
  dialect: 'postgres',
  uri: process.env.DATABASE_URL,
  autoLoadModels: true,
  synchronize: false,          // NUNCA sincronizar automáticamente
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production'
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
});
```

`.sequelizerc` en `apps/backend/`:

```js
const path = require('path');
module.exports = {
  'config': path.resolve('src/infrastructure/database/config.json'),
  'models-path': path.resolve('src/infrastructure/database/models'),
  'seeders-path': path.resolve('src/infrastructure/database/seeders'),
  'migrations-path': path.resolve('src/infrastructure/database/migrations'),
};
```

`src/infrastructure/database/config.json`:

```json
{
  "development": {
    "url": "postgres://delta:delta_dev_password@localhost:5432/deltamedical",
    "dialect": "postgres"
  },
  "test": {
    "url": "postgres://delta:delta_dev_password@localhost:5432/deltamedical_test",
    "dialect": "postgres"
  },
  "production": {
    "use_env_variable": "DATABASE_URL",
    "dialect": "postgres",
    "dialectOptions": { "ssl": { "require": true, "rejectUnauthorized": false } }
  }
}
```

---

## Paso 5 — DevAuthGuard (solo desarrollo)

`apps/backend/src/infrastructure/auth/dev-auth.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Guard de desarrollo — NUNCA usar en producción.
 * Lee el usuario del header x-dev-user-id y x-dev-user-role.
 * Permite probar endpoints sin Auth0 configurado.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DevAuthGuard must not be used in production');
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-dev-user-id'];
    const role = request.headers['x-dev-user-role'] ?? 'doctor';

    if (!userId) return false;

    request.user = { sub: userId, role, email: `${userId}@dev.local` };
    return true;
  }
}
```

`apps/backend/src/presentation/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  sub: string;
  role: 'super_admin' | 'doctor' | 'patient';
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
```

---

## Paso 6 — GlobalExceptionFilter

`apps/backend/src/presentation/filters/global-exception.filter.ts`:

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DomainError } from '../../domain/errors/domain.error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message ?? message;
      code = 'HTTP_ERROR';
    } else if (exception instanceof DomainError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = exception.code;
      message = exception.message;
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json({ success: false, code, message });
  }
}
```

---

## Paso 7 — ZodValidationPipe

`apps/backend/src/presentation/pipes/zod-validation.pipe.ts`:

```typescript
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      });
    }
    return result.data;
  }
}
```

---

## Paso 8 — Schemas Zod en shared-types

Crear en `libs/shared-types/src/`:

```
src/
├── schemas/
│   ├── profile.schema.ts
│   ├── appointment.schema.ts
│   ├── patient.schema.ts
│   ├── consultation.schema.ts
│   ├── ehr.schema.ts
│   ├── prescription.schema.ts
│   ├── subscription.schema.ts
│   ├── finance.schema.ts
│   └── package.schema.ts
├── dtos/
│   ├── create-appointment.dto.ts
│   ├── update-appointment-status.dto.ts
│   ├── create-patient.dto.ts
│   ├── create-consultation.dto.ts
│   └── ...
├── enums.ts
└── index.ts
```

`libs/shared-types/src/enums.ts`:

```typescript
export const AppointmentStatus = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const PaymentStatus = { PENDING: 'pending', APPROVED: 'approved' } as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const SubscriptionStatus = {
  TRIAL: 'trial', ACTIVE: 'active', PAST_DUE: 'past_due', SUSPENDED: 'suspended',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const UserRole = { SUPER_ADMIN: 'super_admin', DOCTOR: 'doctor', PATIENT: 'patient' } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PackageStatus = { ACTIVE: 'active', COMPLETED: 'completed' } as const;
export type PackageStatus = (typeof PackageStatus)[keyof typeof PackageStatus];
```

---

## Paso 9 — Migration inicial (schema desde Supabase)

```bash
# Crear migration inicial
cd apps/backend
npx sequelize-cli migration:generate --name initial-schema
```

La migration `001-initial-schema.ts` debe reproducir exactamente las tablas de Supabase documentadas en `CLAUDE.md` y el Memory Bank. Tablas en orden de dependencias (respetar FKs):

1. `profiles`
2. `plan_configs`
3. `plan_features`
4. `subscriptions`
5. `patients`
6. `appointments`
7. `consultations`
8. `ehr_records`
9. `prescriptions`
10. `patient_packages`
11. `pricing_plans`
12. `leads`
13. `patient_messages`
14. `reminders_settings`
15. `reminders_queue`
16. `doctor_invitations`
17. `access_audit_log` ← tabla nueva para auditoría
18. `active_sessions` ← tabla nueva para sesión única por usuario (respaldo de Redis)

Agregar columnas de encriptación a las tablas con datos sensibles:

```sql
-- patients
ALTER TABLE patients ADD COLUMN cedula_search_hash VARCHAR(64);
ALTER TABLE patients ADD COLUMN full_name_search_hash VARCHAR(64);

-- (las columnas originales se mantienen pero almacenarán ciphertext)
```

Scripts NX para migrations:

```json
// en apps/backend/project.json, agregar targets:
{
  "migrate": {
    "executor": "nx:run-commands",
    "options": { "command": "npx sequelize-cli db:migrate", "cwd": "apps/backend" }
  },
  "migrate:undo": {
    "executor": "nx:run-commands",
    "options": { "command": "npx sequelize-cli db:migrate:undo", "cwd": "apps/backend" }
  },
  "migrate:status": {
    "executor": "nx:run-commands",
    "options": { "command": "npx sequelize-cli db:migrate:status", "cwd": "apps/backend" }
  }
}
```

---

## Paso 10 — Variables de entorno locales

`apps/backend/.env` (para desarrollo local — nunca committear):

```env
NODE_ENV=development
PORT=3001

# Base de datos local (Docker)
DATABASE_URL=postgres://delta:delta_dev_password@localhost:5432/deltamedical

# Redis local (Docker)
REDIS_URL=redis://:redis_dev_password@localhost:6379

# Encriptación (solo desarrollo — en producción viene de Secret Manager)
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
ENCRYPTION_HMAC_SECRET=1111111111111111111111111111111111111111111111111111111111111111

# Auth0 Action Secret (dev puede ser cualquier valor)
AUTH0_ACTION_SECRET=dev_action_secret_change_in_prod

# CORS — acepta requests desde el frontend de desarrollo
CORS_ORIGIN=http://localhost:3000
```

`apps/frontend/.env.local` (para desarrollo local):

```env
# Auth0 — se configura en Fase 3
# En desarrollo sin Auth0 activo, el frontend llama directamente con headers x-dev-*
AUTH0_SECRET=dev_secret_32_chars_minimum_here_x
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://placeholder.auth0.com
AUTH0_CLIENT_ID=placeholder
AUTH0_CLIENT_SECRET=placeholder

# Backend — URL local de NestJS
BACKEND_INTERNAL_URL=http://localhost:3001

# Cloudflare Turnstile — en dev usar la clave de prueba oficial de CF
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
CLOUDFLARE_TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

NEXT_PUBLIC_ENV=development
```

---

## Paso 11 — Health check endpoint

`apps/backend/src/presentation/controllers/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class HealthController {
  @Get('health')
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

---

## Paso 12 — Tests unitarios: configuración base

Cada módulo de NestJS necesita tests unitarios. Configuración base de Jest:

`jest.config.base.ts` en la raíz:

```typescript
export default {
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]sx?$': ['@swc/jest', {}] },
  moduleNameMapper: {
    '@delta/shared-types': '<rootDir>/../../libs/shared-types/src/index.ts',
    '@delta/shared-utils': '<rootDir>/../../libs/shared-utils/src/index.ts',
    '@delta/shared-crypto': '<rootDir>/../../libs/shared-crypto/src/index.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 85, statements: 85 },
    // cobertura 100% obligatoria para capa de dominio
    './src/domain/**': { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
```

**Estructura de tests por módulo** (patrón obligatorio):

```
src/
├── domain/
│   └── entities/
│       ├── appointment.entity.ts
│       └── appointment.entity.spec.ts   ← tests de invariantes de negocio
├── application/
│   └── use-cases/
│       └── appointments/
│           ├── create-appointment.use-case.ts
│           └── create-appointment.use-case.spec.ts  ← mock del repositorio
└── infrastructure/
    └── database/
        └── repositories/
            ├── sequelize-appointment.repository.ts
            └── sequelize-appointment.repository.spec.ts  ← test con BD de test
```

---

## Verificación de Fase 2+3 ✓

```bash
# Backend arranca
npx nx serve backend
# → http://localhost:3001/api/health debe retornar { status: 'ok' }

# Migrations corren sin errores
npx nx run backend:migrate

# Tests unitarios pasan con cobertura
npx nx test backend --coverage

# Lint limpio
npx nx lint backend

# Llamada a endpoint con DevAuthGuard
curl -H "x-dev-user-id: doctor-123" \
     -H "x-dev-user-role: doctor" \
     http://localhost:3001/api/appointments
# → debe responder [] o datos de prueba, nunca 401
```

**Criterios de aceptación:**
- [ ] `GET /api/health` responde 200
- [ ] Migrations corren contra Docker PostgreSQL local sin errores
- [ ] DevAuthGuard funciona — endpoints accesibles con headers de dev
- [ ] Al menos el módulo `appointments` migrado con endpoint funcional
- [ ] Cobertura de tests ≥ 80% global, 100% en `domain/`
- [ ] Lint sin errores
- [ ] Commit en develop ejecuta lint + tests del hook (< 2 min)
