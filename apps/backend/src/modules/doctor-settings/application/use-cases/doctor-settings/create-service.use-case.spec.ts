import { CreateServiceUseCase } from './create-service.use-case';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('CreateServiceUseCase', () => {
  let useCase: CreateServiceUseCase;
  let mockRepo: jest.Mocked<IPricingPlanRepository>;

  beforeEach(() => {
    mockRepo = {
      findPublicByDoctorId: jest.fn(),
      findAllByDoctorId: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new CreateServiceUseCase(mockRepo);
  });

  it('creates a service with required fields', async () => {
    const saved = PricingPlan.create({
      id: 'new-plan-uuid',
      doctorId: DOCTOR_ID,
      name: 'Consulta Inicial',
      priceUsd: 80,
      durationMinutes: 60,
      sessionsCount: 1,
      description: null,
      type: 'plan',
      showInBooking: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.save.mockResolvedValue(saved);

    const result = await useCase.execute(DOCTOR_ID, {
      name: 'Consulta Inicial',
      priceUsd: 80,
      durationMinutes: 60,
    });

    expect(result.name).toBe('Consulta Inicial');
    expect(result.priceUsd).toBe(80);
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('applies default values for optional fields', async () => {
    const saved = PricingPlan.create({
      id: 'uuid',
      doctorId: DOCTOR_ID,
      name: 'Consulta',
      priceUsd: 50,
      durationMinutes: 30,
      sessionsCount: 1,
      description: null,
      type: 'plan',
      showInBooking: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.save.mockResolvedValue(saved);

    await useCase.execute(DOCTOR_ID, { name: 'Consulta', priceUsd: 50 });

    const firstCall = mockRepo.save.mock.calls[0];
    // firstCall is guaranteed to exist because mockRepo.save was called once above
    expect(firstCall).toBeDefined();
    const calledWith = firstCall![0]!;
    expect(calledWith.durationMinutes).toBe(30);
    expect(calledWith.sessionsCount).toBe(1);
    expect(calledWith.type).toBe('plan');
    expect(calledWith.showInBooking).toBe(true);
    expect(calledWith.isActive).toBe(true);
  });
});
