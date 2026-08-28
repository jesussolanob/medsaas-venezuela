import { GetSellerPaymentDetailsUseCase } from './get-seller-payment-details.use-case';
import type {
  ISellerRepository,
  SellerPaymentDetails,
} from '../../domain/repositories/seller.repository';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

const SELLER_ID = 'seller-uuid-001';

function makeDetails(overrides: Partial<SellerPaymentDetails> = {}): SellerPaymentDetails {
  return {
    sellerId: SELLER_ID,
    paymentDetails: {},
    ...overrides,
  };
}

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

describe('GetSellerPaymentDetailsUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: GetSellerPaymentDetailsUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new GetSellerPaymentDetailsUseCase(repoMock);
  });

  it('returns payment details when seller exists', async () => {
    const details = makeDetails({
      paymentDetails: {
        pago_movil: { phone: '0414-1234567', bank: 'Mercantil', cedula: 'V-12345678' },
      },
    });
    repoMock.getSellerPaymentDetails.mockResolvedValue(details);

    const result = await useCase.execute(SELLER_ID);

    expect(repoMock.getSellerPaymentDetails).toHaveBeenCalledWith(SELLER_ID);
    expect(result.sellerId).toBe(SELLER_ID);
    expect(result.paymentDetails).toEqual(details.paymentDetails);
  });

  it('returns empty paymentDetails object when seller has no configuration yet', async () => {
    repoMock.getSellerPaymentDetails.mockResolvedValue(makeDetails({ paymentDetails: {} }));

    const result = await useCase.execute(SELLER_ID);

    expect(result.paymentDetails).toEqual({});
  });

  it('throws SellerNotFoundError when no matching seller profile exists', async () => {
    repoMock.getSellerPaymentDetails.mockResolvedValue(null);

    await expect(useCase.execute(SELLER_ID)).rejects.toBeInstanceOf(SellerNotFoundError);
  });

  it('uses sellerId from argument — never from request body', async () => {
    repoMock.getSellerPaymentDetails.mockResolvedValue(makeDetails({ sellerId: 'other-id' }));

    await useCase.execute('other-id');

    expect(repoMock.getSellerPaymentDetails).toHaveBeenCalledWith('other-id');
    expect(repoMock.getSellerPaymentDetails).not.toHaveBeenCalledWith(SELLER_ID);
  });
});
