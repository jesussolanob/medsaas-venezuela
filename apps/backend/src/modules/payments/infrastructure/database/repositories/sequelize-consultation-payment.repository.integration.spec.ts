/**
 * Integration tests for SequelizeConsultationPaymentRepository.
 *
 * Requires Docker Postgres to be running:
 *   host: localhost, port: 5432, db: deltamedical, user: delta / delta_dev_password
 *
 * consultation_payments has FK constraints to profiles (doctor_id), patients (patient_id),
 * and consultations (consultation_id). This test seeds all prerequisites and cleans up
 * in afterAll.
 *
 * Excluded from the default `nx test backend` run. Run them with:
 *   export PATH="/opt/homebrew/bin:$HOME/.local/share/pnpm/bin:$PATH"
 *   docker compose -f docker/docker-compose.yml up -d postgres
 *   pnpm nx run backend:test-integration
 */
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { randomUUID } from 'crypto';
import { ConsultationPaymentModel } from '../models/consultation-payment.model';
import { ConsultationModel } from '../../../../consultations/infrastructure/database/models/consultation.model';
import { SequelizeConsultationPaymentRepository } from './sequelize-consultation-payment.repository';
import { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';

const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgres://delta:delta_dev_password@localhost:5432/deltamedical';

const DOCTOR_ID = 'f3000000-0000-0000-0000-000000000001';
const PATIENT_ID = 'f3000000-0000-0000-0000-000000000002';
const CONSULTATION_ID = 'f3000000-0000-0000-0000-000000000003';

describe('SequelizeConsultationPaymentRepository (integration)', () => {
  let sequelize: Sequelize;
  let repo: SequelizeConsultationPaymentRepository;
  const createdPaymentIds: string[] = [];

  beforeAll(async () => {
    sequelize = new Sequelize(TEST_DB_URL, {
      dialect: 'postgres',
      models: [ConsultationPaymentModel, ConsultationModel],
      logging: false,
      dialectOptions: { ssl: false },
    });
    await sequelize.authenticate();

    repo = new SequelizeConsultationPaymentRepository(
      ConsultationPaymentModel as never,
      ConsultationModel as never,
      sequelize,
    );

    // Seed profile (doctor)
    await sequelize.query(
      `INSERT INTO profiles (id, full_name, email, role, created_at, updated_at)
       VALUES (:id, 'Payment Test Doctor', 'paytest+integration@dev.local', 'doctor', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: DOCTOR_ID }, type: QueryTypes.INSERT },
    );

    // Seed patient
    await sequelize.query(
      `INSERT INTO patients (id, doctor_id, full_name, created_at, updated_at)
       VALUES (:id, :doctorId, 'VGVzdCBQYXRpZW50', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      { replacements: { id: PATIENT_ID, doctorId: DOCTOR_ID }, type: QueryTypes.INSERT },
    );

    // Seed consultation
    await sequelize.query(
      `INSERT INTO consultations (id, doctor_id, patient_id, consultation_code, consultation_date, payment_status, created_at, updated_at)
       VALUES (:id, :doctorId, :patientId, 'DLT-202606-TEST', NOW(), 'pending', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: { id: CONSULTATION_ID, doctorId: DOCTOR_ID, patientId: PATIENT_ID },
        type: QueryTypes.INSERT,
      },
    );
  });

  afterAll(async () => {
    if (createdPaymentIds.length > 0) {
      await ConsultationPaymentModel.destroy({ where: { id: createdPaymentIds } });
    }
    await sequelize.query('DELETE FROM consultations WHERE id = :id', {
      replacements: { id: CONSULTATION_ID },
      type: QueryTypes.DELETE,
    });
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

  function buildPayment(): ConsultationPayment {
    const now = new Date();
    return ConsultationPayment.create({
      id: randomUUID(),
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      amount: 100,
      currency: 'USD',
      paymentMethod: 'zelle',
      referenceNumber: 'REF-001',
      receiptUrl: null,
      notes: null,
      status: 'pending',
      approvedAt: null,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  it('creates a payment and syncs consultation payment_status', async () => {
    const payment = buildPayment();
    const saved = await repo.create(payment);
    createdPaymentIds.push(saved.id);

    expect(saved.id).toBe(payment.id);
    expect(saved.status).toBe('pending');
    expect(saved.amount).toBe(100);

    // Verify consultation was updated
    const rows = await sequelize.query<{ payment_status: string }>(
      'SELECT payment_status FROM consultations WHERE id = :id',
      { replacements: { id: CONSULTATION_ID }, type: QueryTypes.SELECT },
    );
    expect(rows[0]?.payment_status).toBe('pending');
  });

  it('finds a payment by id scoped to doctorId', async () => {
    const payment = buildPayment();
    const saved = await repo.create(payment);
    createdPaymentIds.push(saved.id);

    const found = await repo.findByIdForDoctor(saved.id, DOCTOR_ID);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(saved.id);
  });

  it('returns null when findByIdForDoctor is called with wrong doctorId', async () => {
    const payment = buildPayment();
    const saved = await repo.create(payment);
    createdPaymentIds.push(saved.id);

    const found = await repo.findByIdForDoctor(saved.id, randomUUID());
    expect(found).toBeNull();
  });

  it('saves a status transition (approve)', async () => {
    const payment = buildPayment();
    const saved = await repo.create(payment);
    createdPaymentIds.push(saved.id);

    const approved = saved.approve(DOCTOR_ID);
    const result = await repo.save(approved);

    expect(result.status).toBe('approved');
    expect(result.approvedBy).toBe(DOCTOR_ID);
    expect(result.approvedAt).toBeInstanceOf(Date);

    // Verify consultation.payment_status was synced
    const rows = await sequelize.query<{ payment_status: string }>(
      'SELECT payment_status FROM consultations WHERE id = :id',
      { replacements: { id: CONSULTATION_ID }, type: QueryTypes.SELECT },
    );
    expect(rows[0]?.payment_status).toBe('approved');
  });

  it('saves a status transition (reject)', async () => {
    const payment = buildPayment();
    const saved = await repo.create(payment);
    createdPaymentIds.push(saved.id);

    const rejected = saved.reject();
    const result = await repo.save(rejected);

    expect(result.status).toBe('rejected');
  });

  it('lists payments scoped to doctorId', async () => {
    const result = await repo.list({ doctorId: DOCTOR_ID, limit: 50, offset: 0 });

    expect(result.items.every((p) => p.doctorId === DOCTOR_ID)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  it('filters list by consultationId', async () => {
    const result = await repo.list({
      doctorId: DOCTOR_ID,
      consultationId: CONSULTATION_ID,
      limit: 50,
      offset: 0,
    });

    expect(result.items.every((p) => p.consultationId === CONSULTATION_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — no DB required
// ---------------------------------------------------------------------------
describe('SequelizeConsultationPaymentRepository (unit)', () => {
  it('returns null when findByIdForDoctor finds nothing', async () => {
    const stubModel = {
      findOne: jest.fn().mockResolvedValue(null),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const repo = new SequelizeConsultationPaymentRepository(
      stubModel as never,
      {} as never,
      {} as never,
    );

    const result = await repo.findByIdForDoctor(randomUUID(), randomUUID());
    expect(result).toBeNull();
  });

  it('maps decimal amount to number in toDomain', async () => {
    const now = new Date();
    const stubRow = {
      id: randomUUID(),
      consultationId: randomUUID(),
      doctorId: randomUUID(),
      patientId: randomUUID(),
      amount: '150.50', // Sequelize returns DECIMAL as string
      currency: 'USD',
      paymentMethod: 'zelle',
      referenceNumber: null,
      receiptUrl: null,
      notes: null,
      status: 'pending',
      approvedAt: null,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    };

    const stubModel = {
      findOne: jest.fn().mockResolvedValue(stubRow),
    };

    const repo = new SequelizeConsultationPaymentRepository(
      stubModel as never,
      {} as never,
      {} as never,
    );

    const result = await repo.findByIdForDoctor(stubRow.id, stubRow.doctorId);
    expect(result?.amount).toBe(150.5);
    expect(typeof result?.amount).toBe('number');
  });
});
