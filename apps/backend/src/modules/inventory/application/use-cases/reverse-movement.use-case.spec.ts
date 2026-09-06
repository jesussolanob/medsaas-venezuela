import { ReverseMovementUseCase } from './reverse-movement.use-case';
import type { IProductRepository } from '../../domain/repositories/iproduct.repository';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { MovementNotFoundError } from '../../domain/errors/movement-not-found.error';
import { MovementCannotBeReversedError } from '../../domain/errors/movement-cannot-be-reversed.error';
import { MovementAlreadyReversedError } from '../../domain/errors/movement-already-reversed.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const MOVEMENT_ID = 'mmmmmmmm-0000-0000-0000-000000000001';
const PRODUCT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-09-06T00:00:00Z');

function makeMovement(
  overrides: Partial<ConstructorParameters<typeof InventoryMovement>[0]> = {},
): InventoryMovement {
  return InventoryMovement.create({
    id: MOVEMENT_ID,
    doctorId: DOCTOR_ID,
    productId: PRODUCT_ID,
    kind: 'purchase',
    qty: 10,
    unitPriceUsd: null,
    rateUsed: null,
    rateSource: null,
    consultationId: null,
    note: null,
    createdAt: now,
    reversesMovementId: null,
    ...overrides,
  });
}

function makeRepo(
  movement: InventoryMovement | null,
  reverseResult: InventoryMovement | Error = makeMovement(),
): jest.Mocked<IProductRepository> {
  return {
    list: jest.fn(),
    findByIdForDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    listMovements: jest.fn(),
    saveMovement: jest.fn(),
    applyMovement: jest.fn(),
    findSalesByConsultation: jest.fn(),
    revertSalesByConsultation: jest.fn(),
    findMovementByIdForDoctor: jest.fn().mockResolvedValue(movement),
    reverseMovement:
      reverseResult instanceof Error
        ? jest.fn().mockRejectedValue(reverseResult)
        : jest.fn().mockResolvedValue(reverseResult),
    findProductsByIdsForDoctor: jest.fn(),
    applyBulkMovements: jest.fn(),
  };
}

describe('ReverseMovementUseCase', () => {
  it('delegates to repo.reverseMovement for a valid manual movement', async () => {
    const repo = makeRepo(makeMovement());
    const uc = new ReverseMovementUseCase(repo);
    await uc.execute(MOVEMENT_ID, DOCTOR_ID);
    expect(repo.reverseMovement).toHaveBeenCalledWith(
      MOVEMENT_ID,
      DOCTOR_ID,
      expect.any(String), // generated UUID
    );
  });

  it('throws MovementNotFoundError when movement does not exist — anti-IDOR', async () => {
    const uc = new ReverseMovementUseCase(makeRepo(null));
    await expect(uc.execute(MOVEMENT_ID, DOCTOR_ID)).rejects.toThrow(MovementNotFoundError);
  });

  it('throws MovementNotFoundError for a movement owned by another doctor', async () => {
    // The repo returns null for foreign movements (anti-IDOR).
    const uc = new ReverseMovementUseCase(makeRepo(null));
    await expect(uc.execute(MOVEMENT_ID, 'other-doctor')).rejects.toThrow(MovementNotFoundError);
  });

  it('throws MovementCannotBeReversedError for a consultation-linked movement', async () => {
    const consultationMovement = makeMovement({
      kind: 'sale',
      consultationId: 'cccccccc-0000-0000-0000-000000000001',
    });
    const uc = new ReverseMovementUseCase(makeRepo(consultationMovement));
    await expect(uc.execute(MOVEMENT_ID, DOCTOR_ID)).rejects.toThrow(MovementCannotBeReversedError);
  });

  it('does not call reverseMovement when movement is consultation-linked', async () => {
    const consultationMovement = makeMovement({
      kind: 'sale',
      consultationId: 'cccccccc-0000-0000-0000-000000000001',
    });
    const repo = makeRepo(consultationMovement);
    const uc = new ReverseMovementUseCase(repo);
    await uc.execute(MOVEMENT_ID, DOCTOR_ID).catch(() => {});
    expect(repo.reverseMovement).not.toHaveBeenCalled();
  });

  it('propagates MovementAlreadyReversedError from the repo', async () => {
    const repo = makeRepo(makeMovement(), new MovementAlreadyReversedError());
    const uc = new ReverseMovementUseCase(repo);
    await expect(uc.execute(MOVEMENT_ID, DOCTOR_ID)).rejects.toThrow(MovementAlreadyReversedError);
  });

  it('accepts any non-consultation kind (purchase, adjustment, loss)', async () => {
    for (const kind of ['purchase', 'adjustment', 'loss'] as const) {
      const repo = makeRepo(makeMovement({ kind }));
      const uc = new ReverseMovementUseCase(repo);
      await uc.execute(MOVEMENT_ID, DOCTOR_ID);
      expect(repo.reverseMovement).toHaveBeenCalled();
    }
  });
});
