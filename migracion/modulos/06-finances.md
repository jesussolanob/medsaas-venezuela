# Módulo: Finances

> Leer `00-estructura-modulo.md` antes de implementar.
> Responsabilidad: resumen financiero del doctor, tasa USDT, ingresos y gastos.

---

## Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/finances/summary` | doctor | Resumen financiero del mes actual |
| `GET` | `/api/finances/summary?month=YYYY-MM` | doctor | Resumen de un mes específico |
| `GET` | `/api/finances/transactions` | doctor | Lista de ingresos y gastos paginada |
| `POST` | `/api/finances/income` | doctor | Registrar ingreso manual (no consulta) |
| `POST` | `/api/finances/expense` | doctor | Registrar gasto |
| `GET` | `/api/settings/usdt-rate` | público | Tasa USDT/Bs actual (cacheada 10 min) |
| `POST` | `/api/admin/settings/usdt-rate` | super_admin | Actualizar tasa USDT/Bs |

---

## Domain

### Value Object `Money`

```typescript
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: 'USD' | 'BS',
  ) {}

  toUSD(rate: number): Money {
    if (this.currency === 'USD') return this;
    return new Money(this.amount / rate, 'USD');
  }

  toBS(rate: number): Money {
    if (this.currency === 'BS') return this;
    return new Money(this.amount * rate, 'BS');
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) throw new CurrencyMismatchError();
    return new Money(this.amount + other.amount, this.currency);
  }
}
```

### Entidad `FinancialTransaction`

```typescript
export class FinancialTransaction {
  constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly type: 'income' | 'expense',
    public readonly amount: Money,
    public readonly description: string,
    public readonly relatedConsultationId: string | null,
    public readonly date: Date,
  ) {}
}
```

### Errores

- `CurrencyMismatchError`
- `InvalidAmountError` (amount <= 0)

---

## Use Cases

### `GetFinancialSummaryUseCase`
- **Input:** `{ doctorId, month: 'YYYY-MM' }`
- **Lógica:**
  1. Sumar `consultations.payment_amount` donde `payment_status = 'approved'` en el mes
  2. Sumar ingresos manuales del mes
  3. Sumar gastos del mes
  4. Calcular neto = ingresos - gastos
  5. Convertir a BS usando la tasa actual de Redis
- **Output:** `{ totalIncome, totalExpenses, net, consultationCount, pendingAmount, currency: 'USD', rateUsed }`
- **Tests:** suma correctamente, filtra por mes, maneja mes sin datos

### `GetUsdtRateUseCase`
- Leer de Redis → si no existe, retornar última tasa de `settings` tabla
- TTL en Redis: 600 segundos
- Tests: retorna de caché, retorna de BD si caché vacía

### `UpdateUsdtRateUseCase`
- Solo `super_admin`
- Actualizar en `settings` tabla + invalidar caché Redis
- Tests: actualiza tasa, invalida caché, rechaza si no es admin

---

## Tests obligatorios

```typescript
// money.vo.spec.ts
describe('Money', () => {
  it('converts USD to BS correctly', ...);
  it('converts BS to USD correctly', ...);
  it('adds same-currency amounts', ...);
  it('throws CurrencyMismatchError for different currencies', ...);
  it('throws InvalidAmountError for negative amount', ...);
});

// get-financial-summary.use-case.spec.ts
describe('GetFinancialSummaryUseCase', () => {
  it('calculates total income for month', ...);
  it('calculates net after expenses', ...);
  it('returns zero values for empty month', ...);
  it('only counts approved payments', ...);
});
```
