# Estructura Estándar de Módulo

> Leer este archivo antes de implementar cualquier módulo.
> Cada módulo sigue exactamente esta estructura — sin excepciones.

---

## Capas obligatorias por módulo

```
domain/
  entities/          NombreEntidad.entity.ts + .spec.ts
  value-objects/     NombreVo.vo.ts + .spec.ts (si aplica)
  errors/            nombre-especifico.error.ts (extiende DomainError)

application/
  use-cases/
    nombre-modulo/
      crear-x.use-case.ts + .spec.ts
      actualizar-x.use-case.ts + .spec.ts
      obtener-x.use-case.ts + .spec.ts

infrastructure/
  database/
    models/          nombre.model.ts
    repositories/    sequelize-nombre.repository.ts + .spec.ts

presentation/
  controllers/       nombre.controller.ts + .spec.ts (test HTTP)
```

---

## Cobertura de tests requerida

| Capa | Cobertura mínima | Tipo de test |
|------|-----------------|--------------|
| `domain/` | **100%** | Unitario puro — sin dependencias externas |
| `application/use-cases/` | **90%** | Unitario con repositorios mockeados |
| `infrastructure/repositories/` | **70%** | Integración con BD de test (Docker) |
| `presentation/controllers/` | **80%** | Unitario con NestJS testing module |

---

## Plantilla de use case

```typescript
// application/use-cases/modulo/crear-x.use-case.ts
import { Injectable } from '@nestjs/common';
import { IXxxRepository } from '../../../domain/repositories/xxx.repository';
import { CreateXxxDto } from '../../dtos/create-xxx.dto';
import { Xxx } from '../../../domain/entities/xxx.entity';

@Injectable()
export class CreateXxxUseCase {
  constructor(private readonly xxxRepository: IXxxRepository) {}

  async execute(dto: CreateXxxDto, actorId: string): Promise<Xxx> {
    // 1. Validar invariantes de negocio (lanzar DomainError si fallan)
    // 2. Crear entidad de dominio
    // 3. Persistir via repositorio
    // 4. Retornar entidad
  }
}
```

## Plantilla de test de use case

```typescript
// application/use-cases/modulo/crear-x.use-case.spec.ts
describe('CreateXxxUseCase', () => {
  let useCase: CreateXxxUseCase;
  let mockRepository: jest.Mocked<IXxxRepository>;

  beforeEach(() => {
    mockRepository = { create: jest.fn(), findById: jest.fn(), ... } as any;
    useCase = new CreateXxxUseCase(mockRepository);
  });

  it('creates xxx successfully', async () => { ... });
  it('throws XxxConflictError when already exists', async () => { ... });
  it('throws UnauthorizedError when actor does not own resource', async () => { ... });
});
```

## Plantilla de entidad de dominio

```typescript
// domain/entities/xxx.entity.ts
export class Xxx {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    // ... propiedades
    public readonly createdAt: Date,
  ) {}

  // Métodos que encapsulan invariantes de negocio
  canBeModifiedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  // Value Objects en lugar de primitivos para campos con lógica
}
```

---

## Respuesta estándar de la API

Todo endpoint retorna este envelope:

```typescript
// éxito
{ "success": true, "data": { ... } }

// lista paginada
{ "success": true, "data": [...], "meta": { "total": 100, "page": 1, "limit": 20 } }

// error (manejo en GlobalExceptionFilter)
{ "success": false, "code": "DOMAIN_ERROR_CODE", "message": "Mensaje para el usuario" }
```

---

## Datos sensibles — regla de masking

Los endpoints de **lista** siempre retornan datos enmascarados:

```typescript
// patients en lista → datos enmascarados
{ full_name: "Juan P.", cedula: "V-123***78", phone: "+584***567", email: "j***@gmail.com" }

// GET /patients/:id/reveal → datos reales + entrada en access_audit_log
{ full_name: "Juan Pérez", cedula: "V-12345678", phone: "+58412345678", email: "juan@gmail.com" }
```

El masking lo aplica el mapper en la capa de presentación, nunca el repositorio.

---

## Convención de archivos

```
// Módulo NestJS
nombre.module.ts

// Controlador
nombre.controller.ts
nombre.controller.spec.ts

// Use cases (uno por acción)
crear-nombre.use-case.ts
crear-nombre.use-case.spec.ts
actualizar-nombre.use-case.ts
obtener-nombre.use-case.ts
listar-nombres.use-case.ts
eliminar-nombre.use-case.ts  (si aplica)

// Repositorio
IXxxRepository → domain/repositories/xxx.repository.ts
SequelizeXxxRepositoryImpl → infrastructure/database/repositories/sequelize-xxx.repository.ts

// Modelos Sequelize
xxx.model.ts  (solo para mapeo BD — no es una entidad de dominio)

// Errores
xxx-not-found.error.ts
xxx-conflict.error.ts
```
