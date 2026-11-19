/**
 * Unit tests for SequelizePatientRepository.appendAllergyNote merge rules.
 *
 * We bypass NestJS DI by constructing the class directly (decorators are
 * runtime-only and don't affect JavaScript construction).  The Sequelize model
 * is replaced with a plain object that exposes `findOne` and `update` as Jest
 * mocks — only what appendAllergyNote uses.
 */

import { SequelizePatientRepository } from './sequelize-patient.repository';

// ---------------------------------------------------------------------------
// Minimal mocks — only the methods called by appendAllergyNote
// ---------------------------------------------------------------------------

function makeModelWithAllergies(allergies: string | null) {
  const row = { allergies };
  const mockModel = {
    findOne: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue([1]),
  };
  return { mockModel, row };
}

function makeRepo(mockModel: { findOne: jest.Mock; update: jest.Mock }) {
  const mockAuditLogModel = {} as never;
  const mockCrypto = {
    encrypt: jest.fn().mockReturnValue('enc'),
    decrypt: jest.fn().mockReturnValue('dec'),
    hashForSearch: jest.fn().mockReturnValue('hash'),
  } as never;

  return new SequelizePatientRepository(mockModel as never, mockAuditLogModel, mockCrypto);
}

// All tests use 2026-07-01T14:00:00Z (Caracas = 2026-07-01T10:00:00-04:00)
const AT = new Date('2026-07-01T14:00:00Z');
const PATIENT_ID = 'pat-001';
const DOCTOR_ID = 'doc-001';

// ---------------------------------------------------------------------------

describe('SequelizePatientRepository.appendAllergyNote — merge rules', () => {
  it('Rule 0: returns false when patient not found (ownership scope)', async () => {
    const { mockModel } = makeModelWithAllergies('anything');
    mockModel.findOne.mockResolvedValue(null);

    const repo = makeRepo(mockModel);
    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'text', AT);

    expect(result).toBe(false);
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it('Rule 1 (empty → set): sets allergies directly when field is empty string', async () => {
    const { mockModel } = makeModelWithAllergies('');
    const repo = makeRepo(mockModel);

    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'Alergia al ibuprofeno', AT);

    expect(result).toBe(true);
    expect(mockModel.update).toHaveBeenCalledWith(
      { allergies: 'Alergia al ibuprofeno' },
      expect.any(Object),
    );
  });

  it('Rule 1 (null → set): sets allergies directly when field is null', async () => {
    const { mockModel } = makeModelWithAllergies(null);
    const repo = makeRepo(mockModel);

    const result = await repo.appendAllergyNote(
      PATIENT_ID,
      DOCTOR_ID,
      'Alergia a la penicilina',
      AT,
    );

    expect(result).toBe(true);
    expect(mockModel.update).toHaveBeenCalledWith(
      { allergies: 'Alergia a la penicilina' },
      expect.any(Object),
    );
  });

  it('Rule 1 (whitespace-only → set): sets allergies when field contains only spaces', async () => {
    const { mockModel } = makeModelWithAllergies('   ');
    const repo = makeRepo(mockModel);

    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'Hipertensión', AT);

    expect(result).toBe(true);
    expect(mockModel.update).toHaveBeenCalledWith(
      { allergies: 'Hipertensión' },
      expect.any(Object),
    );
  });

  it('Rule 2 (already-contains → skip): returns false and does not update when text is already present', async () => {
    const { mockModel } = makeModelWithAllergies('Alergia al ibuprofeno');
    const repo = makeRepo(mockModel);

    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'Alergia al ibuprofeno', AT);

    expect(result).toBe(false);
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it('Rule 2 (case-insensitive dedup): skips when existing contains text in different case', async () => {
    const { mockModel } = makeModelWithAllergies('ALERGIA AL IBUPROFENO');
    const repo = makeRepo(mockModel);

    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'alergia al ibuprofeno', AT);

    expect(result).toBe(false);
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it('Rule 3 (append with attribution): appends when existing has content and text is new', async () => {
    const existing = 'Hipertensión crónica';
    const { mockModel } = makeModelWithAllergies(existing);
    const repo = makeRepo(mockModel);

    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'Alergia al ibuprofeno', AT);

    expect(result).toBe(true);

    // Caracas offset: 2026-07-01T14:00:00Z - 4h = 2026-07-01T10:00:00 → "01/07/2026"
    const expectedAllergies =
      'Hipertensión crónica\nAlergia al ibuprofeno (indicado por el paciente al reservar el 01/07/2026)';
    expect(mockModel.update).toHaveBeenCalledWith(
      { allergies: expectedAllergies },
      expect.any(Object),
    );
  });

  it('Rule 3 (date in Caracas timezone): formats date as DD/MM/YYYY in America/Caracas (UTC-4)', async () => {
    // 2026-01-01T03:00:00Z = 2026-12-31T23:00:00-04:00 → date in Caracas is Dec 31
    const caracasMidnightEdge = new Date('2026-01-01T03:00:00Z');
    const { mockModel } = makeModelWithAllergies('existing note');
    const repo = makeRepo(mockModel);

    await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'new note', caracasMidnightEdge);

    const updateCall = mockModel.update.mock.calls[0]?.[0] as { allergies: string };
    // 2026-01-01T03:00:00Z - 4h = 2025-12-31T23:00:00 → Dec 31 2025 in Caracas
    expect(updateCall.allergies).toContain('31/12/2025');
  });

  it('Rule 2 (partial match): skips when existing contains the text as a substring', async () => {
    const { mockModel } = makeModelWithAllergies('alergia al ibuprofeno y naproxeno');
    const repo = makeRepo(mockModel);

    // "ibuprofeno" is a substring of the existing note
    const result = await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'ibuprofeno', AT);

    expect(result).toBe(false);
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it('scopes the query by both patientId and doctorId (anti-IDOR)', async () => {
    const { mockModel } = makeModelWithAllergies('');
    const repo = makeRepo(mockModel);

    await repo.appendAllergyNote(PATIENT_ID, DOCTOR_ID, 'nota', AT);

    expect(mockModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PATIENT_ID, doctorId: DOCTOR_ID }),
      }),
    );
  });
});
