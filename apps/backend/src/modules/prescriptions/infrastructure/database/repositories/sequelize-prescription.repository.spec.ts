/**
 * Integration tests for SequelizePrescriptionRepository.
 *
 * Requires the Docker Postgres instance to be running:
 *   host: localhost, port: 5432, db: deltamedical, user: delta / delta_dev_password
 *
 * Prescriptions have FK constraints to profiles (doctor_id) and patients (patient_id).
 * This test seeds a profile and a patient row, then cleans them up in afterAll.
 *
 * Run only these tests with:
 *   export PATH="/opt/homebrew/bin:$HOME/.local/share/pnpm/bin:$PATH"
 *   pnpm nx test backend --testPathPattern="sequelize-prescription.repository.spec"
 */
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { PrescriptionModel } from '../models/prescription.model';
import { SequelizePrescriptionRepository } from './sequelize-prescription.repository';
import { Prescription } from '../../../domain/entities/prescription.entity';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import { randomUUID } from 'crypto';

const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgres://delta:delta_dev_password@localhost:5432/deltamedical';

const DOCTOR_ID = 'f2000000-0000-0000-0000-000000000001';
const PATIENT_ID = 'f2000000-0000-0000-0000-000000000002';

// Fake CryptoService — base64 round-trip instead of real AES.
const fakeCrypto = {
  encrypt: (v: string) => Buffer.from(v).toString('base64'),
  decrypt: (v: string) => Buffer.from(v, 'base64').toString('utf8'),
  hashForSearch: (v: string) => v,
};

