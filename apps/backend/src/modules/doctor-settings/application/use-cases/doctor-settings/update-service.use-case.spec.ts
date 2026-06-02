import { UpdateServiceUseCase } from './update-service.use-case';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import { DoctorServiceNotFoundError } from '../../../domain/errors/doctor-service-not-found.error';
import { DoctorServiceNotOwnedError } from '../../../domain/errors/doctor-service-not-owned.error';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const OTHER_DOCTOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f01234567890';
const SERVICE_ID = 'svc-uuid-1234-5678-abcd-ef1234567890';

function makePlan(doctorId = DOCTOR_ID): PricingPlan {
  return PricingPlan.create({
    id: SERVICE_ID,
    doctorId,
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
}

describe('UpdateServiceUseCase', () => {
  let useCase: UpdateServiceUseCase;
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
    useCase = new UpdateServiceUseCase(mockRepo);
  });

  it('updates the service when doctor owns it', async () => {
    const existing = makePlan();
    const updated = PricingPlan.create({ ...existing, name: 'Consulta Premium', priceUsd: 100 });
    mockRepo.findById.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute(DOCTOR_ID, SERVICE_ID, {
      name: 'Consulta Premium',
      priceUsd: 100,
    });

    expect(result.name).toBe('Consulta Premium');
    expect(mockRepo.update).toHaveBeenCalledWith(SERVICE_ID, {
      name: 'Consulta Premium',
      priceUsd: 100,
    });
  });

  it('throws DoctorServiceNotFoundError when service does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(DOCTOR_ID, SERVICE_ID, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(DoctorServiceNotFoundError);

    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws DoctorServiceNotOwnedError when service belongs to another doctor', async () => {
    mockRepo.findById.mockResolvedValue(makePlan(OTHER_DOCTOR_ID));

    await expect(
      useCase.execute(DOCTOR_ID, SERVICE_ID, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(DoctorServiceNotOwnedError);

    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
