import { toConsultationResponse, toConsultationListItem } from './consultation.mapper';
import { Consultation } from '../../domain/entities/consultation.entity';

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
});

describe('toConsultationListItem', () => {
  it('delegates to toConsultationResponse and includes blocks_snapshot', () => {
    const snapshot = { presion: '110/70' };
    const consultation = makeConsultation({ blocksSnapshot: snapshot });

    const result = toConsultationListItem(consultation);

    expect(result.blocks_snapshot).toEqual(snapshot);
  });
});
