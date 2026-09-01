# Spec — Módulo Inventario (`inventory`)

> Escrito por el lead el 2026-09-01. Destinatario: `backend-agent` (backend) y el cableo de
> frontend. **Leer entero antes de escribir una línea.**
>
> Decisiones del dueño ya tomadas — NO re-preguntar:
>
> | Tema              | Definición                                                                                 |
> | ----------------- | ------------------------------------------------------------------------------------------ |
> | Plan              | **Solo `delta_plus`** (y su espejo `free_trial`). Base y Free: bloqueado                   |
> | Precio            | **Solo precio de venta.** NO hay costo de proveedor ni margen                              |
> | Proveedor         | Campo de texto libre, informativo                                                          |
> | Stock en cero     | **Se avisa, no se bloquea.** Un producto ya entregado no se deshace bloqueando el registro |
> | Moneda del precio | La elige el especialista por producto: `USD` o `VES`                                       |

## 1. Qué es

Catálogo de productos que el especialista vende en su consultorio (cremas, lentes, prótesis,
suplementos), con stock, y la posibilidad de **agregar uno de esos productos al cobro de una
consulta**.

## 2. Por dónde se cobra — y por qué NO por el otro camino

La venta se engancha en **`consultation_extra_items`** (los "servicios extras" que ya existen en el
modal de aprobación de pago), NO en `payment_items`.

Razón dura: finanzas suma por dos vías distintas.

- `getIncomeBreakdown` / `getFinancialSummary` suman **`consultations.amount`**
- `listIncomePaginated` / `getPaymentTotals` suman **`payments.amount_usd`**

`consultation_extra_items` propaga a las dos (`base + Σ extras` → `consultations.amount` → y el
Step 5b sincroniza `payments.amount_usd`). `payment_items` movería solo la segunda: el especialista
vería **dos totales distintos para el mismo mes**. No usar `payment_items` para esto.

## 3. 🔴 La trampa del stock — leer dos veces

`approveWithExtras` (`apps/backend/src/modules/consultations/infrastructure/database/repositories/sequelize-consultation.repository.ts:647`)
tiene semántica **replace-all**: en CADA aprobación borra todos los extras y los reinserta. Por eso
`base_amount` se congela en la primera aprobación — para que el dinero no se acumule.

**El stock tiene que respetar la misma disciplina.** Si el descuento se hiciera al insertar la
línea, reaprobar un pago descontaría el mismo producto dos veces, en silencio y sin error.

Regla obligatoria, dentro de la **misma transacción** de `approveWithExtras`:

1. `SELECT ... FOR UPDATE` de las filas de `products` involucradas (las viejas y las nuevas).
2. **Revertir** los movimientos previos `kind='sale'` con ese `consultation_id`: devolver su `qty`
   a `products.stock_qty` y borrarlos.
3. Insertar los movimientos nuevos y descontar.

Resultado: reaprobar N veces deja el mismo stock que aprobar una vez. Quitar la línea devuelve el
producto al stock. **Esto necesita un test de regresión explícito** (ver §8).

## 4. Migración

Archivo: `apps/backend/src/infrastructure/database/migrations/20260901000002-inventory-module.cjs`
(el `...000001` de hoy ya existe). Idempotente. Hace **cinco** cosas:

### 4.1 `products`

| Columna                     | Tipo                               | Notas                                           |
| --------------------------- | ---------------------------------- | ----------------------------------------------- |
| `id`                        | uuid PK                            | `gen_random_uuid()`                             |
| `doctor_id`                 | uuid NOT NULL                      | FK `profiles(id)` ON DELETE CASCADE             |
| `name`                      | text NOT NULL                      |                                                 |
| `description`               | text NOT NULL DEFAULT `''`         |                                                 |
| `supplier`                  | text NULL                          | texto libre                                     |
| `photo_path`                | text NULL                          | **path de GCS, NUNCA la URL firmada** (caducan) |
| `sale_price_amount`         | numeric(12,2) NOT NULL             | CHECK >= 0                                      |
| `sale_price_currency`       | text NOT NULL DEFAULT `'USD'`      | CHECK IN (`'USD'`,`'VES'`)                      |
| `stock_qty`                 | numeric(12,2) NOT NULL DEFAULT 0   | puede quedar negativo (§ decisiones)            |
| `low_stock_threshold`       | numeric(12,2) NULL                 | para el aviso visual                            |
| `is_active`                 | boolean NOT NULL DEFAULT true      | baja = soft delete                              |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT NOW() |                                                 |

Índices: `(doctor_id)` y `(doctor_id, is_active)`.

