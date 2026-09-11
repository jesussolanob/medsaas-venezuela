import {
  PaymentMethodSchema,
  OfferablePaymentMethodSchema,
  normalizePaymentMethod,
} from './payment-method';
import { CreateBookingDtoSchema } from './dtos/create-booking.dto';

describe('PaymentMethodSchema', () => {
  it('acepta los métodos que las pantallas ofrecen hoy', () => {
    for (const m of [
      'pago_movil',
      'transferencia',
      'zelle',
      'binance',
      'efectivo',
      'efectivo_bs',
      'pos',
      'seguro',
    ]) {
      expect(PaymentMethodSchema.parse(m)).toBe(m);
    }
  });

  it('acepta los que pone el sistema: package e insurance', () => {
    // Los escribe el backend (paquete prepago) y la reserva (seguro declarado).
    expect(PaymentMethodSchema.parse('package')).toBe('package');
    expect(PaymentMethodSchema.parse('insurance')).toBe('insurance');
  });

  it('normaliza el vocabulario viejo en vez de rechazarlo', () => {
    // Un cliente en caché o una fila que se escapó de la migración se corrige
    // sola. Rechazar dejaría al especialista sin poder guardar.
    expect(PaymentMethodSchema.parse('cash_usd')).toBe('efectivo');
    expect(PaymentMethodSchema.parse('cash_bs')).toBe('efectivo_bs');
    expect(PaymentMethodSchema.parse('transferencia_bs')).toBe('transferencia');
  });

  it('tolera mayúsculas y espacios', () => {
    expect(PaymentMethodSchema.parse('  Pago_Movil ')).toBe('pago_movil');
  });

  it('acepta "manual" para no romper el reguardado de consultas históricas', () => {
    // Existen filas de junio/julio con este valor. Ninguna pantalla lo ofrece,
    // pero reabrir esa consulta y guardarla reenvía el método.
    expect(PaymentMethodSchema.parse('manual')).toBe('manual');
  });

  it('RECHAZA un vocabulario inventado — es el punto de todo esto', () => {
    expect(() => PaymentMethodSchema.parse('cash_dollars')).toThrow();
    expect(() => PaymentMethodSchema.parse('bitcoin')).toThrow();
    expect(() => PaymentMethodSchema.parse('')).toThrow();
  });

  it('el error dice qué valores sirven, en español', () => {
    const r = PaymentMethodSchema.safeParse('cash_dollars');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.message).toContain('Método de pago no reconocido');
      expect(r.error.issues[0]!.message).toContain('efectivo');
    }
  });
});

describe('OfferablePaymentMethodSchema (profiles.payment_methods)', () => {
  it('rechaza package e insurance', () => {
    // Aceptarlos ahí los haría aparecer como botón en la reserva pública.
    expect(() => OfferablePaymentMethodSchema.parse('package')).toThrow();
    expect(() => OfferablePaymentMethodSchema.parse('insurance')).toThrow();
  });

  it('acepta y normaliza lo que sí se puede ofrecer', () => {
    expect(OfferablePaymentMethodSchema.parse('efectivo')).toBe('efectivo');
    expect(OfferablePaymentMethodSchema.parse('cash_usd')).toBe('efectivo');
  });
});

describe('normalizePaymentMethod', () => {
  it('deja pasar lo que no es string sin romper', () => {
    // El preprocess corre ANTES de validar el tipo: si acá tirara, el mensaje
    // de error sería un stack trace en vez de "método no reconocido".
    expect(normalizePaymentMethod(null)).toBeNull();
    expect(normalizePaymentMethod(undefined)).toBeUndefined();
    expect(normalizePaymentMethod(42)).toBe(42);
  });
});

describe('CreateBookingDtoSchema — el vocabulario queda cerrado en la puerta', () => {
  const base = {
    cf_turnstile_token: 'stub',
    // UUID v4 real: Zod exige el nibble de versión (4) y el de variante (8-b).
    doctor_id: '11111111-1111-4111-8111-111111111111',
    patient_name: 'Ana Pérez',
    patient_email: 'ana@example.com',
    patient_cedula: 'V-12345678',
    scheduled_at: '2026-09-20T14:00:00.000Z',
    plan_name: 'Consulta general',
    plan_price: 30,
  };

  it('el fixture base es válido — si no, los demás tests de este bloque pasarían por el motivo equivocado', () => {
    const r = CreateBookingDtoSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('convierte cash_usd a efectivo en una reserva real', () => {
    const r = CreateBookingDtoSchema.safeParse({ ...base, payment_method: 'cash_usd' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.payment_method).toBe('efectivo');
  });

  it('rechaza un método inventado con 422 en vez de guardarlo', () => {
    const r = CreateBookingDtoSchema.safeParse({ ...base, payment_method: 'cash_dollars' });
    expect(r.success).toBe(false);
  });

  it('sigue aceptando que no venga método', () => {
    expect(CreateBookingDtoSchema.safeParse({ ...base }).success).toBe(true);
    expect(CreateBookingDtoSchema.safeParse({ ...base, payment_method: null }).success).toBe(true);
  });
});
