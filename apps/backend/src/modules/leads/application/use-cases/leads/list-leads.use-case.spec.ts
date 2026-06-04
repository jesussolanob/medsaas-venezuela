import { ListLeadsUseCase } from './list-leads.use-case';
import type { ILeadRepository } from '../../../domain/repositories/lead.repository';
import { Lead } from '../../../domain/entities/lead.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeLead(stage: Lead['stage'] = 'new'): Lead {
  return Lead.create({
    id: 'llllllll-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    name: 'Maria Fernandez',
    phone: '+58 412 000 0000',
    channel: 'whatsapp',
    stage,
    message: null,
    source: null,
    status: null,
    lastActivity: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('ListLeadsUseCase', () => {
  let useCase: ListLeadsUseCase;
  let mockRepo: jest.Mocked<ILeadRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new ListLeadsUseCase(mockRepo);
  });

  it('returns all leads for the authenticated doctor', async () => {
    const leads = [makeLead('new'), makeLead('contacted')];
    mockRepo.list.mockResolvedValue(leads);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toBe(leads);
    expect(mockRepo.list).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, stage: undefined });
  });

  it('filters by stage when provided', async () => {
    const leads = [makeLead('new')];
    mockRepo.list.mockResolvedValue(leads);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, stage: 'new' });

    expect(mockRepo.list).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, stage: 'new' });
    expect(result).toBe(leads);
  });

  it('returns empty array when no leads match', async () => {
    mockRepo.list.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, stage: 'converted' });

    expect(result).toEqual([]);
  });
});
