import { DeleteServiceUseCase } from './delete-service.use-case';
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

describe('DeleteServiceUseCase', () => {
  let useCase: DeleteServiceUseCase;
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
    useCase = new DeleteServiceUseCase(mockRepo);
  });

  it('deletes the service when doctor owns it', async () => {
    mockRepo.findById.mockResolvedValue(makePlan());
    mockRepo.delete.mockResolvedValue(undefined);

    await useCase.execute(DOCTOR_ID, SERVICE_ID);

    expect(mockRepo.delete).toHaveBeenCalledWith(SERVICE_ID);
  });

  it('throws DoctorServiceNotFoundError when service does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID, SERVICE_ID)).rejects.toBeInstanceOf(
      DoctorServiceNotFoundError,
    );
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it('throws DoctorServiceNotOwnedError when service belongs to another doctor', async () => {
    mockRepo.findById.mockResolvedValue(makePlan(OTHER_DOCTOR_ID));

    await expect(useCase.execute(DOCTOR_ID, SERVICE_ID)).rejects.toBeInstanceOf(
      DoctorServiceNotOwnedError,
    );
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });
});
