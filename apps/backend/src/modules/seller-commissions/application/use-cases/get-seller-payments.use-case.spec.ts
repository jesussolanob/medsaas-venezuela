import { GetSellerPaymentsUseCase } from './get-seller-payments.use-case';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';
import type { SellerPayment } from '../../domain/entities/seller-payment.entity';

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn(),
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn().mockResolvedValue([]),
    findPaymentById: jest.fn(),
    findSellerById: jest.fn(),
    findSpecialistById: jest.fn(),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('GetSellerPaymentsUseCase', () => {
  it('delegates to repo.listPaymentsBySeller with the given sellerId', async () => {
    const repo = makeRepo();
    const useCase = new GetSellerPaymentsUseCase(repo);

    await useCase.execute('seller-1');

    expect(repo.listPaymentsBySeller).toHaveBeenCalledWith('seller-1');
  });

  it('returns the payments from the repository', async () => {
    const repo = makeRepo();
    const payments: SellerPayment[] = [
      {
        id: 'pay-1',
        sellerId: 'seller-1',
        amountUsd: 30,
        bcvRate: null,
        method: 'Zelle',
        reference: 'REF-001',
        receiptUrl: null,
        notes: null,
        paidAt: new Date(),
        createdBy: 'admin-1',
        createdAt: new Date(),
      } as SellerPayment,
    ];
    repo.listPaymentsBySeller.mockResolvedValue(payments);
    const useCase = new GetSellerPaymentsUseCase(repo);

    const result = await useCase.execute('seller-1');

    expect(result).toEqual(payments);
  });
});
