import { DeactivateProductUseCase } from './deactivate-product.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';

function makeRepo(throws = false): jest.Mocked<IProductRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    deactivate: throws
      ? jest.fn().mockRejectedValue(new ProductNotFoundError())
      : jest.fn().mockResolvedValue(undefined),
    listMovements: jest.fn(),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
  };
}

describe('DeactivateProductUseCase', () => {
  it('calls repo.deactivate with correct args', async () => {
    const repo = makeRepo();
    const uc = new DeactivateProductUseCase(repo);
    await uc.execute(PRODUCT_ID, DOCTOR_ID);
    expect(repo.deactivate).toHaveBeenCalledWith(PRODUCT_ID, DOCTOR_ID);
  });

  it('propagates ProductNotFoundError from repo', async () => {
    const uc = new DeactivateProductUseCase(makeRepo(true));
    await expect(uc.execute(PRODUCT_ID, DOCTOR_ID)).rejects.toThrow(ProductNotFoundError);
  });
});
