import { AssignSpecialistToSellerUseCase } from './assign-specialist-to-seller.use-case';
import { CommissionSellerNotFoundError } from '../../domain/errors/commission-seller-not-found.error';
import { CommissionSpecialistNotFoundError } from '../../domain/errors/commission-specialist-not-found.error';
import type { ISellerCommissionRepository } from '../../domain/repositories/seller-commission.repository';

const ADMIN_ID = 'admin-1';
const SELLER_ID = 'seller-1';
const SPECIALIST_ID = 'spec-1';

function makeRepo(): jest.Mocked<ISellerCommissionRepository> {
  return {
    findSpecialistCommissionProfile: jest.fn(),
    accrueCommission: jest.fn(),
    listCommissionsBySeller: jest.fn(),
    listPendingBySeller: jest.fn(),
    findCommissionsForPayment: jest.fn(),
    registerPayment: jest.fn(),
    listPaymentsBySeller: jest.fn(),
    findSellerById: jest.fn().mockResolvedValue({ id: SELLER_ID, isActive: true }),
    findSpecialistById: jest.fn().mockResolvedValue({ id: SPECIALIST_ID, soldBy: null }),
    assignSpecialistToSeller: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<ISellerCommissionRepository>;
}

describe('AssignSpecialistToSellerUseCase', () => {
  let repo: jest.Mocked<ISellerCommissionRepository>;
  let useCase: AssignSpecialistToSellerUseCase;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new AssignSpecialistToSellerUseCase(repo);
  });

  it('assigns specialist to seller and writes attribution log', async () => {
    await useCase.execute({ specialistId: SPECIALIST_ID, newSellerId: SELLER_ID }, ADMIN_ID);

    expect(repo.findSellerById).toHaveBeenCalledWith(SELLER_ID);
    expect(repo.findSpecialistById).toHaveBeenCalledWith(SPECIALIST_ID);
    expect(repo.assignSpecialistToSeller).toHaveBeenCalledWith({
      specialistId: SPECIALIST_ID,
      newSellerId: SELLER_ID,
      previousSellerId: null,
      assignedBy: ADMIN_ID,
    });
  });

  it('passes the previous sold_by to the log when specialist had a prior seller', async () => {
    repo.findSpecialistById.mockResolvedValue({ id: SPECIALIST_ID, soldBy: 'old-seller' });

    await useCase.execute({ specialistId: SPECIALIST_ID, newSellerId: SELLER_ID }, ADMIN_ID);

    expect(repo.assignSpecialistToSeller).toHaveBeenCalledWith(
      expect.objectContaining({ previousSellerId: 'old-seller' }),
    );
  });

  it('throws CommissionSellerNotFoundError when seller does not exist', async () => {
    repo.findSellerById.mockResolvedValue(null);

    await expect(
      useCase.execute({ specialistId: SPECIALIST_ID, newSellerId: SELLER_ID }, ADMIN_ID),
    ).rejects.toThrow(CommissionSellerNotFoundError);
    expect(repo.assignSpecialistToSeller).not.toHaveBeenCalled();
  });

  it('throws CommissionSellerNotFoundError when seller is inactive', async () => {
    repo.findSellerById.mockResolvedValue({ id: SELLER_ID, isActive: false });

    await expect(
      useCase.execute({ specialistId: SPECIALIST_ID, newSellerId: SELLER_ID }, ADMIN_ID),
    ).rejects.toThrow(CommissionSellerNotFoundError);
    expect(repo.assignSpecialistToSeller).not.toHaveBeenCalled();
  });

  it('throws CommissionSpecialistNotFoundError when specialist does not exist', async () => {
    repo.findSpecialistById.mockResolvedValue(null);

    await expect(
      useCase.execute({ specialistId: SPECIALIST_ID, newSellerId: SELLER_ID }, ADMIN_ID),
    ).rejects.toThrow(CommissionSpecialistNotFoundError);
    expect(repo.assignSpecialistToSeller).not.toHaveBeenCalled();
  });

  it('does NOT accrue any commission on assignment (plan event drives commissions)', async () => {
    await useCase.execute({ specialistId: SPECIALIST_ID, newSellerId: SELLER_ID }, ADMIN_ID);

    expect(repo.accrueCommission).not.toHaveBeenCalled();
  });
});
