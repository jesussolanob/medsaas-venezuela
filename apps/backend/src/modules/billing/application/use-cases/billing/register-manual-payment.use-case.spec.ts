import { RegisterManualPaymentUseCase } from './register-manual-payment.use-case';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import type { ISubscriptionPaymentRepository } from '../../../domain/repositories/subscription-payment.repository';
import type { IProfileLookupRepository } from '../../../domain/repositories/profile-lookup.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile() {
  return { id: 'doc-1', fullName: 'Dr. Gonzalez', email: 'dr@example.com' };
}

function makeSavedPayment(
  overrides: Partial<{ id: string; durationMonths: number }> = {},
): SubscriptionPayment {
  const now = new Date();
  return SubscriptionPayment.create({
    id: overrides.id ?? 'pay-uuid',
    doctorId: 'doc-1',
    amountUsd: 80,
    method: 'Zelle',
    referenceNumber: 'REF-001',
    durationMonths: overrides.durationMonths ?? 3,
    status: 'approved',
    reviewedBy: 'admin-1',
    reviewedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegisterManualPaymentUseCase', () => {
  let mockRepo: jest.Mocked<ISubscriptionPaymentRepository>;
  let mockProfileRepo: jest.Mocked<IProfileLookupRepository>;
  let useCase: RegisterManualPaymentUseCase;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      listByDoctor: jest.fn(),
      findById: jest.fn(),
      findPendingByDoctor: jest.fn(),
      save: jest.fn(),
      saveDoctorPayment: jest.fn(),
      approveAndExtend: jest.fn(),
      saveApprovedAndExtend: jest.fn(),
      reject: jest.fn(),
      getFinanceStats: jest.fn(),
    };

    mockProfileRepo = {
      findById: jest.fn(),
    };

    useCase = new RegisterManualPaymentUseCase(mockRepo, mockProfileRepo);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('creates an approved payment and returns its plain props', async () => {
    mockProfileRepo.findById.mockResolvedValue(makeProfile());
    const savedPayment = makeSavedPayment({ durationMonths: 3 });
    mockRepo.saveApprovedAndExtend.mockResolvedValue(savedPayment);

    const result = await useCase.execute({
      doctorId: 'doc-1',
      amountUsd: 80,
      method: 'Zelle',
      durationMonths: 3,
      referenceNumber: 'REF-001',
      reviewerId: 'admin-1',
    });

    expect(result.status).toBe('approved');
    expect(result.doctorId).toBe('doc-1');
    expect(result.amountUsd).toBe(80);
    expect(result.durationMonths).toBe(3);
    expect(result.reviewedBy).toBe('admin-1');
  });

  it('calls saveApprovedAndExtend with newExpiresAt set to now + durationMonths', async () => {
    mockProfileRepo.findById.mockResolvedValue(makeProfile());
    mockRepo.saveApprovedAndExtend.mockResolvedValue(makeSavedPayment());

    const beforeCall = new Date();
    await useCase.execute({
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Transferencia',
      durationMonths: 6,
      reviewerId: 'admin-2',
    });
    const afterCall = new Date();

    expect(mockRepo.saveApprovedAndExtend).toHaveBeenCalledTimes(1);

    const [params] = mockRepo.saveApprovedAndExtend.mock.calls[0] as [
      { newExpiresAt: Date; durationMonths: number; method: string; doctorId: string },
    ];

    expect(params.durationMonths).toBe(6);
    expect(params.doctorId).toBe('doc-1');
    expect(params.method).toBe('Transferencia');

    // newExpiresAt should be approximately 6 months from now
    const minExpected = new Date(beforeCall);
    minExpected.setMonth(minExpected.getMonth() + 6);
    const maxExpected = new Date(afterCall);
    maxExpected.setMonth(maxExpected.getMonth() + 6);

    expect(params.newExpiresAt.getTime()).toBeGreaterThanOrEqual(minExpected.getTime() - 1000);
    expect(params.newExpiresAt.getTime()).toBeLessThanOrEqual(maxExpected.getTime() + 1000);
  });

  it('passes referenceNumber=null when not provided', async () => {
    mockProfileRepo.findById.mockResolvedValue(makeProfile());
    mockRepo.saveApprovedAndExtend.mockResolvedValue(makeSavedPayment());

    await useCase.execute({
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Efectivo',
      durationMonths: 1,
      reviewerId: 'admin-1',
      // referenceNumber omitted
    });

    const [params] = mockRepo.saveApprovedAndExtend.mock.calls[0] as [
      { referenceNumber: string | null },
    ];
    expect(params.referenceNumber).toBeNull();
  });

  it('passes optional referenceNumber through when provided', async () => {
    mockProfileRepo.findById.mockResolvedValue(makeProfile());
    mockRepo.saveApprovedAndExtend.mockResolvedValue(makeSavedPayment());

    await useCase.execute({
      doctorId: 'doc-1',
      amountUsd: 100,
      method: 'Zelle',
      durationMonths: 2,
      referenceNumber: 'WIRE-XYZ',
      reviewerId: 'admin-1',
    });

    const [params] = mockRepo.saveApprovedAndExtend.mock.calls[0] as [
      { referenceNumber: string | null },
    ];
    expect(params.referenceNumber).toBe('WIRE-XYZ');
  });

  // -------------------------------------------------------------------------
  // Doctor not found
  // -------------------------------------------------------------------------

  it('throws DoctorNotFoundError when doctor profile does not exist', async () => {
    mockProfileRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        doctorId: 'non-existent',
        amountUsd: 50,
        method: 'Zelle',
        durationMonths: 1,
        reviewerId: 'admin-1',
      }),
    ).rejects.toThrow(DoctorNotFoundError);

    expect(mockRepo.saveApprovedAndExtend).not.toHaveBeenCalled();
  });

  it('DoctorNotFoundError has httpStatus 404', () => {
    const err = new DoctorNotFoundError('bad-id');
    expect(err.httpStatus).toBe(404);
    expect(err.code).toBe('DOCTOR_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it('propagates errors thrown by saveApprovedAndExtend', async () => {
    mockProfileRepo.findById.mockResolvedValue(makeProfile());
    const dbError = new Error('DB connection lost');
    mockRepo.saveApprovedAndExtend.mockRejectedValue(dbError);

    await expect(
      useCase.execute({
        doctorId: 'doc-1',
        amountUsd: 50,
        method: 'Zelle',
        durationMonths: 1,
        reviewerId: 'admin-1',
      }),
    ).rejects.toThrow('DB connection lost');
  });

  it('propagates errors thrown by profileRepo.findById', async () => {
    mockProfileRepo.findById.mockRejectedValue(new Error('Profile DB error'));

    await expect(
      useCase.execute({
        doctorId: 'doc-1',
        amountUsd: 50,
        method: 'Zelle',
        durationMonths: 1,
        reviewerId: 'admin-1',
      }),
    ).rejects.toThrow('Profile DB error');

    expect(mockRepo.saveApprovedAndExtend).not.toHaveBeenCalled();
  });
});
