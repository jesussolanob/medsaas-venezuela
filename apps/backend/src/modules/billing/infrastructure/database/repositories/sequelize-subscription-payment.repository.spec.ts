import { UniqueConstraintError } from 'sequelize';
import { SequelizeSubscriptionPaymentRepository } from './sequelize-subscription-payment.repository';
import { PendingPaymentExistsError } from '../../../domain/errors/pending-payment-exists.error';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import type { CreateDoctorPaymentParams } from '../../../domain/repositories/subscription-payment.repository';

/**
 * Focused unit tests for SequelizeSubscriptionPaymentRepository.saveDoctorPayment.
 *
 * Only `saveDoctorPayment` is exercised here — the other repository methods
 * are covered indirectly via the billing use-case specs. Dependencies unused
 * by this method (logModel, profileModel, subscriptionModel, sequelize) are
 * stubbed with `undefined` casts, following the direct-instantiation pattern
 * already used by SequelizeIdentityRepository's spec.
 */
describe('SequelizeSubscriptionPaymentRepository.saveDoctorPayment', () => {
  let modelMock: { create: jest.Mock };
  let repo: SequelizeSubscriptionPaymentRepository;

  function makeParams(
    overrides: Partial<CreateDoctorPaymentParams> = {},
  ): CreateDoctorPaymentParams {
    return {
      id: 'pay-1',
      doctorId: 'doctor-1',
      amountUsd: 10,
      amountBs: 405,
      bcvRateUsed: 40.5,
      method: 'transfer',
      referenceNumber: 'REF-001',
      durationMonths: 1,
      planKey: 'delta_plus',
      period: 'monthly',
      bankCode: '0102',
      receiptUrl: 'receipt/doctor-1/rec.jpg',
      notes: null,
      ...overrides,
    };
  }

  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'pay-1',
      doctorId: 'doctor-1',
      amountUsd: 10,
      method: 'transfer',
      referenceNumber: 'REF-001',
      durationMonths: 1,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
      amountBs: 405,
      bcvRateUsed: 40.5,
      bankCode: '0102',
      receiptUrl: 'receipt/doctor-1/rec.jpg',
      notes: null,
      planKey: 'delta_plus',
      period: 'monthly',
      rejectionReason: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    modelMock = { create: jest.fn() };
    repo = new SequelizeSubscriptionPaymentRepository(
      modelMock as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
  });

  it('persists the payment and returns the domain entity on the normal path', async () => {
    modelMock.create.mockResolvedValue(makeRow());

    const result = await repo.saveDoctorPayment(makeParams());

    expect(modelMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pay-1',
        doctorId: 'doctor-1',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
      }),
    );
    expect(result).toBeInstanceOf(SubscriptionPayment);
    expect(result.id).toBe('pay-1');
    expect(result.status).toBe('pending');
  });

  it('translates a UniqueConstraintError (the race-condition guard) into PendingPaymentExistsError', async () => {
    modelMock.create.mockRejectedValue(new UniqueConstraintError({ errors: [] }));

    await expect(repo.saveDoctorPayment(makeParams())).rejects.toBeInstanceOf(
      PendingPaymentExistsError,
    );
  });

  it('translates a wrapped Postgres 23505 error (original.code) into PendingPaymentExistsError', async () => {
    // Simulates a DatabaseError wrapping the raw pg driver error instead of the
    // Sequelize-normalised UniqueConstraintError — must still be detected by code.
    const wrapped = Object.assign(new Error('duplicate key value'), {
      original: { code: '23505' },
    });
    modelMock.create.mockRejectedValue(wrapped);

    await expect(repo.saveDoctorPayment(makeParams())).rejects.toBeInstanceOf(
      PendingPaymentExistsError,
    );
  });

  it('does NOT swallow unrelated database errors', async () => {
    modelMock.create.mockRejectedValue(new Error('connection refused'));

    await expect(repo.saveDoctorPayment(makeParams())).rejects.toThrow('connection refused');
  });

  it('does NOT translate an unrelated Postgres error code (e.g. 23503 FK violation)', async () => {
    const wrapped = Object.assign(new Error('foreign key violation'), {
      original: { code: '23503' },
    });
    modelMock.create.mockRejectedValue(wrapped);

    await expect(repo.saveDoctorPayment(makeParams())).rejects.not.toBeInstanceOf(
      PendingPaymentExistsError,
    );
  });
});
