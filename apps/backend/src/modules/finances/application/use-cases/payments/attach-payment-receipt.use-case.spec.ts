import { AttachPaymentReceiptUseCase } from './attach-payment-receipt.use-case';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentNotOwnedError } from '../../../domain/errors/payment-not-owned.error';
import type { IPaymentRepository } from '../../../domain/repositories/payment.repository';
import { Payment } from '../../../domain/entities/payment.entity';

const DOCTOR_ID = 'd0c70000-0000-0000-0000-000000000001';
const PAYMENT_ID = 'p1111111-1111-1111-1111-111111111111';
const RECEIPT_URL = 'https://storage.example.com/receipts/receipt-001.jpg';

function makePayment(overrides: Partial<Parameters<typeof Payment.create>[0]> = {}): Payment {
  return Payment.create({
    id: PAYMENT_ID,
    doctorId: DOCTOR_ID,
    patientId: 'patient-uuid',
    amountUsd: 100,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('AttachPaymentReceiptUseCase', () => {
  let useCase: AttachPaymentReceiptUseCase;
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
      create: jest.fn(),
    };
    useCase = new AttachPaymentReceiptUseCase(mockRepo);
  });

  it('calls repo.attachReceiptUrl with correct args and returns updated payment', async () => {
    const updatedPayment = makePayment({ paymentReceiptUrl: RECEIPT_URL });
    mockRepo.attachReceiptUrl.mockResolvedValue(updatedPayment);

    const result = await useCase.execute({
      paymentId: PAYMENT_ID,
      doctorId: DOCTOR_ID,
      receiptUrl: RECEIPT_URL,
    });

    expect(mockRepo.attachReceiptUrl).toHaveBeenCalledWith(PAYMENT_ID, DOCTOR_ID, RECEIPT_URL);
    expect(result.paymentReceiptUrl).toBe(RECEIPT_URL);
  });

  it('propagates PaymentNotFoundError when payment does not exist', async () => {
    mockRepo.attachReceiptUrl.mockRejectedValue(new PaymentNotFoundError(PAYMENT_ID));

    await expect(
      useCase.execute({ paymentId: PAYMENT_ID, doctorId: DOCTOR_ID, receiptUrl: RECEIPT_URL }),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it('propagates PaymentNotOwnedError when payment belongs to another doctor', async () => {
    mockRepo.attachReceiptUrl.mockRejectedValue(new PaymentNotOwnedError());

    await expect(
      useCase.execute({ paymentId: PAYMENT_ID, doctorId: DOCTOR_ID, receiptUrl: RECEIPT_URL }),
    ).rejects.toBeInstanceOf(PaymentNotOwnedError);
  });
});
