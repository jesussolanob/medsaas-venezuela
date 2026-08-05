import { ApproveSubscriptionPaymentUseCase } from './approve-subscription-payment.use-case';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import { SubscriptionPaymentNotFoundError } from '../../../domain/errors/subscription-payment-not-found.error';
import { SubscriptionPaymentAlreadyResolvedError } from '../../../domain/errors/subscription-payment-already-resolved.error';
import type { ISubscriptionPaymentRepository } from '../../../domain/repositories/subscription-payment.repository';
import type { IProfileLookupRepository } from '../../../domain/repositories/profile-lookup.repository';
import type { MailerService } from '../../../../email/application/services/mailer.service';

function makePendingPayment(durationMonths = 1): SubscriptionPayment {
  return SubscriptionPayment.create({
    id: 'pay-1',
    doctorId: 'doc-1',
    amountUsd: 50,
    method: 'Zelle',
    referenceNumber: 'REF123',
    durationMonths,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });
}

function makeProfile() {
  return { id: 'doc-1', fullName: 'Dr. Pérez', email: 'doctor@example.com' };
}

describe('ApproveSubscriptionPaymentUseCase', () => {
  let mockRepo: jest.Mocked<ISubscriptionPaymentRepository>;
  let mockProfileRepo: jest.Mocked<IProfileLookupRepository>;
  let mockMailer: jest.Mocked<MailerService>;
  let useCase: ApproveSubscriptionPaymentUseCase;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      listByDoctor: jest.fn(),
      findById: jest.fn(),
      findPendingByDoctor: jest.fn(),
      save: jest.fn(),
      saveDoctorPayment: jest.fn(),
      approveAndExtend: jest.fn().mockResolvedValue(undefined),
      saveApprovedAndExtend: jest.fn(),
      reject: jest.fn(),
      getFinanceStats: jest.fn(),
    };

    mockProfileRepo = {
      findById: jest.fn().mockResolvedValue(makeProfile()),
    };

    mockMailer = {
      sendTemplate: jest.fn().mockResolvedValue({ id: null }),
    } as unknown as jest.Mocked<MailerService>;

    useCase = new ApproveSubscriptionPaymentUseCase(mockRepo, mockProfileRepo, mockMailer);
  });

  it('throws SubscriptionPaymentNotFoundError when payment does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ paymentId: 'missing', reviewerId: 'admin-1' })).rejects.toThrow(
      SubscriptionPaymentNotFoundError,
    );
  });

  it('throws SubscriptionPaymentAlreadyResolvedError for already approved payment', async () => {
    const approved = SubscriptionPayment.create({
      id: 'pay-1',
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Zelle',
      referenceNumber: null,
      durationMonths: 1,
      status: 'approved',
      reviewedBy: 'admin-0',
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.findById.mockResolvedValue(approved);

    await expect(useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' })).rejects.toThrow(
      SubscriptionPaymentAlreadyResolvedError,
    );
  });

  it('throws SubscriptionPaymentAlreadyResolvedError for already rejected payment', async () => {
    const rejected = SubscriptionPayment.create({
      id: 'pay-1',
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Zelle',
      referenceNumber: null,
      durationMonths: 1,
      status: 'rejected',
      reviewedBy: 'admin-0',
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.findById.mockResolvedValue(rejected);

    await expect(useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' })).rejects.toThrow(
      SubscriptionPaymentAlreadyResolvedError,
    );
  });

  it('calls approveAndExtend with correct params for expired subscription', async () => {
    const payment = makePendingPayment(2);
    mockRepo.findById.mockResolvedValue(payment);

    const pastDate = new Date('2025-01-01'); // expired
    const { newExpiresAt } = await useCase.execute({
      paymentId: 'pay-1',
      reviewerId: 'admin-1',
      currentSubscriptionExpiresAt: pastDate,
    });

    expect(mockRepo.approveAndExtend).toHaveBeenCalledTimes(1);
    const [approveParams, meta] = mockRepo.approveAndExtend.mock.calls[0] as [
      { paymentId: string; reviewerId: string; newExpiresAt: Date },
      { monthsAdded: number; actorRole: string; amountUsd: number },
    ];

    expect(approveParams.paymentId).toBe('pay-1');
    expect(approveParams.reviewerId).toBe('admin-1');
    expect(meta.monthsAdded).toBe(2);
    expect(meta.actorRole).toBe('super_admin');
    expect(meta.amountUsd).toBe(50);
    expect(newExpiresAt).toEqual(approveParams.newExpiresAt);
  });

  it('extends from the future subscription date when still active', async () => {
    const payment = makePendingPayment(1);
    mockRepo.findById.mockResolvedValue(payment);

    const futureBase = new Date();
    futureBase.setMonth(futureBase.getMonth() + 3); // 3 months ahead

    const { newExpiresAt } = await useCase.execute({
      paymentId: 'pay-1',
      reviewerId: 'admin-1',
      currentSubscriptionExpiresAt: futureBase,
    });

    // Should be approximately 4 months from now
    const expectedApprox = new Date(futureBase);
    expectedApprox.setMonth(expectedApprox.getMonth() + 1);
    expect(Math.abs(newExpiresAt.getTime() - expectedApprox.getTime())).toBeLessThan(5000);
  });

  it('extends from now when no currentSubscriptionExpiresAt is provided', async () => {
    const payment = makePendingPayment(1);
    mockRepo.findById.mockResolvedValue(payment);

    const beforeCall = new Date();
    const { newExpiresAt } = await useCase.execute({
      paymentId: 'pay-1',
      reviewerId: 'admin-1',
    });
    const afterCall = new Date();

    // newExpiresAt should be ~1 month from now
    const minExpected = new Date(beforeCall);
    minExpected.setMonth(minExpected.getMonth() + 1);
    const maxExpected = new Date(afterCall);
    maxExpected.setMonth(maxExpected.getMonth() + 1);

    expect(newExpiresAt.getTime()).toBeGreaterThanOrEqual(minExpected.getTime() - 1000);
    expect(newExpiresAt.getTime()).toBeLessThanOrEqual(maxExpected.getTime() + 1000);
  });

  it('does not call approveAndExtend on domain validation failure', async () => {
    const approved = SubscriptionPayment.create({
      id: 'pay-1',
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Zelle',
      referenceNumber: null,
      durationMonths: 1,
      status: 'approved',
      reviewedBy: 'admin-0',
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.findById.mockResolvedValue(approved);

    await expect(useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' })).rejects.toThrow();
    expect(mockRepo.approveAndExtend).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // payment_approved email — non-fatal behaviour
  // ---------------------------------------------------------------------------

  it('attempts to send payment_approved email after successful approval', async () => {
    const payment = makePendingPayment(1);
    mockRepo.findById.mockResolvedValue(payment);

    await useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' });

    // Give the fire-and-forget promise a tick to resolve
    await new Promise((r) => setImmediate(r));

    expect(mockProfileRepo.findById).toHaveBeenCalledWith('doc-1');
    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'payment_approved',
      'doctor@example.com',
      expect.objectContaining({ doctorName: 'Dr. Pérez', amount: 'USD 50.00' }),
      { type: 'doctor', id: 'doc-1' },
    );
  });

  it('does not fail when doctor profile is not found (email skipped)', async () => {
    const payment = makePendingPayment(1);
    mockRepo.findById.mockResolvedValue(payment);
    mockProfileRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' }),
    ).resolves.toBeDefined();

    await new Promise((r) => setImmediate(r));
    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('does not fail when mailerService.sendTemplate throws', async () => {
    const payment = makePendingPayment(1);
    mockRepo.findById.mockResolvedValue(payment);
    mockMailer.sendTemplate.mockRejectedValue(new Error('smtp error'));

    const result = await useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' });
    await new Promise((r) => setImmediate(r));

    // Approval still succeeded
    expect(result.newExpiresAt).toBeDefined();
    expect(mockRepo.approveAndExtend).toHaveBeenCalledTimes(1);
  });
});
