import { toConsultationResponse, toConsultationListItem } from './consultation.mapper';
import { Consultation } from '../../domain/entities/consultation.entity';
import { ConsultationExtraItem } from '../../domain/entities/consultation-extra-item.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202606-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('toConsultationResponse', () => {
  it('includes blocks_snapshot in the response when it has a value', () => {
    const snapshot = { tension_arterial: '120/80', peso: 72 };
    const consultation = makeConsultation({ blocksSnapshot: snapshot });

    const result = toConsultationResponse(consultation);

    expect(result.blocks_snapshot).toEqual(snapshot);
  });

  it('includes blocks_snapshot as null when the entity has null', () => {
    const consultation = makeConsultation({ blocksSnapshot: null });

    const result = toConsultationResponse(consultation);

    expect(result.blocks_snapshot).toBeNull();
  });

  it('includes blocks_snapshot as null when the entity property is undefined (default)', () => {
    // Entity constructor defaults blocksSnapshot to null via ?? null
    const consultation = makeConsultation();

    const result = toConsultationResponse(consultation);

    expect(result.blocks_snapshot).toBeNull();
  });

  it('includes blocks_structure when the entity has a value', () => {
    const structure = [
      { key: 'tension_arterial', label: 'Tensión arterial', content_type: 'text', sort_order: 0 },
    ];
    const consultation = makeConsultation({ blocksStructure: structure });

    const result = toConsultationResponse(consultation);

    expect(result.blocks_structure).toEqual(structure);
  });

  it('includes blocks_structure as null when the entity has null', () => {
    const consultation = makeConsultation({ blocksStructure: null });

    const result = toConsultationResponse(consultation);

    expect(result.blocks_structure).toBeNull();
  });

  it('includes blocks_structure as null when not provided (default)', () => {
    // Entity constructor defaults blocksStructure to null via ?? null
    const consultation = makeConsultation();

    const result = toConsultationResponse(consultation);

    expect(result.blocks_structure).toBeNull();
  });

  it('maps all standard scalar fields correctly', () => {
    const consultation = makeConsultation({
      chiefComplaint: 'Headache',
      diagnosis: 'Migraine',
      treatment: 'Rest',
      notes: 'Follow up in 1 week',
      paymentStatus: 'approved',
      paymentMethod: 'zelle',
      amount: 50,
      paymentDate: now,
    });

    const result = toConsultationResponse(consultation);

    expect(result.id).toBe(CONSULTATION_ID);
    expect(result.doctor_id).toBe(DOCTOR_ID);
    expect(result.patient_id).toBe(PATIENT_ID);
    expect(result.consultation_code).toBe('DLT-202606-0001');
    expect(result.chief_complaint).toBe('Headache');
    expect(result.diagnosis).toBe('Migraine');
    expect(result.treatment).toBe('Rest');
    expect(result.notes).toBe('Follow up in 1 week');
    expect(result.payment_status).toBe('approved');
    expect(result.payment_method).toBe('zelle');
    expect(result.amount).toBe(50);
    expect(result.payment_date).toBe(now.toISOString());
    expect(result.created_at).toBe(now.toISOString());
    expect(result.updated_at).toBe(now.toISOString());
  });

  it('maps payment_reference when provided', () => {
    const consultation = makeConsultation({ paymentReference: 'REF-0042' });
    const result = toConsultationResponse(consultation);
    expect(result.payment_reference).toBe('REF-0042');
  });

  it('maps payment_reference as null when absent', () => {
    const consultation = makeConsultation();
    const result = toConsultationResponse(consultation);
    expect(result.payment_reference).toBeNull();
  });

  it('maps payment_receipt_url when provided', () => {
    const consultation = makeConsultation({
      paymentReceiptUrl: 'https://storage.example.com/receipts/abc.pdf',
    });
    const result = toConsultationResponse(consultation);
    expect(result.payment_receipt_url).toBe('https://storage.example.com/receipts/abc.pdf');
  });

  it('maps payment_receipt_url as null when absent', () => {
    const consultation = makeConsultation();
    const result = toConsultationResponse(consultation);
    expect(result.payment_receipt_url).toBeNull();
  });
});

