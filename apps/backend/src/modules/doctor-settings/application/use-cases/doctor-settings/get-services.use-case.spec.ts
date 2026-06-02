import { GetServicesUseCase } from './get-services.use-case';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makePlan(
  overrides: Partial<ConstructorParameters<typeof PricingPlan>[0]> = {},
): PricingPlan {
  return PricingPlan.create({
    id: 'plan-uuid-1',
    doctorId: DOCTOR_ID,
    name: 'Consulta General',
    priceUsd: 50,
    durationMinutes: 30,
    sessionsCount: 1,
    description: null,
    type: 'plan',
    showInBooking: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('GetServicesUseCase', () => {
  let useCase: GetServicesUseCase;
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
    useCase = new GetServicesUseCase(mockRepo);
  });

  it('returns all services (including hidden) for the doctor', async () => {
    const plans = [makePlan(), makePlan({ id: 'plan-uuid-2', showInBooking: false })];
    mockRepo.findAllByDoctorId.mockResolvedValue(plans);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(2);
    expect(mockRepo.findAllByDoctorId).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns empty array when doctor has no services', async () => {
    mockRepo.findAllByDoctorId.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual([]);
  });

  it('passes the exact doctorId to the repository (anti-IDOR assertion)', async () => {
    const OTHER_DOCTOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f01234567890';
    mockRepo.findAllByDoctorId.mockResolvedValue([]);

    await useCase.execute(OTHER_DOCTOR_ID);

    // Must query with the provided doctorId, never with a hardcoded or default value
    expect(mockRepo.findAllByDoctorId).toHaveBeenCalledWith(OTHER_DOCTOR_ID);
    expect(mockRepo.findAllByDoctorId).not.toHaveBeenCalledWith(DOCTOR_ID);
  });
});
