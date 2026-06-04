import { CreatePromotionUseCase } from './create-promotion.use-case';
import type { IPromotionRepository } from '../../../domain/repositories/promotion.repository';
import { Promotion } from '../../../domain/entities/promotion.entity';
import { InvalidPromotionError } from '../../../domain/errors/invalid-promotion.error';

const now = new Date('2026-06-04T00:00:00Z');

function makeSaved(overrides: Partial<ConstructorParameters<typeof Promotion>[0]> = {}): Promotion {
  return new Promotion({
    id: 'pppppppp-0000-0000-0000-000000000001',
    planKey: 'basic',
    durationMonths: 3,
    originalPriceUsd: 100,
    promoPriceUsd: 75,
    label: 'Oferta 3 meses',
    isActive: true,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('CreatePromotionUseCase', () => {
  let useCase: CreatePromotionUseCase;
  let mockRepo: jest.Mocked<IPromotionRepository>;

  beforeEach(() => {
    mockRepo = {
      listAll: jest.fn(),
      listActive: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new CreatePromotionUseCase(mockRepo);
  });

  it('creates a promotion with required fields', async () => {
    const saved = makeSaved();
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute({
      planKey: 'basic',
      durationMonths: 3,
      originalPriceUsd: 100,
      promoPriceUsd: 75,
    });

    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(result.planKey).toBe('basic');
  });

  it('defaults label to "Oferta N meses" when not provided', async () => {
    let capturedLabel: string | null | undefined;
    mockRepo.create.mockImplementation(async (params) => {
      capturedLabel = params.label;
      return new Promotion({ ...makeSaved().asParams(), label: params.label });
    });

    await useCase.execute({
      planKey: 'basic',
      durationMonths: 6,
      originalPriceUsd: 200,
      promoPriceUsd: 150,
    });

    expect(capturedLabel).toBe('Oferta 6 meses');
  });

  it('uses provided label when given', async () => {
    let capturedLabel: string | null | undefined;
    mockRepo.create.mockImplementation(async (params) => {
      capturedLabel = params.label;
      return new Promotion({ ...makeSaved().asParams(), label: params.label });
    });

    await useCase.execute({
      planKey: 'basic',
      durationMonths: 3,
      originalPriceUsd: 100,
      promoPriceUsd: 75,
      label: 'Promocion especial',
    });

    expect(capturedLabel).toBe('Promocion especial');
  });

  it('defaults isActive to true when not provided', async () => {
    let capturedIsActive: boolean | undefined;
    mockRepo.create.mockImplementation(async (params) => {
      capturedIsActive = params.isActive;
      return new Promotion({ ...makeSaved().asParams(), isActive: params.isActive });
    });

    await useCase.execute({
      planKey: 'basic',
      durationMonths: 3,
      originalPriceUsd: 100,
      promoPriceUsd: 75,
    });

    expect(capturedIsActive).toBe(true);
  });

  it('uses provided isActive value', async () => {
    let capturedIsActive: boolean | undefined;
    mockRepo.create.mockImplementation(async (params) => {
      capturedIsActive = params.isActive;
      return new Promotion({ ...makeSaved().asParams(), isActive: params.isActive });
    });

    await useCase.execute({
      planKey: 'basic',
      durationMonths: 3,
      originalPriceUsd: 100,
      promoPriceUsd: 75,
      isActive: false,
    });

    expect(capturedIsActive).toBe(false);
  });

  it('throws InvalidPromotionError when promo_price >= original_price', async () => {
    await expect(
      useCase.execute({
        planKey: 'basic',
        durationMonths: 3,
        originalPriceUsd: 100,
        promoPriceUsd: 100,
      }),
    ).rejects.toThrow(InvalidPromotionError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('throws InvalidPromotionError when duration_months < 1', async () => {
    await expect(
      useCase.execute({
        planKey: 'basic',
        durationMonths: 0,
        originalPriceUsd: 100,
        promoPriceUsd: 75,
      }),
    ).rejects.toThrow(InvalidPromotionError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('passes endsAt to the repository', async () => {
    const ends = new Date('2026-12-31T00:00:00Z');
    let capturedEndsAt: Date | null | undefined;
    mockRepo.create.mockImplementation(async (params) => {
      capturedEndsAt = params.endsAt;
      return new Promotion({ ...makeSaved().asParams(), endsAt: params.endsAt });
    });

    await useCase.execute({
      planKey: 'basic',
      durationMonths: 3,
      originalPriceUsd: 100,
      promoPriceUsd: 75,
      endsAt: ends,
    });

    expect(capturedEndsAt).toEqual(ends);
  });
});
