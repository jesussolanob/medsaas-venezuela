import { UpdateLeadStageUseCase } from './update-lead-stage.use-case';
import type { ILeadRepository } from '../../../domain/repositories/lead.repository';
import { Lead } from '../../../domain/entities/lead.entity';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';
import { LeadInvalidStageError } from '../../../domain/errors/lead-invalid-stage.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeLead(): Lead {
  return Lead.create({
    id: LEAD_ID,
    doctorId: DOCTOR_ID,
    name: 'Maria Fernandez',
    phone: '+58 412 123 4567',
    channel: 'whatsapp',
    stage: 'new',
    message: null,
    source: null,
    status: null,
    lastActivity: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('UpdateLeadStageUseCase', () => {
  let useCase: UpdateLeadStageUseCase;
  let mockRepo: jest.Mocked<ILeadRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new UpdateLeadStageUseCase(mockRepo);
  });

  it('throws LeadNotFoundError when lead does not exist for this doctor', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID, stage: 'contacted' }),
    ).rejects.toThrow(LeadNotFoundError);
  });

  it('updates the stage and lastActivity on success', async () => {
    const existing = makeLead();
    const updated = Lead.create({ ...existing, stage: 'contacted', updatedAt: new Date() });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    const result = await useCase.execute({
      leadId: LEAD_ID,
      doctorId: DOCTOR_ID,
      stage: 'contacted',
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      LEAD_ID,
      DOCTOR_ID,
      expect.objectContaining({ stage: 'contacted', lastActivity: expect.any(Date) }),
    );
    expect(result.stage).toBe('contacted');
  });

  it.each(['new', 'contacted', 'qualified', 'appointment', 'converted', 'lost'] as const)(
    'accepts valid stage "%s"',
    async (stage) => {
      const existing = makeLead();
      const updated = Lead.create({ ...existing, stage });
      mockRepo.findByIdForDoctor.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue(updated);

      const result = await useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID, stage });

      expect(result.stage).toBe(stage);
    },
  );

  it('throws LeadInvalidStageError for an unrecognised stage value', async () => {
    const existing = makeLead();
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);

    await expect(
      useCase.execute({ leadId: LEAD_ID, doctorId: DOCTOR_ID, stage: 'bad_stage' as never }),
    ).rejects.toThrow(LeadInvalidStageError);
  });
});
