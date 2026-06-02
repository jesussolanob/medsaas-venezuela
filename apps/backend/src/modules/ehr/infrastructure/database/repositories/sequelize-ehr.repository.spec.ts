/**
 * Integration tests for SequelizeEhrRepository.
 *
 * Requires the Docker Postgres instance to be running:
 *   host: localhost, port: 5432, db: deltamedical, user: delta / delta_dev_password
 *
 * EHR records have FK constraints to profiles (doctor_id) and patients (patient_id).
 * This test seeds a profile and a patient row, then cleans them up in afterAll.
 *
 * Run only these tests with:
 *   export PATH="/opt/homebrew/bin:$HOME/.local/share/pnpm/bin:$PATH"
 *   pnpm nx test backend --testPathPattern="sequelize-ehr.repository.spec"
 */
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { EhrRecordModel } from '../models/ehr-record.model';
import { SequelizeEhrRepository } from './sequelize-ehr.repository';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import { randomUUID } from 'crypto';

const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgres://delta:delta_dev_password@localhost:5432/deltamedical';

const DOCTOR_ID = 'f1000000-0000-0000-0000-000000000001';
const PATIENT_ID = 'f1000000-0000-0000-0000-000000000002';

// Fake CryptoService — base64 round-trip instead of real AES.
const fakeCrypto = {
  encrypt: (v: string) => Buffer.from(v).toString('base64'),
  decrypt: (v: string) => Buffer.from(v, 'base64').toString('utf8'),
  hashForSearch: (v: string) => v,
};

describe('SequelizeEhrRepository (integration)', () => {
  let sequelize: Sequelize;
  let repo: SequelizeEhrRepository;
  const createdIds: string[] = [];

  beforeAll(async () => {
    sequelize = new Sequelize(TEST_DB_URL, {
      dialect: 'postgres',
      models: [EhrRecordModel],
      logging: false,
      dialectOptions: { ssl: false },
    });
    await sequelize.authenticate();

    repo = new SequelizeEhrRepository(EhrRecordModel as never, fakeCrypto as never, sequelize);

    // Seed profile (doctor)
    await sequelize.query(
      `INSERT INTO profiles (id, full_name, email, role, created_at, updated_at)
       VALUES (:id, 'EHR Test Doctor', 'ehrtest+integration@dev.local', 'doctor', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: DOCTOR_ID }, type: QueryTypes.INSERT },
    );

    // Seed patient
    await sequelize.query(
      `INSERT INTO patients (id, doctor_id, full_name, created_at, updated_at)
       VALUES (:id, :doctorId, 'RUhSVGVzdFBhdGllbnQ=', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: PATIENT_ID, doctorId: DOCTOR_ID }, type: QueryTypes.INSERT },
    );
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await EhrRecordModel.destroy({ where: { id: createdIds } });
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

  function buildRecord(): EhrRecord {
    const now = new Date();
    return EhrRecord.create({
      id: randomUUID(),
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId: null,
      diagnosis: 'Hypertension',
      treatmentPlan: 'Lifestyle changes and medication',
      createdAt: now,
      updatedAt: now,
    });
  }

  it('saves an EHR record with encrypted PHI fields', async () => {
    const record = buildRecord();
    const saved = await repo.save(record);
    createdIds.push(saved.id);

    expect(saved.id).toBe(record.id);
    expect(saved.diagnosis).toBe('Hypertension'); // decrypted by toDomain

    // Verify the raw DB value is NOT plaintext (it's base64 in tests, ciphertext in prod)
    const rawRows = await sequelize.query<{ diagnosis: string }>(
      'SELECT diagnosis FROM ehr_records WHERE id = :id',
      { replacements: { id: saved.id }, type: QueryTypes.SELECT },
    );
    const rawRow = rawRows[0];
    expect(rawRow?.diagnosis).not.toBe('Hypertension');
    expect(rawRow?.diagnosis).toBeTruthy();
  });

  it('finds an EHR record by ID scoped to doctorId', async () => {
    const record = buildRecord();
    const saved = await repo.save(record);
    createdIds.push(saved.id);

    const found = await repo.findById(saved.id, DOCTOR_ID);
    expect(found).not.toBeNull();
    expect(found?.diagnosis).toBe('Hypertension');
  });

  it('returns null when findById is called with a different doctorId', async () => {
    const record = buildRecord();
    const saved = await repo.save(record);
    createdIds.push(saved.id);

    const found = await repo.findById(saved.id, randomUUID());
    expect(found).toBeNull();
  });

  it('findByPatient returns all records for the patient scoped to doctorId', async () => {
    const r1 = buildRecord();
    const r2 = buildRecord();
    const saved1 = await repo.save(r1);
    const saved2 = await repo.save(r2);
    createdIds.push(saved1.id, saved2.id);

    const results = await repo.findByPatient(PATIENT_ID, DOCTOR_ID);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((r) => r.patientId === PATIENT_ID)).toBe(true);
    expect(results.every((r) => r.doctorId === DOCTOR_ID)).toBe(true);
  });

  it('updates clinical fields', async () => {
    const record = buildRecord();
    const saved = await repo.save(record);
    createdIds.push(saved.id);

    const updated = await repo.update(saved.id, DOCTOR_ID, {
      diagnosis: 'Type 2 Diabetes',
      treatmentPlan: 'Metformin 500mg daily',
    });

    expect(updated.diagnosis).toBe('Type 2 Diabetes');
    expect(updated.treatmentPlan).toBe('Metformin 500mg daily');
  });

  it('returns null for a non-existent EHR record', async () => {
    const result = await repo.findById(randomUUID(), DOCTOR_ID);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests for safeDecrypt — no DB required
// ---------------------------------------------------------------------------
describe('SequelizeEhrRepository.safeDecrypt (unit)', () => {
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
      diagnosis: 'corrupted-ciphertext',
      treatmentPlan: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stubEhrModel = {
      findOne: jest.fn().mockResolvedValue(stubModel),
    };

    const repo = new SequelizeEhrRepository(
      stubEhrModel as never,
      failingCrypto as never,
      {} as never,
    );

    await expect(repo.findById(stubModel.id, stubModel.doctorId)).rejects.toThrow(DecryptionError);
  });

  it('returns null for a null encrypted field without calling decrypt', async () => {
    const cryptoSpy = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      hashForSearch: jest.fn(),
    };

    const stubModel = {
      id: randomUUID(),
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId: null,
      diagnosis: null,
      treatmentPlan: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stubEhrModel = {
      findOne: jest.fn().mockResolvedValue(stubModel),
    };

    const repo = new SequelizeEhrRepository(stubEhrModel as never, cryptoSpy as never, {} as never);

    const result = await repo.findById(stubModel.id, stubModel.doctorId);
    expect(result?.diagnosis).toBeNull();
    expect(cryptoSpy.decrypt).not.toHaveBeenCalled();
  });
});
