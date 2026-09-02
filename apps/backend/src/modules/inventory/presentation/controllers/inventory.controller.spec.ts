import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { ListProductsUseCase } from '../../application/use-cases/list-products.use-case';
import { GetProductUseCase } from '../../application/use-cases/get-product.use-case';
import { CreateProductUseCase } from '../../application/use-cases/create-product.use-case';
import { UpdateProductUseCase } from '../../application/use-cases/update-product.use-case';
import { DeactivateProductUseCase } from '../../application/use-cases/deactivate-product.use-case';
import { RegisterMovementUseCase } from '../../application/use-cases/register-movement.use-case';
import { ListMovementsUseCase } from '../../application/use-cases/list-movements.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';

const mockUser = { sub: DOCTOR_ID, role: 'doctor' };

const mockProduct = {
  id: PRODUCT_ID,
  doctorId: DOCTOR_ID,
  name: 'Crema A',
  description: '',
  supplier: null,
  photoUrl: null,
  salePriceAmount: 10,
  salePriceCurrency: 'USD',
  stockQty: 5,
  lowStockThreshold: null,
  isActive: true,
  isLowStock: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('InventoryController', () => {
  let controller: InventoryController;
  let listProductsUC: jest.Mocked<ListProductsUseCase>;
  let getProductUC: jest.Mocked<GetProductUseCase>;
  let createProductUC: jest.Mocked<CreateProductUseCase>;
  let _updateProductUC: jest.Mocked<UpdateProductUseCase>;
  let deactivateProductUC: jest.Mocked<DeactivateProductUseCase>;
  let registerMovementUC: jest.Mocked<RegisterMovementUseCase>;
  let listMovementsUC: jest.Mocked<ListMovementsUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: ListProductsUseCase, useValue: { execute: jest.fn() } },
        { provide: GetProductUseCase, useValue: { execute: jest.fn() } },
        { provide: CreateProductUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateProductUseCase, useValue: { execute: jest.fn() } },
        { provide: DeactivateProductUseCase, useValue: { execute: jest.fn() } },
        { provide: RegisterMovementUseCase, useValue: { execute: jest.fn() } },
        { provide: ListMovementsUseCase, useValue: { execute: jest.fn() } },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InventoryController>(InventoryController);
    listProductsUC = module.get(ListProductsUseCase);
    getProductUC = module.get(GetProductUseCase);
    createProductUC = module.get(CreateProductUseCase);
    _updateProductUC = module.get(UpdateProductUseCase);
    deactivateProductUC = module.get(DeactivateProductUseCase);
    registerMovementUC = module.get(RegisterMovementUseCase);
    listMovementsUC = module.get(ListMovementsUseCase);
  });

  it('index returns paginated products wrapped in success envelope', async () => {
    (listProductsUC.execute as jest.Mock).mockResolvedValue({
      items: [mockProduct],
      total: 1,
      page: 1,
      limit: 20,
    });
    const result = await controller.index(
      { page: 1, limit: 20, active: undefined },
      mockUser as never,
    );
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('show delegates to GetProductUseCase with authenticated doctorId', async () => {
    (getProductUC.execute as jest.Mock).mockResolvedValue(mockProduct);
    const result = await controller.show(PRODUCT_ID, mockUser as never);
    expect(result.success).toBe(true);
    expect(getProductUC.execute).toHaveBeenCalledWith(PRODUCT_ID, DOCTOR_ID);
  });

  it('create returns the new product in success envelope', async () => {
    (createProductUC.execute as jest.Mock).mockResolvedValue(mockProduct);
    const dto = {
      name: 'Crema A',
      description: '',
      sale_price_amount: 10,
      sale_price_currency: 'USD' as const,
      stock_qty: 0,
    };
    const result = await controller.create(dto, mockUser as never);
    expect(result.success).toBe(true);
    expect(createProductUC.execute).toHaveBeenCalledWith(dto, DOCTOR_ID);
  });

  it('remove calls DeactivateProductUseCase and returns void', async () => {
    (deactivateProductUC.execute as jest.Mock).mockResolvedValue(undefined);
    await controller.remove(PRODUCT_ID, mockUser as never);
    expect(deactivateProductUC.execute).toHaveBeenCalledWith(PRODUCT_ID, DOCTOR_ID);
  });

  it('addMovement delegates to RegisterMovementUseCase', async () => {
    const movement = {
      id: 'mvmt-id',
      doctorId: DOCTOR_ID,
      productId: PRODUCT_ID,
      kind: 'purchase',
      qty: 5,
      unitPriceUsd: null,
      rateUsed: null,
      rateSource: null,
      consultationId: null,
      note: null,
      createdAt: new Date(),
      isSale: () => false,
    };
    (registerMovementUC.execute as jest.Mock).mockResolvedValue(movement);
    const dto = { kind: 'purchase' as const, qty: 5 };
    const result = await controller.addMovement(PRODUCT_ID, dto, mockUser as never);
    expect(result.success).toBe(true);
    expect(registerMovementUC.execute).toHaveBeenCalledWith(PRODUCT_ID, DOCTOR_ID, dto);
  });

  it('getMovements delegates to ListMovementsUseCase', async () => {
    (listMovementsUC.execute as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const result = await controller.getMovements(PRODUCT_ID, '1', '20', mockUser as never);
    expect(result.success).toBe(true);
    expect(listMovementsUC.execute).toHaveBeenCalledWith(PRODUCT_ID, DOCTOR_ID, 1, 20);
  });
});
