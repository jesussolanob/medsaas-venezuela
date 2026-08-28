import { GetSpecialistSellerAssignmentUseCase } from './get-specialist-seller-assignment.use-case';
import type {
  ISellerRepository,
  SpecialistSellerAssignment,
} from '../../domain/repositories/seller.repository';

const SPECIALIST_ID = 'spec-uuid-001';
const SELLER_ID = 'seller-uuid-001';

function makeRepoMock(): jest.Mocked<ISellerRepository> {
  return {
    createSeller: jest.fn(),
    findById: jest.fn(),
    listSellers: jest.fn(),
    findByCode: jest.fn(),
    codeExists: jest.fn(),
    listSoldSpecialists: jest.fn(),
    findSoldSpecialist: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
  };
}

describe('GetSpecialistSellerAssignmentUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: GetSpecialistSellerAssignmentUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new GetSpecialistSellerAssignmentUseCase(repoMock);
  });

  it('returns the seller assignment when the specialist has a seller', async () => {
    const assignment: SpecialistSellerAssignment = {
      specialistId: SPECIALIST_ID,
      sellerId: SELLER_ID,
      sellerName: 'Laura Pérez',
      soldBySource: 'code',
    };
    repoMock.getSpecialistSellerAssignment.mockResolvedValue(assignment);

    const result = await useCase.execute(SPECIALIST_ID);

    expect(repoMock.getSpecialistSellerAssignment).toHaveBeenCalledWith(SPECIALIST_ID);
    expect(result).toBe(assignment);
  });

  it('returns struct with null fields when specialist exists but has no seller', async () => {
    const unassigned: SpecialistSellerAssignment = {
      specialistId: SPECIALIST_ID,
      sellerId: null,
      sellerName: null,
      soldBySource: null,
    };
    repoMock.getSpecialistSellerAssignment.mockResolvedValue(unassigned);

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result).toEqual(unassigned);
    expect(result?.sellerId).toBeNull();
  });

  it('returns null when the specialist profile does not exist', async () => {
    repoMock.getSpecialistSellerAssignment.mockResolvedValue(null);

    const result = await useCase.execute('non-existent-id');

    expect(result).toBeNull();
  });

  it('exposes soldBySource so the admin modal can explain how the attribution happened', async () => {
    const assignment: SpecialistSellerAssignment = {
      specialistId: SPECIALIST_ID,
      sellerId: SELLER_ID,
      sellerName: 'María García',
      soldBySource: 'admin',
    };
    repoMock.getSpecialistSellerAssignment.mockResolvedValue(assignment);

    const result = await useCase.execute(SPECIALIST_ID);

    expect(result?.soldBySource).toBe('admin');
  });
});
