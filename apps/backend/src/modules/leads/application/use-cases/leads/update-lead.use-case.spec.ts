import { UpdateLeadUseCase } from './update-lead.use-case';
import type { ILeadRepository } from '../../../domain/repositories/lead.repository';
import { Lead } from '../../../domain/entities/lead.entity';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeLead(overrides: Partial<ConstructorParameters<typeof Lead>[0]> = {}): Lead {
  return Lead.create({
    id: LEAD_ID,
    doctorId: DOCTOR_ID,
    name: 'Maria Fernandez',
    phone: '+58 412 123 4567',
    channel: 'whatsapp',
    stage: 'new',
    message: 'Hola',
    source: null,
    status: null,
    lastActivity: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UpdateLeadUseCase', () => {
  let useCase: UpdateLeadUseCase;
  let mockRepo: jest.Mocked<ILeadRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new UpdateLeadUseCase(mockRepo);
  });

  it('throws LeadNotFoundError when lead does not exist for this doctor', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID, name: 'New Name' }),
    ).rejects.toThrow(LeadNotFoundError);
  });

  it('updates provided fields and delegates to repo.save', async () => {
    const existing = makeLead();
    const updated = makeLead({ name: 'Updated Name' });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    const result = await useCase.execute({
      leadId: LEAD_ID,
      doctorId: DOCTOR_ID,
      name: 'Updated Name',
    });

    expect(mockRepo.save).toHaveBeenCalledWith(LEAD_ID, DOCTOR_ID, { name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('only sends fields that are explicitly provided', async () => {
    const existing = makeLead();
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(existing);

    await useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID, phone: '+58 414 999 0000' });

    expect(mockRepo.save).toHaveBeenCalledWith(LEAD_ID, DOCTOR_ID, {
      phone: '+58 414 999 0000',
    });
  });

  it('allows setting phone to null', async () => {
    const existing = makeLead();
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(existing);

    await useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID, phone: null });

    expect(mockRepo.save).toHaveBeenCalledWith(LEAD_ID, DOCTOR_ID, { phone: null });
  });
});
