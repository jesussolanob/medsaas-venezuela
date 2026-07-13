import { UpdatePaymentDetailsUseCase } from './update-payment-details.use-case';
import type { IPaymentRepository } from '../../../domain/repositories/payment.repository';
import { Payment } from '../../../domain/entities/payment.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentNotOwnedError } from '../../../domain/errors/payment-not-owned.error';

const DOCTOR_ID = 'doc-0001-0000-0000-0000-000000000001';
const PAYMENT_ID = 'pay-0001-1111-1111-1111-111111111111';

function makePayment(overrides: Partial<Parameters<typeof Payment.create>[0]> = {}): Payment {
  return Payment.create({
    id: PAYMENT_ID,
    doctorId: DOCTOR_ID,
    patientId: 'patient-uuid',
    amountUsd: 50,
    amountBs: null,
    bcvRate: null,
    currency: 'USD',
    methodSnapshot: null,
    paymentReference: null,
    paymentReceiptUrl: null,
    paymentCode: null,
    status: 'pending',
    paidAt: null,
    packageId: null,
    createdAt: new Date('2026-07-01T10:00:00Z'),
    updatedAt: new Date('2026-07-01T10:00:00Z'),
    ...overrides,
  });
}

describe('UpdatePaymentDetailsUseCase', () => {
  let useCase: UpdatePaymentDetailsUseCase;
  let mockRepo: jest.Mocked<IPaymentRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      totalsForDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      updateStatus: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      listItems: jest.fn(),
      attachReceiptUrl: jest.fn(),
      updateDetails: jest.fn(),
      create: jest.fn(),
    };
    useCase = new UpdatePaymentDetailsUseCase(mockRepo);
  });

  it('updates payment details and returns the updated payment', async () => {
    const paidAt = new Date('2026-07-10T12:00:00Z');
    const updated = makePayment({
      paidAt,
      methodSnapshot: 'Transferencia',
      paymentReference: 'REF-001',
      bcvRate: 36.5,
      amountBs: 1825,
    });

    mockRepo.updateDetails.mockResolvedValue(updated);

    const result = await useCase.execute({
      paymentId: PAYMENT_ID,
      doctorId: DOCTOR_ID,
      paidAt,
      methodSnapshot: 'Transferencia',
      paymentReference: 'REF-001',
      bcvRate: 36.5,
      amountBs: 1825,
    });

    // No pre-check: repo is called directly (avoids TOCTOU)
    expect(mockRepo.findByIdForDoctor).not.toHaveBeenCalled();
    expect(mockRepo.updateDetails).toHaveBeenCalledWith(PAYMENT_ID, DOCTOR_ID, {
      paidAt,
      methodSnapshot: 'Transferencia',
      paymentReference: 'REF-001',
      bcvRate: 36.5,
      amountBs: 1825,
    });
    expect(result.methodSnapshot).toBe('Transferencia');
    expect(result.paymentReference).toBe('REF-001');
    expect(result.bcvRate).toBe(36.5);
    expect(result.amountBs).toBe(1825);
  });

  it('propagates PaymentNotFoundError when the repo throws it (payment does not exist)', async () => {
    // The repo guarantees 404 before 403 in a single locked query.
    mockRepo.updateDetails.mockRejectedValue(new PaymentNotFoundError(PAYMENT_ID));

    await expect(useCase.execute({ paymentId: 'missing-id', doctorId: DOCTOR_ID })).rejects.toThrow(
      PaymentNotFoundError,
    );
  });

  it('propagates PaymentNotOwnedError when the repo throws it (anti-IDOR)', async () => {
    mockRepo.updateDetails.mockRejectedValue(new PaymentNotOwnedError());

    await expect(useCase.execute({ paymentId: PAYMENT_ID, doctorId: 'other-doc' })).rejects.toThrow(
      PaymentNotOwnedError,
    );
  });

  it('passes undefined fields through to the repository (partial update)', async () => {
    const updated = makePayment({ methodSnapshot: 'Efectivo' });
    mockRepo.updateDetails.mockResolvedValue(updated);

    await useCase.execute({
      paymentId: PAYMENT_ID,
      doctorId: DOCTOR_ID,
      methodSnapshot: 'Efectivo',
      // All other fields are undefined → should not be touched.
    });

    expect(mockRepo.updateDetails).toHaveBeenCalledWith(PAYMENT_ID, DOCTOR_ID, {
      paidAt: undefined,
      methodSnapshot: 'Efectivo',
      paymentReference: undefined,
      bcvRate: undefined,
      amountBs: undefined,
    });
  });

  it('passes null fields through to the repository (clearing a field)', async () => {
    const updated = makePayment({ methodSnapshot: null });
    mockRepo.updateDetails.mockResolvedValue(updated);

    await useCase.execute({
      paymentId: PAYMENT_ID,
      doctorId: DOCTOR_ID,
      methodSnapshot: null,
    });

    const call = mockRepo.updateDetails.mock.calls[0]?.[2];
    expect(call?.methodSnapshot).toBeNull();
  });
});
