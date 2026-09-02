import { GetAdminSellerPaymentReceiptUrlUseCase } from './get-admin-seller-payment-receipt-url.use-case';
import { SellerPaymentNotFoundError } from '../../domain/errors/seller-payment-not-found.error';
import { SellerPaymentReceiptMissingError } from '../../domain/errors/seller-payment-receipt-missing.error';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import type { SellerPayment } from '../../domain/entities/seller-payment.entity';

const PAYMENT_ID = 'pay-1';
const SELLER_ID = 'seller-1';
const GCS_PATH = 'receipt/seller-1/pay-1.jpg';
const SIGNED_URL =
  'https://storage.googleapis.com/bucket/receipt/seller-1/pay-1.jpg?X-Goog-Signature=abc';

function makePayment(overrides: Partial<SellerPayment> = {}): SellerPayment {
  return {
    id: PAYMENT_ID,
    sellerId: SELLER_ID,
    amountUsd: 30,
    method: 'Zelle',
    reference: 'REF-001',
    receiptUrl: GCS_PATH,
    notes: null,
    paidAt: new Date(),
    createdBy: 'admin-1',
    createdAt: new Date(),
    ...overrides,
  } as SellerPayment;
}

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn(),
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findPaymentById: jest.fn().mockResolvedValue(makePayment()),
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    approveCommissions: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

function makeStorage(): jest.Mocked<IStoragePort> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn().mockResolvedValue(SIGNED_URL),
  } as jest.Mocked<IStoragePort>;
}

describe('GetAdminSellerPaymentReceiptUrlUseCase', () => {
  it('returns a signed URL when payment exists and has a receipt', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    const useCase = new GetAdminSellerPaymentReceiptUrlUseCase(repo, storage);

    const result = await useCase.execute(PAYMENT_ID);

    expect(result).toEqual({ url: SIGNED_URL });
    expect(repo.findPaymentById).toHaveBeenCalledWith(PAYMENT_ID);
    expect(storage.getSignedUrl).toHaveBeenCalledWith(GCS_PATH, 15 * 60 * 1000);
  });

  it('can access a payment belonging to any seller (no ownership restriction)', async () => {
    const repo = makeRepo();
    // Payment belongs to a different seller — admin can still access it.
    repo.findPaymentById.mockResolvedValue(makePayment({ sellerId: 'other-seller' }));
    const storage = makeStorage();
    const useCase = new GetAdminSellerPaymentReceiptUrlUseCase(repo, storage);

    const result = await useCase.execute(PAYMENT_ID);

    expect(result).toEqual({ url: SIGNED_URL });
  });

  it('throws SellerPaymentNotFoundError when payment does not exist', async () => {
    const repo = makeRepo();
    repo.findPaymentById.mockResolvedValue(null);
    const storage = makeStorage();
    const useCase = new GetAdminSellerPaymentReceiptUrlUseCase(repo, storage);

    await expect(useCase.execute(PAYMENT_ID)).rejects.toBeInstanceOf(SellerPaymentNotFoundError);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('throws SellerPaymentReceiptMissingError when payment has no receipt', async () => {
    const repo = makeRepo();
    repo.findPaymentById.mockResolvedValue(makePayment({ receiptUrl: null }));
    const storage = makeStorage();
    const useCase = new GetAdminSellerPaymentReceiptUrlUseCase(repo, storage);

    await expect(useCase.execute(PAYMENT_ID)).rejects.toBeInstanceOf(
      SellerPaymentReceiptMissingError,
    );
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });
});
