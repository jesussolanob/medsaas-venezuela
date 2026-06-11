import { UpdateServiceUseCase } from './update-service.use-case';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import { Office } from '../../../../offices/domain/entities/office.entity';
import { DoctorServiceNotFoundError } from '../../../domain/errors/doctor-service-not-found.error';
import { DoctorServiceNotOwnedError } from '../../../domain/errors/doctor-service-not-owned.error';
import { OfficeNotOwnedError } from '../../../domain/errors/office-not-owned.error';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const OTHER_DOCTOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f01234567890';
const SERVICE_ID = 'svc-uuid-1234-5678-abcd-ef1234567890';
const OFFICE_ID = 'c3d4e5f6-a7b8-9012-cdef-012345678901';

function makePlan(doctorId = DOCTOR_ID): PricingPlan {
  return PricingPlan.create({
    id: SERVICE_ID,
    doctorId,
    officeId: null,
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

function makeOffice(doctorId = DOCTOR_ID): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId,
    name: 'Consultorio Central',
    address: 'Calle 1',
    city: 'Caracas',
    phone: '',
    schedule: [],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality: 'in_person',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('UpdateServiceUseCase', () => {
  let useCase: UpdateServiceUseCase;
  let mockPlanRepo: jest.Mocked<IPricingPlanRepository>;
  let mockOfficeRepo: jest.Mocked<IOfficeRepository>;

  beforeEach(() => {
    mockPlanRepo = {
      findPublicByDoctorId: jest.fn(),
      findAllByDoctorId: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockOfficeRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new UpdateServiceUseCase(mockPlanRepo, mockOfficeRepo);
  });

  it('updates the service name and price when doctor owns it', async () => {
    const existing = makePlan();
    const updated = PricingPlan.create({ ...existing, name: 'Consulta Premium', priceUsd: 100 });
    mockPlanRepo.findById.mockResolvedValue(existing);
    mockPlanRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute(DOCTOR_ID, SERVICE_ID, {
      name: 'Consulta Premium',
      priceUsd: 100,
    });

    expect(result.name).toBe('Consulta Premium');
    expect(mockPlanRepo.update).toHaveBeenCalledWith(SERVICE_ID, {
      name: 'Consulta Premium',
      priceUsd: 100,
    });
    expect(mockOfficeRepo.findByIdForDoctor).not.toHaveBeenCalled();
  });

  it('validates office ownership when updating officeId to a non-null value', async () => {
    const existing = makePlan();
    const updated = PricingPlan.create({ ...existing, officeId: OFFICE_ID });
    mockPlanRepo.findById.mockResolvedValue(existing);
    mockOfficeRepo.findByIdForDoctor.mockResolvedValue(makeOffice());
    mockPlanRepo.update.mockResolvedValue(updated);

    await useCase.execute(DOCTOR_ID, SERVICE_ID, { officeId: OFFICE_ID });

    expect(mockOfficeRepo.findByIdForDoctor).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
    expect(mockPlanRepo.update).toHaveBeenCalledWith(SERVICE_ID, { officeId: OFFICE_ID });
  });

  it('throws OfficeNotOwnedError when new officeId is not owned by doctor', async () => {
    mockPlanRepo.findById.mockResolvedValue(makePlan());
    mockOfficeRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute(DOCTOR_ID, SERVICE_ID, { officeId: OFFICE_ID }),
    ).rejects.toBeInstanceOf(OfficeNotOwnedError);

    expect(mockPlanRepo.update).not.toHaveBeenCalled();
  });

  it('does not call officeRepo when setting officeId to null', async () => {
    const existing = makePlan();
    const updated = PricingPlan.create({ ...existing, officeId: null });
    mockPlanRepo.findById.mockResolvedValue(existing);
    mockPlanRepo.update.mockResolvedValue(updated);

    await useCase.execute(DOCTOR_ID, SERVICE_ID, { officeId: null });

    expect(mockOfficeRepo.findByIdForDoctor).not.toHaveBeenCalled();
    expect(mockPlanRepo.update).toHaveBeenCalledWith(SERVICE_ID, { officeId: null });
  });

  it('throws DoctorServiceNotFoundError when service does not exist', async () => {
    mockPlanRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(DOCTOR_ID, SERVICE_ID, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(DoctorServiceNotFoundError);

    expect(mockPlanRepo.update).not.toHaveBeenCalled();
  });

  it('throws DoctorServiceNotOwnedError when service belongs to another doctor', async () => {
    mockPlanRepo.findById.mockResolvedValue(makePlan(OTHER_DOCTOR_ID));

    await expect(
      useCase.execute(DOCTOR_ID, SERVICE_ID, { name: 'New Name' }),
    ).rejects.toBeInstanceOf(DoctorServiceNotOwnedError);

    expect(mockPlanRepo.update).not.toHaveBeenCalled();
  });
});
