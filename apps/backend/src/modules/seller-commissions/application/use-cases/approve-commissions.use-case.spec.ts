import { ApproveCommissionsUseCase } from './approve-commissions.use-case';
import { CommissionSellerNotFoundError } from '../../domain/errors/commission-seller-not-found.error';
import { InvalidCommissionIdsError } from '../../domain/errors/invalid-commission-ids.error';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';

const ADMIN_ID = 'admin-1';
const SELLER_ID = 'seller-1';
const COMMISSION_IDS = ['com-1', 'com-2'];

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn(),
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findPaymentById: jest.fn(),
    findSellerById: jest.fn().mockResolvedValue({ id: SELLER_ID, isActive: true }),
    findSpecialistById: jest.fn(),
    approveCommissions: jest.fn().mockResolvedValue(COMMISSION_IDS.length),
    assignSpecialistToSeller: jest.fn(),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('ApproveCommissionsUseCase', () => {
  let repo: jest.Mocked<ISellerCommissionRepository>;
  let useCase: ApproveCommissionsUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new ApproveCommissionsUseCase(repo);
  });

  it('approves the commissions and returns how many changed', async () => {
    const result = await useCase.execute(
      { sellerId: SELLER_ID, commissionIds: COMMISSION_IDS },
      ADMIN_ID,
    );

    expect(repo.approveCommissions).toHaveBeenCalledWith(SELLER_ID, COMMISSION_IDS, ADMIN_ID);
    expect(result).toEqual({ approved: 2 });
  });

  it('takes adminId from the session argument, never from the input', async () => {
    // Anti-IDOR: el id del admin nunca puede venir del cuerpo del pedido.
    await useCase.execute({ sellerId: SELLER_ID, commissionIds: COMMISSION_IDS }, ADMIN_ID);

    expect(repo.approveCommissions.mock.calls[0]?.[2]).toBe(ADMIN_ID);
  });

  it('throws when the seller does not exist', async () => {
    repo.findSellerById.mockResolvedValue(null);

    await expect(
      useCase.execute({ sellerId: SELLER_ID, commissionIds: COMMISSION_IDS }, ADMIN_ID),
    ).rejects.toThrow(CommissionSellerNotFoundError);

    expect(repo.approveCommissions).not.toHaveBeenCalled();
  });

  it('propagates InvalidCommissionIdsError when an id is not approvable', async () => {
    // Cubre las tres causas indistinguibles: no existe, es de otro vendedor, o
    // ya no está pendiente. El repositorio no revela cuál.
    repo.approveCommissions.mockRejectedValue(new InvalidCommissionIdsError());

    await expect(
      useCase.execute({ sellerId: SELLER_ID, commissionIds: COMMISSION_IDS }, ADMIN_ID),
    ).rejects.toThrow(InvalidCommissionIdsError);
  });

  it('does not pay anything — approving only unlocks the payment', async () => {
    await useCase.execute({ sellerId: SELLER_ID, commissionIds: COMMISSION_IDS }, ADMIN_ID);

    expect(repo.registerPayment).not.toHaveBeenCalled();
  });
});
