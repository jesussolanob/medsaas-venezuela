import { DeleteLeadUseCase } from './delete-lead.use-case';
import type { ILeadRepository } from '../../../domain/repositories/lead.repository';
import { Lead } from '../../../domain/entities/lead.entity';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeLead(): Lead {
  return Lead.create({
    id: LEAD_ID,
    doctorId: DOCTOR_ID,
    name: 'Test Lead',
    phone: null,
    channel: null,
    stage: 'new',
    message: null,
    source: null,
    status: null,
    lastActivity: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('DeleteLeadUseCase', () => {
  let useCase: DeleteLeadUseCase;
  let mockRepo: jest.Mocked<ILeadRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new DeleteLeadUseCase(mockRepo);
  });

  it('throws LeadNotFoundError when lead does not exist for this doctor', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      LeadNotFoundError,
    );

    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it('calls repo.delete with the correct arguments on success', async () => {
    const existing = makeLead();
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.delete.mockResolvedValue(undefined);

    await useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID });

    expect(mockRepo.delete).toHaveBeenCalledWith(LEAD_ID, DOCTOR_ID);
  });

  it('prevents deleting a lead owned by another doctor (anti-IDOR)', async () => {
    // findByIdForDoctor scopes by doctorId — returns null for foreign IDs.
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ leadId: LEAD_ID, doctorId: 'foreign-doctor-id' }),
    ).rejects.toThrow(LeadNotFoundError);
  });
});
