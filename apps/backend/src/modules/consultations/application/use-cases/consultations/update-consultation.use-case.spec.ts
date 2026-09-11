import { UpdateConsultationUseCase } from './update-consultation.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { BlockContentSanitizer } from '../../block-content-sanitizer';

// sanitize-html depends on htmlparser2@12 (ESM-only) which cannot be loaded by Jest
// in CJS mode. Mock it so the BlockContentSanitizer can be instantiated in tests.
jest.mock('sanitize-html', () => {
  const fn = jest.fn((input: string) => input);
  (fn as unknown as Record<string, unknown>)['default'] = fn;
  return fn;
});

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
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

describe('UpdateConsultationUseCase', () => {
  let useCase: UpdateConsultationUseCase;
  let mockRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      getMaxSequenceForMonth: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      updatePayment: jest.fn(),
      updatePaymentDetails: jest.fn(),
      approveWithExtras: jest.fn(),
      findExtraItems: jest.fn(),
      list: jest.fn(),
      findByPatient: jest.fn(),
      findByAppointmentId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
      listWithAppointment: jest.fn(),
      applyNoShowFee: jest.fn(),
    };
    useCase = new UpdateConsultationUseCase(mockRepo, new BlockContentSanitizer());
  });

  it('updates clinical fields for the owning doctor', async () => {
    const consultation = makeConsultation();
    const updated = makeConsultation({ diagnosis: 'Migraine', treatment: 'Rest' });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      diagnosis: 'Migraine',
      treatment: 'Rest',
    });

    expect(result.diagnosis).toBe('Migraine');
    expect(result.treatment).toBe('Rest');
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: 'Migraine',
      treatment: 'Rest',
      notes: undefined,
      blocksSnapshot: undefined,
      blocksStructure: undefined,
    });
  });

  it('persists blocksSnapshot when provided', async () => {
    const snapshot = { tension_arterial: '120/80', peso: 72 };
    const consultation = makeConsultation();
    const updated = makeConsultation({ blocksSnapshot: snapshot });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksSnapshot: snapshot,
    });

    expect(result.blocksSnapshot).toEqual(snapshot);
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: snapshot,
      blocksStructure: undefined,
    });
  });

  it('does NOT include blocksSnapshot in the update call when input omits it', async () => {
    const consultation = makeConsultation();
    const updated = makeConsultation({ diagnosis: 'Flu' });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      diagnosis: 'Flu',
      // blocksSnapshot intentionally absent
    });

    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: 'Flu',
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: undefined,
      blocksStructure: undefined,
    });
  });

  it('clears blocksSnapshot when null is passed', async () => {
    const consultation = makeConsultation({ blocksSnapshot: { field: 'value' } });
    const updated = makeConsultation({ blocksSnapshot: null });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksSnapshot: null,
    });

    expect(result.blocksSnapshot).toBeNull();
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: null,
      blocksStructure: undefined,
    });
  });

  it('persists blocksStructure when provided', async () => {
    const structure = [
      { key: 'tension_arterial', label: 'Tensión arterial', content_type: 'text', sort_order: 0 },
      { key: 'peso', label: 'Peso (kg)', content_type: 'number', sort_order: 1 },
    ];
    const consultation = makeConsultation();
    const updated = makeConsultation({ blocksStructure: structure });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksStructure: structure,
    });

    expect(result.blocksStructure).toEqual(structure);
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: undefined,
      blocksStructure: structure,
    });
  });

  it('does NOT include blocksStructure in the update call when input omits it', async () => {
    const consultation = makeConsultation();
    const updated = makeConsultation({ diagnosis: 'Flu' });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      diagnosis: 'Flu',
      // blocksStructure intentionally absent
    });

    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: 'Flu',
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: undefined,
      blocksStructure: undefined,
    });
  });

  it('clears blocksStructure when null is passed', async () => {
    const consultation = makeConsultation({
      blocksStructure: [{ key: 'peso', label: 'Peso', content_type: 'number', sort_order: 0 }],
    });
    const updated = makeConsultation({ blocksStructure: null });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksStructure: null,
    });

    expect(result.blocksStructure).toBeNull();
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: undefined,
      blocksStructure: null,
    });
  });

  it('can update blocksSnapshot and blocksStructure independently in the same call', async () => {
    const snapshot = { tension_arterial: '120/80' };
    const structure = [
      { key: 'tension_arterial', label: 'Tensión arterial', content_type: 'text', sort_order: 0 },
    ];
    const consultation = makeConsultation();
    const updated = makeConsultation({ blocksSnapshot: snapshot, blocksStructure: structure });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksSnapshot: snapshot,
      blocksStructure: structure,
    });

    expect(result.blocksSnapshot).toEqual(snapshot);
    expect(result.blocksStructure).toEqual(structure);
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: snapshot,
      blocksStructure: structure,
    });
  });

  // ---------------------------------------------------------------------------
  // Column derivation from blocksSnapshot
  // ---------------------------------------------------------------------------

  describe('derives text columns from blocksSnapshot', () => {
    it('writes derived string values to each known column when the snapshot provides them', async () => {
      // Rule 2: only the four known keys are extracted; all others are ignored.
      // Rule 6 (snapshot wins): snapshot values take precedence over explicit inputs.
      const snapshot = {
        chief_complaint: 'Dolor de cabeza',
        diagnosis: 'Migraña tensional',
        treatment: 'Ibuprofeno 400 mg',
        notes: 'Control en 7 días',
        tension_arterial: '120/80', // not a known column key — ignored
      };
      const consultation = makeConsultation();
      const updated = makeConsultation({
        chiefComplaint: 'Dolor de cabeza',
        diagnosis: 'Migraña tensional',
        treatment: 'Ibuprofeno 400 mg',
        notes: 'Control en 7 días',
      });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: snapshot,
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        CONSULTATION_ID,
        DOCTOR_ID,
        expect.objectContaining({
          chiefComplaint: 'Dolor de cabeza',
          diagnosis: 'Migraña tensional',
          treatment: 'Ibuprofeno 400 mg',
          notes: 'Control en 7 días',
        }),
      );
    });

    it('leaves a column undefined when that key is absent from the snapshot (Rule 4)', async () => {
      // THE MOST IMPORTANT RULE:
      // chief_complaint is sometimes filled from the patient's booking reason.
      // If the doctor's template has no chief_complaint block, the key is absent
      // from the snapshot — we must NOT overwrite the existing column value.
      // Returning undefined tells the repository "do not touch this column".
      const snapshot = {
        // chief_complaint intentionally absent — doctor's template does not have it
        diagnosis: 'Rinofaringitis aguda',
        treatment: 'Paracetamol 500 mg',
      };
      const consultation = makeConsultation({ chiefComplaint: 'Fiebre desde ayer' });
      const updated = makeConsultation({
        chiefComplaint: 'Fiebre desde ayer',
        diagnosis: 'Rinofaringitis aguda',
        treatment: 'Paracetamol 500 mg',
      });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: snapshot,
        // no explicit chiefComplaint — the column must remain untouched
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        CONSULTATION_ID,
        DOCTOR_ID,
        expect.objectContaining({
          chiefComplaint: undefined, // absent from snapshot → must NOT be overwritten
          diagnosis: 'Rinofaringitis aguda',
          treatment: 'Paracetamol 500 mg',
        }),
      );
    });

    it('writes null to a column when the snapshot provides an empty string for that key (Rule 5)', async () => {
      // An empty string is an intentional clear: the user deleted the block content.
      // The column must be set to null (not left untouched).
      const snapshot = {
        diagnosis: '', // intentionally erased
        treatment: 'Reposo relativo',
      };
      const consultation = makeConsultation();
      const updated = makeConsultation({ diagnosis: null, treatment: 'Reposo relativo' });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: snapshot,
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        CONSULTATION_ID,
        DOCTOR_ID,
        expect.objectContaining({
          diagnosis: null, // empty string → explicit null (clear the column)
          treatment: 'Reposo relativo',
        }),
      );
    });

    it('leaves a column undefined when the snapshot has a non-string value for that key (Rule 3)', async () => {
      // Non-string values (objects, arrays, numbers) must never be written to text
      // columns.  The snapshot "owns" these keys (Rule 6), so the explicit input
      // is also discarded — only undefined (do not touch) is safe here.
      const snapshot = {
        chief_complaint: 'Headache', // string → should be derived normally
        diagnosis: { severity: 'moderate', icd10: 'G43' }, // object → must not corrupt the column
        notes: ['note one', 'note two'], // array → same
      };
      const consultation = makeConsultation();
      const updated = makeConsultation({ chiefComplaint: 'Headache' });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: snapshot,
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        CONSULTATION_ID,
        DOCTOR_ID,
        expect.objectContaining({
          chiefComplaint: 'Headache', // string value → derived normally
          diagnosis: undefined, // object → do not write
          notes: undefined, // array → do not write
        }),
      );
    });

    it('snapshot value wins over explicit input when the key is present in the snapshot (Rule 6)', async () => {
      // If both an explicit column value and a snapshot value are provided for the
      // same key, the snapshot wins.  This prevents the two sources from diverging.
      const snapshot = { diagnosis: 'Diagnóstico del snapshot' };
      const consultation = makeConsultation();
      const updated = makeConsultation({ diagnosis: 'Diagnóstico del snapshot' });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: snapshot,
        diagnosis: 'Valor explícito — debe ser ignorado', // explicit input present too
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        CONSULTATION_ID,
        DOCTOR_ID,
        expect.objectContaining({
          diagnosis: 'Diagnóstico del snapshot', // snapshot wins
        }),
      );
    });

    it('explicit input wins for a column when that key is absent from the snapshot (Rule 6)', async () => {
      // When a column key is absent from the snapshot, the explicit input value
      // is used — this keeps backward-compatible callers working.
      const snapshot = { treatment: 'Paracetamol' }; // no diagnosis key
      const consultation = makeConsultation();
      const updated = makeConsultation({
        diagnosis: 'Valor explícito',
        treatment: 'Paracetamol',
      });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: snapshot,
        diagnosis: 'Valor explícito', // absent from snapshot → this wins
      });

      expect(mockRepo.update).toHaveBeenCalledWith(
        CONSULTATION_ID,
        DOCTOR_ID,
        expect.objectContaining({
          diagnosis: 'Valor explícito', // explicit wins when key absent from snapshot
          treatment: 'Paracetamol', // derived from snapshot
        }),
      );
    });

    it('does not derive columns when blocksSnapshot is absent (Rule 7)', async () => {
      // When no snapshot is provided, column-only updates work exactly as before.
      const consultation = makeConsultation();
      const updated = makeConsultation({ diagnosis: 'Solo columnas', notes: 'Sin snapshot' });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        diagnosis: 'Solo columnas',
        notes: 'Sin snapshot',
        // blocksSnapshot intentionally absent
      });

      expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
        chiefComplaint: undefined,
        diagnosis: 'Solo columnas',
        treatment: undefined,
        notes: 'Sin snapshot',
        blocksSnapshot: undefined,
        blocksStructure: undefined,
      });
    });

    it('does not derive columns when blocksSnapshot is null (Rule 7)', async () => {
      // Clearing the snapshot (null) must not accidentally clear the columns.
      const consultation = makeConsultation();
      const updated = makeConsultation({ blocksSnapshot: null });
      mockRepo.findById.mockResolvedValue(consultation);
      mockRepo.update.mockResolvedValue(updated);

      await useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        blocksSnapshot: null,
      });

      expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
        chiefComplaint: undefined,
        diagnosis: undefined,
        treatment: undefined,
        notes: undefined,
        blocksSnapshot: null,
        blocksStructure: undefined,
      });
    });
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
      }),
    ).rejects.toThrow(ConsultationNotFoundError);
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    // Consultation owned by DOCTOR_ID but requested by OTHER_DOCTOR_ID
    // findById is scoped, so it should return null — but simulate a case where
    // the entity is found but ownership check fails.
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    // Override findById to return the consultation (bypassing DB scope)
    mockRepo.findById.mockResolvedValue(consultation);

    // When OTHER_DOCTOR_ID queries — doctorId mismatch triggers NotOwned
    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);
  });
});
