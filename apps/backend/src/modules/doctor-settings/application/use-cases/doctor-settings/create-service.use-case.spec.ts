import { CreateServiceUseCase } from './create-service.use-case';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import { Office } from '../../../../offices/domain/entities/office.entity';
import { OfficeNotOwnedError } from '../../../domain/errors/office-not-owned.error';
import { PlanRequiresOfficeError } from '../../../domain/errors/plan-requires-office.error';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const OFFICE_ID = 'b2c3d4e5-f6a7-8901-bcde-f01234567890';

function makePricingPlan(overrides: Partial<ConstructorParameters<typeof PricingPlan>[0]> = {}) {
  return PricingPlan.create({
    id: 'new-plan-uuid',
    doctorId: DOCTOR_ID,
    officeId: null,
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
    ...overrides,
  });
}

function makeOffice(doctorId = DOCTOR_ID) {
  return Office.create({
    id: OFFICE_ID,
    doctorId,
    name: 'Consultorio Principal',
    address: 'Av. Bolívar 1',
    city: 'Caracas',
    phone: '+58 212 555 0000',
    schedule: [],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality: 'in_person',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('CreateServiceUseCase', () => {
  let useCase: CreateServiceUseCase;
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
    useCase = new CreateServiceUseCase(mockPlanRepo, mockOfficeRepo);
  });

  it('throws PlanRequiresOfficeError when doctor has no offices', async () => {
    mockOfficeRepo.listByDoctor.mockResolvedValue([]);

    await expect(
      useCase.execute(DOCTOR_ID, {
        name: 'Consulta Inicial',
        priceUsd: 80,
      }),
    ).rejects.toBeInstanceOf(PlanRequiresOfficeError);

    expect(mockPlanRepo.save).not.toHaveBeenCalled();
    expect(mockOfficeRepo.findByIdForDoctor).not.toHaveBeenCalled();
  });

  it('creates a general service (no office) without calling findByIdForDoctor', async () => {
    mockOfficeRepo.listByDoctor.mockResolvedValue([makeOffice()]);
    const saved = makePricingPlan();
    mockPlanRepo.save.mockResolvedValue(saved);

    const result = await useCase.execute(DOCTOR_ID, {
      name: 'Consulta Inicial',
      priceUsd: 80,
      durationMinutes: 60,
    });

    expect(result.name).toBe('Consulta Inicial');
    expect(result.priceUsd).toBe(80);
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.officeId).toBeNull();
    expect(mockPlanRepo.save).toHaveBeenCalledTimes(1);
    expect(mockOfficeRepo.findByIdForDoctor).not.toHaveBeenCalled();
  });

  it('creates an office-specific service after validating ownership', async () => {
    mockOfficeRepo.listByDoctor.mockResolvedValue([makeOffice()]);
    const saved = makePricingPlan({ officeId: OFFICE_ID });
    mockOfficeRepo.findByIdForDoctor.mockResolvedValue(makeOffice());
    mockPlanRepo.save.mockResolvedValue(saved);

    const result = await useCase.execute(DOCTOR_ID, {
      name: 'Consulta Presencial',
      priceUsd: 100,
      officeId: OFFICE_ID,
    });

    expect(result.officeId).toBe(OFFICE_ID);
    expect(mockOfficeRepo.findByIdForDoctor).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
    expect(mockPlanRepo.save).toHaveBeenCalledTimes(1);

    // Verify office_id is passed to the entity
    const createdPlan = mockPlanRepo.save.mock.calls[0]![0]!;
    expect(createdPlan.officeId).toBe(OFFICE_ID);
  });

  it('throws OfficeNotOwnedError when office does not belong to doctor', async () => {
    mockOfficeRepo.listByDoctor.mockResolvedValue([makeOffice()]);
    mockOfficeRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute(DOCTOR_ID, {
        name: 'Consulta',
        priceUsd: 50,
        officeId: OFFICE_ID,
      }),
    ).rejects.toBeInstanceOf(OfficeNotOwnedError);

    expect(mockPlanRepo.save).not.toHaveBeenCalled();
  });

  it('applies default values for optional fields', async () => {
    mockOfficeRepo.listByDoctor.mockResolvedValue([makeOffice()]);
    const saved = makePricingPlan({
      name: 'Consulta',
      priceUsd: 50,
      durationMinutes: 30,
      sessionsCount: 1,
    });
    mockPlanRepo.save.mockResolvedValue(saved);

    await useCase.execute(DOCTOR_ID, { name: 'Consulta', priceUsd: 50 });

    const calledWith = mockPlanRepo.save.mock.calls[0]![0]!;
    expect(calledWith.durationMinutes).toBe(30);
    expect(calledWith.sessionsCount).toBe(1);
    expect(calledWith.type).toBe('plan');
    expect(calledWith.showInBooking).toBe(true);
    expect(calledWith.isActive).toBe(true);
    expect(calledWith.officeId).toBeNull();
  });

  it('sets officeId to null when officeId is explicitly null', async () => {
    mockOfficeRepo.listByDoctor.mockResolvedValue([makeOffice()]);
    const saved = makePricingPlan();
    mockPlanRepo.save.mockResolvedValue(saved);

    await useCase.execute(DOCTOR_ID, { name: 'General', priceUsd: 50, officeId: null });

    const calledWith = mockPlanRepo.save.mock.calls[0]![0]!;
    expect(calledWith.officeId).toBeNull();
    expect(mockOfficeRepo.findByIdForDoctor).not.toHaveBeenCalled();
  });
});
