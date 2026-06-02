import { GetBookingPlansUseCase } from './get-booking-plans.use-case';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';

const makePlan = () =>
  PricingPlan.create({
    id: 'plan-001',
    doctorId: 'doc-001',
    name: 'Consulta General',
    priceUsd: 30,
    durationMinutes: 30,
    sessionsCount: 1,
    description: null,
    type: 'plan',
    showInBooking: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('GetBookingPlansUseCase', () => {
  let useCase: GetBookingPlansUseCase;
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
    useCase = new GetBookingPlansUseCase(mockRepo);
  });

  it('returns public plans for the doctor', async () => {
    mockRepo.findPublicByDoctorId.mockResolvedValue([makePlan()]);
    const result = await useCase.execute('doc-001');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Consulta General');
    expect(mockRepo.findPublicByDoctorId).toHaveBeenCalledWith('doc-001');
  });

  it('returns empty array when doctor has no public plans', async () => {
    mockRepo.findPublicByDoctorId.mockResolvedValue([]);
    const result = await useCase.execute('doc-001');
    expect(result).toHaveLength(0);
  });
});
