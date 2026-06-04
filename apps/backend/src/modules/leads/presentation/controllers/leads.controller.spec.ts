import { Test, type TestingModule } from '@nestjs/testing';
import { LeadsController } from './leads.controller';
import { ListLeadsUseCase } from '../../application/use-cases/leads/list-leads.use-case';
import { CreateLeadUseCase } from '../../application/use-cases/leads/create-lead.use-case';
import { UpdateLeadUseCase } from '../../application/use-cases/leads/update-lead.use-case';
import { UpdateLeadStageUseCase } from '../../application/use-cases/leads/update-lead-stage.use-case';
import { DeleteLeadUseCase } from '../../application/use-cases/leads/delete-lead.use-case';
import { Lead } from '../../domain/entities/lead.entity';
import { LeadNotFoundError } from '../../domain/errors/lead-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

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

describe('LeadsController', () => {
  let controller: LeadsController;

  const mockList = { execute: jest.fn() };
  const mockCreate = { execute: jest.fn() };
  const mockUpdate = { execute: jest.fn() };
  const mockUpdateStage = { execute: jest.fn() };
  const mockDelete = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [
        { provide: ListLeadsUseCase, useValue: mockList },
        { provide: CreateLeadUseCase, useValue: mockCreate },
        { provide: UpdateLeadUseCase, useValue: mockUpdate },
        { provide: UpdateLeadStageUseCase, useValue: mockUpdateStage },
        { provide: DeleteLeadUseCase, useValue: mockDelete },
      ],
    }).compile();

    controller = module.get<LeadsController>(LeadsController);
  });

  describe('list', () => {
    it('returns success envelope with lead list', async () => {
      const leads = [makeLead()];
      mockList.execute.mockResolvedValue(leads);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockList.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, stage: undefined });
    });

    it('passes stage filter when provided as a valid stage', async () => {
      mockList.execute.mockResolvedValue([]);

      await controller.list(mockUser, 'contacted');

      expect(mockList.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, stage: 'contacted' });
    });

    it('ignores invalid stage query param (passes undefined)', async () => {
      mockList.execute.mockResolvedValue([]);

      await controller.list(mockUser, 'invalid_stage');

      expect(mockList.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, stage: undefined });
    });
  });

  describe('create', () => {
    it('returns the created lead in a success envelope', async () => {
      const lead = makeLead();
      mockCreate.execute.mockResolvedValue(lead);

      const result = await controller.create({ name: 'Maria Fernandez', stage: 'new' }, mockUser);

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, name: 'Maria Fernandez' }),
      );
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      const lead = makeLead();
      mockCreate.execute.mockResolvedValue(lead);

      await controller.create({ name: 'Test', stage: 'new' }, mockUser);

      const callArg = mockCreate.execute.mock.calls[0][0] as { doctorId: string };
      expect(callArg.doctorId).toBe(DOCTOR_ID);
    });
  });

  describe('update', () => {
    it('returns the updated lead in a success envelope', async () => {
      const lead = makeLead({ name: 'Updated' });
      mockUpdate.execute.mockResolvedValue(lead);

      const result = await controller.update(LEAD_ID, { name: 'Updated' }, mockUser);

      expect(result.success).toBe(true);
      expect(mockUpdate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: LEAD_ID, doctorId: DOCTOR_ID }),
      );
    });

    it('propagates LeadNotFoundError when lead does not exist', async () => {
      mockUpdate.execute.mockRejectedValue(new LeadNotFoundError());

      await expect(controller.update(LEAD_ID, { name: 'X' }, mockUser)).rejects.toThrow(
        LeadNotFoundError,
      );
    });
  });

  describe('updateStage', () => {
    it('returns the updated lead with new stage', async () => {
      const lead = makeLead({ stage: 'contacted' });
      mockUpdateStage.execute.mockResolvedValue(lead);

      const result = await controller.updateStage(LEAD_ID, { stage: 'contacted' }, mockUser);

      expect(result.success).toBe(true);
      expect(mockUpdateStage.execute).toHaveBeenCalledWith({
        leadId: LEAD_ID,
        doctorId: DOCTOR_ID,
        stage: 'contacted',
      });
    });
  });

  describe('remove', () => {
    it('resolves without returning content on success', async () => {
      mockDelete.execute.mockResolvedValue(undefined);

      await expect(controller.remove(LEAD_ID, mockUser)).resolves.toBeUndefined();
      expect(mockDelete.execute).toHaveBeenCalledWith({ leadId: LEAD_ID, doctorId: DOCTOR_ID });
    });

    it('propagates LeadNotFoundError when lead does not exist', async () => {
      mockDelete.execute.mockRejectedValue(new LeadNotFoundError());

      await expect(controller.remove(LEAD_ID, mockUser)).rejects.toThrow(LeadNotFoundError);
    });
  });
});
