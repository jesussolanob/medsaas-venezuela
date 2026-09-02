import { UpdateSellerPaymentDetailsUseCase } from './update-seller-payment-details.use-case';
import type {
  ISellerRepository,
  SellerPaymentDetails,
} from '../../domain/repositories/seller.repository';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';
import { InvalidPaymentEntryError } from '../../domain/errors/invalid-payment-entry.error';

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

// Valid sample: single-entry object per method (ADR-044 shape)
const sampleDetails: Record<string, unknown> = {
  pago_movil: { phone: '0414-1234567', bank: 'Mercantil', cedula: 'V-12345678' },
  transferencia: {
    account_number: '01050012341234567890',
    bank: 'Mercantil',
    account_type: 'corriente',
    cedula: 'V-12345678',
    beneficiary: 'María González',
  },
};

// Valid sample: multi-entry array per method (pago_movil supports multiple accounts)
const multiEntryDetails: Record<string, unknown> = {
  pago_movil: [
    { phone: '0414-1111111', bank: 'Mercantil', cedula: 'V-11111111' },
    { phone: '0412-2222222', bank: 'Banesco', cedula: 'V-22222222' },
  ],
};

describe('UpdateSellerPaymentDetailsUseCase', () => {
  let repoMock: jest.Mocked<ISellerRepository>;
  let useCase: UpdateSellerPaymentDetailsUseCase;

  beforeEach(() => {
    repoMock = makeRepoMock();
    useCase = new UpdateSellerPaymentDetailsUseCase(repoMock);
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('delegates to the repository and returns the updated details', async () => {
    const expected: SellerPaymentDetails = {
      sellerId: SELLER_ID,
      paymentDetails: sampleDetails,
    };
    repoMock.updateSellerPaymentDetails.mockResolvedValue(expected);

    const result = await useCase.execute(SELLER_ID, sampleDetails);

    expect(repoMock.updateSellerPaymentDetails).toHaveBeenCalledWith(SELLER_ID, sampleDetails);
    expect(result).toBe(expected);
  });

  it('accepts multi-entry array format (pago_movil / transferencia)', async () => {
    repoMock.updateSellerPaymentDetails.mockResolvedValue({
      sellerId: SELLER_ID,
      paymentDetails: multiEntryDetails,
    });

    await expect(useCase.execute(SELLER_ID, multiEntryDetails)).resolves.not.toThrow();
    expect(repoMock.updateSellerPaymentDetails).toHaveBeenCalledWith(SELLER_ID, multiEntryDetails);
  });

  it('uses sellerId from argument — never reads from request body', async () => {
    repoMock.updateSellerPaymentDetails.mockResolvedValue({
      sellerId: 'other-seller',
      paymentDetails: {},
    });

    await useCase.execute('other-seller', {});

    expect(repoMock.updateSellerPaymentDetails).toHaveBeenCalledWith('other-seller', {});
    expect(repoMock.updateSellerPaymentDetails).not.toHaveBeenCalledWith(
      SELLER_ID,
      expect.anything(),
    );
  });

  it('passes the full details object unmodified to the repository', async () => {
    repoMock.updateSellerPaymentDetails.mockResolvedValue({
      sellerId: SELLER_ID,
      paymentDetails: sampleDetails,
    });

    await useCase.execute(SELLER_ID, sampleDetails);

    expect(repoMock.updateSellerPaymentDetails).toHaveBeenCalledWith(SELLER_ID, sampleDetails);
  });

  it('propagates SellerNotFoundError from the repository', async () => {
    repoMock.updateSellerPaymentDetails.mockRejectedValue(new SellerNotFoundError());

    await expect(useCase.execute(SELLER_ID, sampleDetails)).rejects.toBeInstanceOf(
      SellerNotFoundError,
    );
  });

  // ---------------------------------------------------------------------------
  // Validation — single-entry object
  // ---------------------------------------------------------------------------

  it('throws InvalidPaymentEntryError when a single-entry value has a non-string field', async () => {
    const bad: Record<string, unknown> = {
      pago_movil: { phone: '0414-1234567', bank: 42 }, // bank is a number
    };

    await expect(useCase.execute(SELLER_ID, bad)).rejects.toBeInstanceOf(InvalidPaymentEntryError);
    expect(repoMock.updateSellerPaymentDetails).not.toHaveBeenCalled();
  });

  it('throws InvalidPaymentEntryError when a single-entry object is completely empty', async () => {
    const bad: Record<string, unknown> = {
      efectivo: {},
    };

    await expect(useCase.execute(SELLER_ID, bad)).rejects.toBeInstanceOf(InvalidPaymentEntryError);
    expect(repoMock.updateSellerPaymentDetails).not.toHaveBeenCalled();
  });

  it('throws InvalidPaymentEntryError when the method value is null', async () => {
    const bad: Record<string, unknown> = { pago_movil: null };

    await expect(useCase.execute(SELLER_ID, bad)).rejects.toBeInstanceOf(InvalidPaymentEntryError);
    expect(repoMock.updateSellerPaymentDetails).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Validation — multi-entry array
  // ---------------------------------------------------------------------------

  it('throws InvalidPaymentEntryError when one element in an array has a non-string field', async () => {
    const bad: Record<string, unknown> = {
      pago_movil: [
        { phone: '0414-1111111', bank: 'Mercantil' }, // valid
        { phone: '0412-2222222', bank: true }, // boolean — invalid
      ],
    };

    await expect(useCase.execute(SELLER_ID, bad)).rejects.toBeInstanceOf(InvalidPaymentEntryError);
    expect(repoMock.updateSellerPaymentDetails).not.toHaveBeenCalled();
  });

  it('throws InvalidPaymentEntryError when one element in an array is an empty object', async () => {
    const bad: Record<string, unknown> = {
      transferencia: [{ account_number: '01050012341234567890', bank: 'Mercantil' }, {}],
    };

    await expect(useCase.execute(SELLER_ID, bad)).rejects.toBeInstanceOf(InvalidPaymentEntryError);
    expect(repoMock.updateSellerPaymentDetails).not.toHaveBeenCalled();
  });

  it('does not call repo when details is an empty object (no methods configured — valid)', async () => {
    // An empty top-level map means "clear all payment methods" — valid, no entries to validate.
    repoMock.updateSellerPaymentDetails.mockResolvedValue({
      sellerId: SELLER_ID,
      paymentDetails: {},
    });

    await expect(useCase.execute(SELLER_ID, {})).resolves.not.toThrow();
    expect(repoMock.updateSellerPaymentDetails).toHaveBeenCalledWith(SELLER_ID, {});
  });
});