describe('SequelizePrescriptionRepository (integration)', () => {
  let sequelize: Sequelize;
  let repo: SequelizePrescriptionRepository;
  const createdIds: string[] = [];

  beforeAll(async () => {
    sequelize = new Sequelize(TEST_DB_URL, {
      dialect: 'postgres',
      models: [PrescriptionModel],
      logging: false,
      dialectOptions: { ssl: false },
    });
    await sequelize.authenticate();

    repo = new SequelizePrescriptionRepository(PrescriptionModel as never, fakeCrypto as never);

    // Seed profile (doctor)
    await sequelize.query(
      `INSERT INTO profiles (id, full_name, email, role, created_at, updated_at)
       VALUES (:id, 'Prescription Test Doctor', 'rxtest+integration@dev.local', 'doctor', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: DOCTOR_ID }, type: QueryTypes.INSERT },
    );

    // Seed patient
    await sequelize.query(
      `INSERT INTO patients (id, doctor_id, full_name, created_at, updated_at)
       VALUES (:id, :doctorId, 'UnhUZXN0UGF0aWVudA==', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: PATIENT_ID, doctorId: DOCTOR_ID }, type: QueryTypes.INSERT },
    );
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await PrescriptionModel.destroy({ where: { id: createdIds } });
    }
    await sequelize.query('DELETE FROM patients WHERE id = :id', {
      replacements: { id: PATIENT_ID },
      type: QueryTypes.DELETE,
    });
    await sequelize.query('DELETE FROM profiles WHERE id = :id', {
      replacements: { id: DOCTOR_ID },
      type: QueryTypes.DELETE,
    });
    await sequelize.close();
  });

  function buildPrescription(): Prescription {
    const now = new Date();
    return Prescription.create({
      id: randomUUID(),
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId: null,
      medication: 'Metformin',
      dosage: '500mg',
      frequency: 'twice daily',
      duration: '30 days',
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  it('saves a prescription with encrypted PHI fields (medication, dosage)', async () => {
    const prescription = buildPrescription();
    const saved = await repo.save(prescription);
    createdIds.push(saved.id);

    expect(saved.id).toBe(prescription.id);
    expect(saved.medication).toBe('Metformin'); // decrypted
    expect(saved.dosage).toBe('500mg'); // decrypted

    // Verify the raw DB value is NOT plaintext
    const rawRows = await sequelize.query<{ medication: string; dosage: string }>(
      'SELECT medication, dosage FROM prescriptions WHERE id = :id',
      { replacements: { id: saved.id }, type: QueryTypes.SELECT },
    );
    const rawRow = rawRows[0];
    expect(rawRow?.medication).not.toBe('Metformin');
    expect(rawRow?.medication).toBeTruthy();
    expect(rawRow?.dosage).not.toBe('500mg');
  });

  it('stores frequency, duration, notes in plaintext', async () => {
    const prescription = buildPrescription();
    const saved = await repo.save(prescription);
    createdIds.push(saved.id);

    const rawRows = await sequelize.query<{ frequency: string; duration: string }>(
      'SELECT frequency, duration FROM prescriptions WHERE id = :id',
      { replacements: { id: saved.id }, type: QueryTypes.SELECT },
    );
    const rawRow = rawRows[0];
    // Non-PHI fields should be stored as-is
    expect(rawRow?.frequency).toBe('twice daily');
    expect(rawRow?.duration).toBe('30 days');
  });

  it('finds a prescription by ID scoped to doctorId', async () => {
    const prescription = buildPrescription();
    const saved = await repo.save(prescription);
    createdIds.push(saved.id);

    const found = await repo.findById(saved.id, DOCTOR_ID);
    expect(found).not.toBeNull();
    expect(found?.medication).toBe('Metformin');
  });

  it('returns null when findById is called with a different doctorId', async () => {
    const prescription = buildPrescription();
    const saved = await repo.save(prescription);
    createdIds.push(saved.id);

    const found = await repo.findById(saved.id, randomUUID());
    expect(found).toBeNull();
  });

  it('findByPatient returns prescriptions scoped to doctorId', async () => {
    const p1 = buildPrescription();
    const p2 = buildPrescription();
    const s1 = await repo.save(p1);
    const s2 = await repo.save(p2);
    createdIds.push(s1.id, s2.id);

    const results = await repo.findByPatient(PATIENT_ID, DOCTOR_ID);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((r) => r.patientId === PATIENT_ID)).toBe(true);
    expect(results.every((r) => r.doctorId === DOCTOR_ID)).toBe(true);
  });

  it('returns null for a non-existent prescription', async () => {
    const result = await repo.findById(randomUUID(), DOCTOR_ID);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests for safeDecrypt — no DB required
// ---------------------------------------------------------------------------
describe('SequelizePrescriptionRepository.safeDecrypt (unit)', () => {
  it('throws DecryptionError when crypto.decrypt fails', async () => {
    const failingCrypto = {
      encrypt: (v: string) => v,
      decrypt: (_v: string) => {
        throw new Error('invalid auth tag');
      },
      hashForSearch: (v: string) => v,
    };

    const stubModel = {
      id: randomUUID(),
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId: null,
      medication: 'corrupted-ciphertext',
      dosage: null,
      frequency: null,
      duration: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stubPrescriptionModel = {
      findOne: jest.fn().mockResolvedValue(stubModel),
    };

    const repo = new SequelizePrescriptionRepository(
      stubPrescriptionModel as never,
      failingCrypto as never,
    );

    await expect(repo.findById(stubModel.id, stubModel.doctorId)).rejects.toThrow(DecryptionError);
  });

  it('returns null dosage when dosage field is null without calling decrypt', async () => {
    const cryptoSpy = {
      encrypt: jest.fn(),
      decrypt: jest.fn().mockReturnValue('decrypted-medication'),
      hashForSearch: jest.fn(),
    };

    const stubModel = {
      id: randomUUID(),
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId: null,
      medication: 'encrypted-medication',
      dosage: null, // null — safeDecrypt should short-circuit
      frequency: null,
      duration: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stubPrescriptionModel = {
      findOne: jest.fn().mockResolvedValue(stubModel),
    };

    const repo = new SequelizePrescriptionRepository(
      stubPrescriptionModel as never,
      cryptoSpy as never,
    );

    const result = await repo.findById(stubModel.id, stubModel.doctorId);
    expect(result?.dosage).toBeNull();
    // decrypt called once for medication, but not for dosage (null short-circuit)
    expect(cryptoSpy.decrypt).toHaveBeenCalledTimes(1);
  });
});
