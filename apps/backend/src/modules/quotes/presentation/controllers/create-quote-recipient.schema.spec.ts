import { CreateQuoteDtoSchema } from '@delta/shared-types';

/**
 * Guarda del contrato de `new_recipient` en CreateQuoteDtoSchema.
 *
 * `ResolveQuoteRecipientPatientUseCase` confía en que la cédula ya llegó con
 * el formato V/E/P-<valor> — el use case no la vuelve a validar. Si el schema
 * dejara pasar un formato inválido, el hash de búsqueda se calcularía sobre
 * basura y el paciente creado tendría una cédula que ningún otro flujo del
 * sistema (ej. Patients) reconocería como válida.
 */
describe('CreateQuoteDtoSchema — new_recipient', () => {
  const BASE_ITEM = {
    kind: 'manual' as const,
    source_id: null,
    name: 'Servicio',
    description: '',
    quantity: 1,
    unit_price_usd: 10,
    sort_order: 0,
  };

  const validRecipient = {
    first_name: 'María',
    last_name: 'Pérez',
    email: 'maria@example.com',
    phone: '584141234567',
    cedula: 'V-12345678',
  };

  function parse(new_recipient: unknown) {
    return CreateQuoteDtoSchema.safeParse({
      patient_id: null,
      lead_id: null,
      new_recipient,
      notes: '',
      discount_type: 'amount',
      discount_value: 0,
      items: [BASE_ITEM],
    });
  }

  it('accepts a well-formed new_recipient', () => {
    const result = parse(validRecipient);
    expect(result.success).toBe(true);
  });

  it('accepts new_recipient without email — only cédula is the required identity key', () => {
    const result = parse({ ...validRecipient, email: undefined });
    expect(result.success).toBe(true);
  });

  it.each(['12345678', 'V12345678', 'X-12345678', 'V-ab', ''])(
    'rejects an invalid cédula format: %p',
    (cedula) => {
      const result = parse({ ...validRecipient, cedula });
      expect(result.success).toBe(false);
    },
  );

  it('rejects new_recipient missing the required phone', () => {
    const result = parse({ ...validRecipient, phone: undefined });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key inside new_recipient (.strict())', () => {
    const result = parse({ ...validRecipient, extra_field: 'nope' });
    expect(result.success).toBe(false);
  });

  it('accepts patient_id alone with new_recipient absent (backward-compatible shape)', () => {
    const result = CreateQuoteDtoSchema.safeParse({
      patient_id: '11111111-1111-4111-8111-111111111111',
      lead_id: null,
      notes: '',
      discount_type: 'amount',
      discount_value: 0,
      items: [BASE_ITEM],
    });
    expect(result.success).toBe(true);
  });
});
