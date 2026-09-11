/**
 * Integration tests for SequelizeConsultationRepository.
 *
 * Requires the Docker Postgres instance to be running:
 *   host: localhost, port: 5432, db: deltamedical, user: delta / delta_dev_password
 *
 * Consultations have FK constraints to profiles (doctor_id) and patients (patient_id).
 * This test seeds a profile and a patient row, then cleans them up in afterAll.
 *
 * Excluded from the default `nx test backend` run. Run them with:
 *   export PATH="/opt/homebrew/bin:$HOME/.local/share/pnpm/bin:$PATH"
 *   docker compose -f docker/docker-compose.yml up -d postgres
 *   pnpm nx run backend:test-integration
 */
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { ConsultationModel } from '../models/consultation.model';
import { ConsultationExtraItemModel } from '../models/consultation-extra-item.model';
import { SequelizeConsultationRepository } from './sequelize-consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import { randomUUID } from 'crypto';

const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgres://delta:delta_dev_password@localhost:5432/deltamedical';

// Fixed UUIDs for the seeded profile and patient so we can clean them up reliably.
const DOCTOR_ID = 'f0000000-0000-0000-0000-000000000001';
const PATIENT_ID = 'f0000000-0000-0000-0000-000000000002';

// Fake CryptoService that performs no-op encryption for integration tests.
// In tests, we verify that the encrypted value round-trips correctly.
const fakeCrypto = {
  encrypt: (v: string) => Buffer.from(v).toString('base64'),
  decrypt: (v: string) => Buffer.from(v, 'base64').toString('utf8'),
  hashForSearch: (v: string) => v,
};