describe('toConsultationResponse — enrichment fields', () => {
  it('exposes patient_name when populated from a JOIN query', () => {
    const consultation = makeConsultation({ patientName: 'María Rodríguez' });
    const result = toConsultationResponse(consultation);
    expect(result.patient_name).toBe('María Rodríguez');
  });

  it('exposes patient_name as null when not populated', () => {
    const consultation = makeConsultation({ patientName: null });
    const result = toConsultationResponse(consultation);
    expect(result.patient_name).toBeNull();
  });

  it('exposes appointment_status when populated from a JOIN query', () => {
    const consultation = makeConsultation({ appointmentStatus: 'confirmed' });
    const result = toConsultationResponse(consultation);
    expect(result.appointment_status).toBe('confirmed');
  });

  it('exposes appointment_status as null when no appointment is linked', () => {
    const consultation = makeConsultation({ appointmentStatus: null });
    const result = toConsultationResponse(consultation);
    expect(result.appointment_status).toBeNull();
  });
});

describe('toConsultationResponse — base_amount and extra_items', () => {
  it('exposes base_amount when set (post first approval)', () => {
    const consultation = makeConsultation({ amount: 50, baseAmount: 30 });
    const result = toConsultationResponse(consultation);
    expect(result.base_amount).toBe(30);
  });

  it('exposes base_amount as null before first approval', () => {
    const consultation = makeConsultation({ baseAmount: null });
    const result = toConsultationResponse(consultation);
    expect(result.base_amount).toBeNull();
  });

  it('exposes extra_items as empty array by default', () => {
    const consultation = makeConsultation();
    const result = toConsultationResponse(consultation);
    expect(result.extra_items).toEqual([]);
  });

  it('serializes service extra_items with id, description, amount_usd, product_id=null, quantity=1, unit_price_usd=null', () => {
    const extraItem = ConsultationExtraItem.create({
      id: 'eeeeeeee-0000-0000-0000-000000000001',
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      description: 'Limpieza dental',
      amountUsd: 20,
      createdAt: now,
    });
    const consultation = makeConsultation({ extraItems: [extraItem] });
    const result = toConsultationResponse(consultation);

    expect(result.extra_items).toEqual([
      {
        id: 'eeeeeeee-0000-0000-0000-000000000001',
        description: 'Limpieza dental',
        amount_usd: 20,
        product_id: null,
        quantity: 1,
        unit_price_usd: null,
      },
    ]);
  });

  it('serializes product extra_items with product_id, quantity, unit_price_usd — enables frontend re-hydration', () => {
    const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';
    const productItem = ConsultationExtraItem.create({
      id: 'eeeeeeee-0000-0000-0000-000000000002',
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      description: 'Crema A',
      amountUsd: 30,
      productId: PRODUCT_ID,
      quantity: 3,
      unitPriceUsd: 10,
      createdAt: now,
    });
    const consultation = makeConsultation({ extraItems: [productItem] });
    const result = toConsultationResponse(consultation);

    expect(result.extra_items).toEqual([
      {
        id: 'eeeeeeee-0000-0000-0000-000000000002',
        description: 'Crema A',
        amount_usd: 30,
        product_id: PRODUCT_ID,
        quantity: 3,
        unit_price_usd: 10,
      },
    ]);
  });
});

describe('toConsultationListItem', () => {
  it('delegates to toConsultationResponse and includes blocks_snapshot', () => {
    const snapshot = { presion: '110/70' };
    const consultation = makeConsultation({ blocksSnapshot: snapshot });

    const result = toConsultationListItem(consultation);

    expect(result.blocks_snapshot).toEqual(snapshot);
  });

  it('includes patient_name and appointment_status in list items', () => {
    const consultation = makeConsultation({
      patientName: 'Carlos González',
      appointmentStatus: 'scheduled',
    });
    const result = toConsultationListItem(consultation);
    expect(result.patient_name).toBe('Carlos González');
    expect(result.appointment_status).toBe('scheduled');
  });
});
