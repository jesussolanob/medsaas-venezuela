import { GetAdminSellerPaymentDetailsUseCase } from './get-admin-seller-payment-details.use-case';
import type {
  ISellerRepository,
  SellerPaymentDetails,
} from '../../domain/repositories/seller.repository';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

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
    updateSoldSpecialistContact: jest.fn(),
    createSoldSpecialist: jest.fn(),
    linkSoldBy: jest.fn(),
    getSellerPaymentDetails: jest.fn(),
    updateSellerPaymentDetails: jest.fn(),
    getSpecialistSellerAssignment: jest.fn(),
    deactivateOwnAccount: jest.fn(),
  };
}

describe('GetAdminSellerPaymentDetailsUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: GetAdminSellerPaymentDetailsUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new GetAdminSellerPaymentDetailsUseCase(repoMock);
  });

  it('returns payment details for any seller by id', async () => {
    const details: SellerPaymentDetails = {
      sellerId: SELLER_ID,
      paymentDetails: { transferencia: { account_number: '01050012341234567890' } },
    };
    repoMock.getSellerPaymentDetails.mockResolvedValue(details);

    const result = await useCase.execute(SELLER_ID);

    expect(repoMock.getSellerPaymentDetails).toHaveBeenCalledWith(SELLER_ID);
    expect(result).toBe(details);
  });

  it('returns empty paymentDetails when seller has no configuration', async () => {
    repoMock.getSellerPaymentDetails.mockResolvedValue({
      sellerId: SELLER_ID,
      paymentDetails: {},
    });

    const result = await useCase.execute(SELLER_ID);

    expect(result.paymentDetails).toEqual({});
  });

  it('throws SellerNotFoundError when seller id does not match any active seller', async () => {
    repoMock.getSellerPaymentDetails.mockResolvedValue(null);

    await expect(useCase.execute(SELLER_ID)).rejects.toBeInstanceOf(SellerNotFoundError);
  });
});