### 4.2 `inventory_movements` — el libro mayor

| Columna           | Tipo                               | Notas                                                    |
| ----------------- | ---------------------------------- | -------------------------------------------------------- |
| `id`              | uuid PK                            |                                                          |
| `doctor_id`       | uuid NOT NULL                      | anti-IDOR                                                |
| `product_id`      | uuid NOT NULL                      | FK `products(id)` ON DELETE CASCADE                      |
| `kind`            | text NOT NULL                      | CHECK IN (`'purchase'`,`'sale'`,`'adjustment'`,`'loss'`) |
| `qty`             | numeric(12,2) NOT NULL             | **con signo**: + entra, − sale. CHECK `qty <> 0`         |
| `unit_price_usd`  | numeric(12,2) NULL                 | solo en ventas                                           |
| `rate_used`       | numeric(12,4) NULL                 | tasa con la que se convirtió, si el precio era en VES    |
| `rate_source`     | text NULL                          | `'bcv'` \| `'binance'` \| `'manual'`                     |
| `consultation_id` | uuid NULL                          | FK `consultations(id)` ON DELETE SET NULL                |
| `note`            | text NULL                          |                                                          |
| `created_at`      | timestamptz NOT NULL DEFAULT NOW() |                                                          |

Índices: `(doctor_id, product_id)` y `(consultation_id)`.

> `rate_source` no existe hoy en ninguna tabla de operaciones (el único precedente es
> `bcv_rate_history.source`). Lo agregamos acá a propósito: sin él, dentro de un año nadie puede
> reconstruir por qué una venta en bolívares valió lo que valió.

### 4.3 `ALTER TABLE consultation_extra_items`

- `product_id` uuid NULL → FK `products(id)` ON DELETE SET NULL
- `quantity` numeric(12,2) NOT NULL DEFAULT 1, CHECK > 0
- `unit_price_usd` numeric(12,2) NULL

`description` sigue existiendo y para las líneas de producto guarda el **nombre del producto al
momento de la venta** (snapshot: si mañana se renombra el producto, la venta vieja no cambia).

### 4.4 `role_capabilities`

`INSERT` para `role='doctor'`, `module_key='inventory'`, acciones `view|create|edit|delete`, con
`ON CONFLICT (role, module_key, action) DO UPDATE`. Copiar el patrón de
`20260816000001-seller-role.cjs:86`.

### 4.5 `plan_features` — 🔴 una fila por CADA plan, sin excepción

`feature_key='inventory'`, `feature_label='Inventario'`:

- `delta_plus` → `enabled = true`
- `free_trial` → `enabled = true` (espejo de plus; la migración de espejo ya corrió y no se
  re-ejecuta, así que hay que insertarla a mano)
- `delta_base`, `delta_free` → `enabled = false`
- Cualquier plan legacy presente (`trial`, `basic`, `professional`, `clinic`) → `false`

**Sin fila, `planUnlocks()` devuelve `false` y además el módulo ni siquiera aparece en la matriz de
`/admin/plan-features`** (esa pantalla solo togglea filas existentes; nunca crea pares nuevos).

## 5. Backend

Módulo `apps/backend/src/modules/inventory/`, DDD de 4 capas según
`docs/guides/estructura-modulo.md`. Registrar en `app.module.ts` (import + `imports`) — **si no, el
controller no existe y el BFF devuelve 404**; es el fallo más repetido del repo.

Entidades: `Product`, `InventoryMovement`. Errores de dominio propios (extienden `DomainError`,
mensajes **en español de Venezuela**): `ProductNotFoundError`, `ProductInactiveError`,
`InvalidQuantityError`.

Use cases: `ListProducts`, `GetProduct`, `CreateProduct`, `UpdateProduct`, `DeactivateProduct`
(soft, nunca `DELETE` físico: hay movimientos y ventas que lo referencian), `RegisterMovement`
(compra/ajuste/merma manual), `ListMovements`, y `SyncConsultationSaleMovements` (interno, §3).

Controller `@Controller('doctor/inventory')` + `@UseGuards(AppAuthGuard)`, `doctorId` **siempre**
de `@CurrentUser().sub`, respuestas `{ success: true, data }`:

| Método | Ruta                                                          |
| ------ | ------------------------------------------------------------- |
| GET    | `/api/doctor/inventory/products?search=&active=&page=&limit=` |
| POST   | `/api/doctor/inventory/products`                              |
| GET    | `/api/doctor/inventory/products/:id`                          |
| PUT    | `/api/doctor/inventory/products/:id`                          |
| DELETE | `/api/doctor/inventory/products/:id` (soft)                   |
| GET    | `/api/doctor/inventory/products/:id/movements`                |
| POST   | `/api/doctor/inventory/products/:id/movements`                |