describe('SequelizeConsultationRepository (integration)', () => {
  let sequelize: Sequelize;
  let repo: SequelizeConsultationRepository;
  const createdConsultationIds: string[] = [];

  beforeAll(async () => {
    sequelize = new Sequelize(TEST_DB_URL, {
      dialect: 'postgres',
      models: [ConsultationModel],
      logging: false,
      dialectOptions: { ssl: false },
    });
    await sequelize.authenticate();

    repo = new SequelizeConsultationRepository(
      ConsultationModel as never,
      ConsultationExtraItemModel as never,
      fakeCrypto as never,
      sequelize,
    );

    // Seed profile (doctor) — required by doctor_id FK in consultations.
    await sequelize.query(
      `INSERT INTO profiles (id, full_name, email, role, created_at, updated_at)
       VALUES (:id, 'Test Doctor', 'testdoc+integration@dev.local', 'doctor', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: DOCTOR_ID }, type: QueryTypes.INSERT },
    );

    // Seed patient — required by patient_id FK in consultations.
    await sequelize.query(
      `INSERT INTO patients (id, doctor_id, full_name, created_at, updated_at)
       VALUES (:id, :doctorId, 'VGVzdCBQYXRpZW50', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: PATIENT_ID, doctorId: DOCTOR_ID }, type: QueryTypes.INSERT },
    );
  });

  afterAll(async () => {
    // Clean up consultations created by tests (before removing profile/patient due to FK CASCADE).
    if (createdConsultationIds.length > 0) {
      await ConsultationModel.destroy({ where: { id: createdConsultationIds } });
    }
    // Clean up seeded patient and profile.
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

  function buildConsultation(code: string): Consultation {
    const now = new Date();
    return Consultation.create({
      id: randomUUID(),
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationCode: code,
      consultationDate: now,
      chiefComplaint: 'Test chief complaint',
      diagnosis: 'Test diagnosis',
      notes: 'Test notes',
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  it('saves a consultation with encrypted clinical fields', async () => {
    const consultation = buildConsultation(`DLT-202606-${randomUUID().slice(0, 4)}`);

    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    // Verify it was persisted
    expect(saved.id).toBe(consultation.id);
    expect(saved.consultationCode).toBe(consultation.consultationCode);
    // chiefComplaint is decrypted by toDomain — should be plaintext
    expect(saved.chiefComplaint).toBe('Test chief complaint');

    // Verify the raw DB value is encrypted (not plaintext)
    const rawRows = await sequelize.query<{ chief_complaint: string }>(
      'SELECT chief_complaint FROM consultations WHERE id = :id',
      { replacements: { id: saved.id }, type: QueryTypes.SELECT },
    );
    const rawRow = rawRows[0];
    expect(rawRow?.chief_complaint).not.toBe('Test chief complaint');
    expect(rawRow?.chief_complaint).toBeTruthy(); // Should be base64 ciphertext
  });

  it('finds a consultation by ID scoped to doctorId', async () => {
    const consultation = buildConsultation(`DLT-202606-${randomUUID().slice(0, 4)}`);
    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    const found = await repo.findById(saved.id, DOCTOR_ID);
    expect(found).not.toBeNull();
    expect(found?.chiefComplaint).toBe('Test chief complaint');
  });

  it('returns null when findById is called with a different doctorId', async () => {
    const consultation = buildConsultation(`DLT-202606-${randomUUID().slice(0, 4)}`);
    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    const found = await repo.findById(saved.id, randomUUID());
    expect(found).toBeNull();
  });

  it('finds a consultation by consultation_code', async () => {
    const code = `DLT-202606-${randomUUID().slice(0, 4)}`;
    const consultation = buildConsultation(code);
    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    const found = await repo.findByCode(code);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(saved.id);
  });

  it('returns null for a non-existent consultation', async () => {
    const result = await repo.findById(randomUUID(), DOCTOR_ID);
    expect(result).toBeNull();
  });

  it('countByDoctorAndMonth returns the count for the given period', async () => {
    const code = `DLT-202606-${randomUUID().slice(0, 4)}`;
    const consultation = buildConsultation(code);
    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    const count = await repo.countByDoctorAndMonth(DOCTOR_ID, '202606');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('updates clinical fields', async () => {
    const consultation = buildConsultation(`DLT-202606-${randomUUID().slice(0, 4)}`);
    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    const updated = await repo.update(saved.id, DOCTOR_ID, {
      diagnosis: 'Updated diagnosis',
      treatment: 'New treatment',
    });

    expect(updated.diagnosis).toBe('Updated diagnosis');
    expect(updated.treatment).toBe('New treatment');
  });

  it('updatePayment transitions payment to approved', async () => {
    const consultation = buildConsultation(`DLT-202606-${randomUUID().slice(0, 4)}`);
    const saved = await repo.save(consultation);
    createdConsultationIds.push(saved.id);

    const updated = await repo.updatePayment(saved.id, DOCTOR_ID, {
      paymentStatus: 'approved',
      paymentMethod: 'zelle',
      paymentDate: new Date(),
      amount: 75,
    });

    expect(updated.paymentStatus).toBe('approved');
    expect(updated.paymentMethod).toBe('zelle');
    expect(updated.amount).toBe(75);
  });

  it('list returns consultations scoped to the doctor', async () => {
    const result = await repo.list({
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 50,
    });

    expect(result.items.length).toBeGreaterThanOrEqual(0);
    expect(result.items.every((c) => c.doctorId === DOCTOR_ID)).toBe(true);
  });

  it('findByPatient returns consultations for a patient scoped to doctorId', async () => {
    const result = await repo.findByPatient(PATIENT_ID, DOCTOR_ID, 1, 20);

    expect(result.items.every((c) => c.patientId === PATIENT_ID)).toBe(true);
    expect(result.items.every((c) => c.doctorId === DOCTOR_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for safeDecrypt — no DB required
// findById now uses raw SQL (sequelize.query), so the mock provides a raw enriched row.
// ---------------------------------------------------------------------------
describe('SequelizeConsultationRepository.safeDecrypt (unit)', () => {
  /** Build a minimal enriched raw SQL row (snake_case, as QueryTypes.SELECT returns). */
  const makeRawRow = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    doctor_id: 'f0000000-0000-0000-0000-000000000001',
    patient_id: 'f0000000-0000-0000-0000-000000000002',
    appointment_id: null,
    consultation_code: 'DLT-202606-9999',
    consultation_date: new Date().toISOString(),
    chief_complaint: null,
    diagnosis: null,
    treatment: null,
    notes: null,
    payment_status: 'pending',
    payment_method: null,
    amount: null,
    base_amount: null,
    payment_date: null,
    payment_reference: null,
    payment_receipt_url: null,
    blocks_snapshot: null,
    blocks_structure: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    patient_full_name_enc: null,
    appointment_status: null,
    ...overrides,
  });

  it('throws DecryptionError when crypto.decrypt fails', async () => {
    const failingCrypto = {
      encrypt: (v: string) => v,
      decrypt: (_v: string) => {
        throw new Error('invalid auth tag');
      },
      hashForSearch: (v: string) => v,
    };

    const rawRow = makeRawRow({ chief_complaint: 'corrupted-ciphertext' });

    // findById uses this.sequelize.query() — mock it to return the raw row
    // First call = consultation JOIN query; second call = loadExtraItems (returns []).
    const mockSequelize = {
      query: jest
        .fn()
        .mockResolvedValueOnce([rawRow]) // consultation row
        .mockResolvedValueOnce([]), // extra items (empty)
      transaction: jest.fn(),
    };

    const repo = new SequelizeConsultationRepository(
      {} as never, // consultationModel not used by findById (raw SQL path)
      {} as never, // extraItemModel not used by the decryption error path
      failingCrypto as never,
      mockSequelize as never,
    );

    await expect(repo.findById(rawRow.id, rawRow.doctor_id)).rejects.toThrow(DecryptionError);
  });

  it('returns null for a null encrypted field without calling decrypt', async () => {
    const cryptoSpy = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      hashForSearch: jest.fn(),
    };

    const rawRow = makeRawRow({
      chief_complaint: null, // null — safeDecrypt should short-circuit
    });

    // First call = consultation JOIN query; second call = loadExtraItems (returns []).
    const mockSequelize = {
      query: jest.fn().mockResolvedValueOnce([rawRow]).mockResolvedValueOnce([]),
      transaction: jest.fn(),
    };

    const repo = new SequelizeConsultationRepository(
      {} as never,
      {} as never, // extraItemModel not used by this null-field test
      cryptoSpy as never,
      mockSequelize as never,
    );

    const result = await repo.findById(rawRow.id, rawRow.doctor_id);
    expect(result?.chiefComplaint).toBeNull();
    expect(cryptoSpy.decrypt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration test — package_charge_usd excludes cancelled appointments
//
// Requires real Postgres (same Docker instance as the block above).
// Run with: pnpm nx run backend:test-integration
//
// SCENARIO (reproduced from staging 2026-09-10):
//   - Cancelled appointment: session_number IS NULL, plan_price = 0, earlier date.
//   - Active appointment:    session_number IS NULL, plan_price = 120, later date.
//   The subquery must skip the cancelled one and return 120, not 0.
// ---------------------------------------------------------------------------
describe('SequelizeConsultationRepository — package_charge_usd excludes cancelled (integration)', () => {
  const DOCTOR_ID_PKG = 'f0000000-0000-0000-0000-000000000001'; // matches the seeded profile above
  const PATIENT_ID_PKG = 'f0000000-0000-0000-0000-000000000002'; // matches the seeded patient above
  const PLAN_NAME = 'Paquete integración test excl-cancelled';
  const cancelledApptId = randomUUID();
  const activeApptId = randomUUID();
  const consultationId = randomUUID();

  let sequelize: Sequelize;
  let repo: SequelizeConsultationRepository;

  beforeAll(async () => {
    sequelize = new Sequelize(TEST_DB_URL, {
      dialect: 'postgres',
      models: [ConsultationModel],
      logging: false,
      dialectOptions: { ssl: false },
    });
    await sequelize.authenticate();

    repo = new SequelizeConsultationRepository(
      ConsultationModel as never,
      ConsultationExtraItemModel as never,
      fakeCrypto as never,
      sequelize,
    );

    // Cancelled appointment — earlier date, plan_price = 0.
    await sequelize.query(
      `INSERT INTO appointments
         (id, doctor_id, patient_id, scheduled_at, status, session_number, plan_name, plan_price, created_at, updated_at)
       VALUES
         (:id, :doctorId, :patientId, '2026-01-01 09:00:00+00', 'cancelled', NULL, :planName, 0, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: {
          id: cancelledApptId,
          doctorId: DOCTOR_ID_PKG,
          patientId: PATIENT_ID_PKG,
          planName: PLAN_NAME,
        },
        type: QueryTypes.INSERT,
      },
    );

    // Active appointment — later date, plan_price = 120, status = 'completed'.
    await sequelize.query(
      `INSERT INTO appointments
         (id, doctor_id, patient_id, scheduled_at, status, session_number, plan_name, plan_price, created_at, updated_at)
       VALUES
         (:id, :doctorId, :patientId, '2026-02-01 09:00:00+00', 'completed', NULL, :planName, 120, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: {
          id: activeApptId,
          doctorId: DOCTOR_ID_PKG,
          patientId: PATIENT_ID_PKG,
          planName: PLAN_NAME,
        },
        type: QueryTypes.INSERT,
      },
    );

    // Consultation linked to the active appointment.
    await sequelize.query(
      `INSERT INTO consultations
         (id, doctor_id, patient_id, appointment_id, consultation_code,
          consultation_date, payment_status, created_at, updated_at)
       VALUES
         (:id, :doctorId, :patientId, :apptId, 'DLT-TEST-EXCL-0001',
          now(), 'approved', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: {
          id: consultationId,
          doctorId: DOCTOR_ID_PKG,
          patientId: PATIENT_ID_PKG,
          apptId: activeApptId,
        },
        type: QueryTypes.INSERT,
      },
    );
  });

  afterAll(async () => {
    await sequelize.query('DELETE FROM consultations WHERE id = :id', {
      replacements: { id: consultationId },
      type: QueryTypes.DELETE,
    });
    await sequelize.query('DELETE FROM appointments WHERE id IN (:ids)', {
      replacements: { ids: [cancelledApptId, activeApptId] },
      type: QueryTypes.DELETE,
    });
    await sequelize.close();
  });

  it('returns the active appointment plan_price (120), not the cancelled one (0)', async () => {
    const consultation = await repo.findById(consultationId, DOCTOR_ID_PKG);
    expect(consultation).not.toBeNull();
    // packageChargeUsd must be 120 (active appointment), never 0 (cancelled one).
    expect(consultation?.packageChargeUsd).toBe(120);
  });
});
