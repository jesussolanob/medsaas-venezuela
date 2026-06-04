import { CreateLeadUseCase } from './create-lead.use-case';
import type { ILeadRepository } from '../../../domain/repositories/lead.repository';
import { Lead } from '../../../domain/entities/lead.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

describe('CreateLeadUseCase', () => {
  let useCase: CreateLeadUseCase;
  let mockRepo: jest.Mocked<ILeadRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new CreateLeadUseCase(mockRepo);
  });

  it('creates a lead with required fields', async () => {
    const saved = Lead.create({
      id: 'llllllll-0000-0000-0000-000000000001',
      doctorId: DOCTOR_ID,
      name: 'Carlos Torres',
      phone: null,
      channel: null,
      stage: 'new',
      message: null,
      source: null,
      status: null,
      lastActivity: now,
      createdAt: now,
      updatedAt: now,
    });
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, name: 'Carlos Torres' });

    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Carlos Torres');
    expect(result.doctorId).toBe(DOCTOR_ID);
  });

  it('defaults stage to "new" when not provided', async () => {
    mockRepo.create.mockImplementation(async (lead) => lead);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, name: 'Test Lead' });

    expect(result.stage).toBe('new');
  });

  it('uses the provided stage when specified', async () => {
    mockRepo.create.mockImplementation(async (lead) => lead);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      name: 'Test Lead',
      stage: 'qualified',
    });

    expect(result.stage).toBe('qualified');
  });

  it('passes optional fields correctly', async () => {
    mockRepo.create.mockImplementation(async (lead) => lead);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      name: 'Ana Morales',
      phone: '+58 424 345 6789',
      channel: 'instagram',
      message: 'Consulta por Instagram',
      source: 'manual',
    });

    expect(result.phone).toBe('+58 424 345 6789');
    expect(result.channel).toBe('instagram');
    expect(result.message).toBe('Consulta por Instagram');
    expect(result.source).toBe('manual');
  });

  it('sets null defaults for unprovided optional fields', async () => {
    mockRepo.create.mockImplementation(async (lead) => lead);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, name: 'Solo Nombre' });

    expect(result.phone).toBeNull();
    expect(result.channel).toBeNull();
    expect(result.message).toBeNull();
    expect(result.source).toBeNull();
  });
});