En la lectura, `photo_path` se convierte a URL firmada con `IStoragePort.getSignedUrl()`. **Nunca
persistir la URL firmada.**

DTOs Zod en `libs/shared-types/src/dtos/` + `export *` en el índice.

## 6. Moneda — reglas no negociables

1. El precio se guarda **en la moneda que eligió el especialista, sin convertir**. Guardarlo ya
   convertido fosiliza la tasa del día de la carga y en tres semanas el precio es ficción.
2. Al vender: si la moneda es `USD`, `unit_price_usd = sale_price_amount`. Si es `VES`, se convierte
   con la tasa vigente (`IUsdtRateStore` / `GetBcvRateByDateUseCase`) y se persisten `rate_used` +
   `rate_source` en el movimiento.
3. **Jamás recalcular un movimiento viejo con la tasa de hoy.** En Venezuela eso reescribe la
   historia financiera cada mañana.
4. `consultation_extra_items.amount_usd` sigue siendo USD puro: el `amount_usd` de una línea de
   producto lo **calcula el backend** como `quantity × unit_price_usd`. Nunca confiar en el monto
   que manda el cliente para una línea de producto.

## 7. Frontend

- Página `/doctor/inventory` con server actions (`app/doctor/inventory/actions.ts`) — es el patrón
  dominante del repo para pantallas con formularios.
- Foto: copiar `apps/frontend/app/doctor/settings/avatar-uploader.tsx` (canvas → blob → upload).
  Agregar `'product'` a `ALLOWED_KINDS` **y** a `PRIVATE_KINDS` en
  `apps/backend/src/modules/storage/application/use-cases/upload-file.use-case.ts` (privado da
  anti-IDOR gratis: el path debe empezar con `product/<userId>/`).
  ⚠️ **No agregar cache-buster `?t=`** a la URL: un segundo `?` invalida la firma de GCS.
- `ApprovePaymentModal.tsx`: selector de producto del inventario que agrega una línea con cantidad,
  muestra el stock disponible y **avisa** (no bloquea) si la venta lo deja en negativo.
- Gating visible — los 4 archivos que todo el mundo olvida:
  1. `app/doctor/layout.tsx` → `NavItem` con `moduleKey: 'inventory'` en `navSections`
  2. `app/doctor/layout.tsx` → `PLAN_GATED_ROUTES` (sin esto se entra por URL y no hay candado)
  3. `lib/plan-features.ts` → `PLAN_GATED_MODULES`
  4. `app/doctor/upgrade/UpgradeClient.tsx` → `FEATURE_LABELS`

## 8. Tests obligatorios

Además de los unitarios de cada use case:

1. **Regresión de doble descuento:** aprobar → reaprobar con la misma línea de producto → el stock
   descontó **una sola vez**.
2. Quitar la línea y reaprobar → el stock **vuelve** al valor previo.
3. Producto en `VES` → `unit_price_usd` calculado con la tasa y `rate_used`/`rate_source`
   persistidos en el movimiento.
4. `amount_usd` de una línea de producto se recalcula en el backend aunque el cliente mande otro.
5. Anti-IDOR: producto de otro especialista → error, y **el mismo error** que un id inexistente.
6. Venta que deja stock negativo → **se permite**, queda registrada.

## 9. Verificación que el agente DEBE reportar (con exit real)

- `pnpm nx build backend`
- `pnpm nx test backend` **COMPLETO**, no solo las suites propias. Agregar un método a un puerto
  rompe todos los mocks del módulo; ya pasó y quedaron 7 suites rotas invisibles.
- Lint **acotado a los archivos tocados** — `nx lint backend` completo se queda sin memoria (heap
  4 GB) en esta máquina. Hay 2 errores preexistentes en `export-doctors` y `get-doctor-patients`.
- `tsc` del frontend si se tocó frontend.

**NO** correr Docker, migraciones contra una base, ni boot del `dist`: la máquina tiene poca RAM y
eso se hace en una ventana de QA explícita, que abre el lead.

## 10. Convenciones críticas

- Migración en **`.cjs`**, nunca `.ts`.
- **NUNCA** poner `Sequelize` en `providers`.
- Código y comentarios en **inglés**; mensajes al usuario en **español (es-VE)**.
- Nada de `any` (error de ESLint). Nada de promesas sin `await` ni `catch`.
- Commits `<tipo>(<scope>): <desc>`, cuerpo ≤100 caracteres por línea.
- Actualizar los specs afectados y avisar al lead qué quedó fuera.
