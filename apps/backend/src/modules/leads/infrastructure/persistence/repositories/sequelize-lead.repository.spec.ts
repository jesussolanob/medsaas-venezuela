import { SequelizeLeadRepository } from './sequelize-lead.repository';
import { Lead } from '../../../domain/entities/lead.entity';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const LEAD_ID = 'llllllll-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeModelRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

describe('SequelizeLeadRepository (unit)', () => {
  let repo: SequelizeLeadRepository;
  let mockLeadModel: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    destroy: jest.Mock;
  };

  beforeEach(() => {
    mockLeadModel = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      destroy: jest.fn(),
    };
    repo = new SequelizeLeadRepository(mockLeadModel as never);
  });

  describe('list', () => {
    it('returns mapped domain entities', async () => {
      mockLeadModel.findAll.mockResolvedValue([makeModelRow()]);

      const result = await repo.list({ doctorId: DOCTOR_ID });

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Lead);
      expect(result[0]!.name).toBe('Maria Fernandez');
    });

    it('filters by stage when provided', async () => {
      mockLeadModel.findAll.mockResolvedValue([]);

      await repo.list({ doctorId: DOCTOR_ID, stage: 'converted' });

      expect(mockLeadModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stage: 'converted' }),
        }),
      );
    });

    it('does not add stage filter when not provided', async () => {
      mockLeadModel.findAll.mockResolvedValue([]);

      await repo.list({ doctorId: DOCTOR_ID });

      const callArg = mockLeadModel.findAll.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(callArg.where).not.toHaveProperty('stage');
    });
  });

  describe('findByIdForDoctor', () => {
    it('returns a domain entity when found', async () => {
      mockLeadModel.findOne.mockResolvedValue(makeModelRow());

      const result = await repo.findByIdForDoctor(LEAD_ID, DOCTOR_ID);

      expect(result).toBeInstanceOf(Lead);
      expect(result?.id).toBe(LEAD_ID);
    });

    it('returns null when not found', async () => {
      mockLeadModel.findOne.mockResolvedValue(null);

      const result = await repo.findByIdForDoctor(LEAD_ID, DOCTOR_ID);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new row and returns the domain entity', async () => {
      const lead = Lead.create({
        id: LEAD_ID,
        doctorId: DOCTOR_ID,
        name: 'Carlos',
        phone: null,
        channel: 'web',
        stage: 'new',
        message: null,
        source: null,
        status: null,
        lastActivity: now,
        createdAt: now,
        updatedAt: now,
      });
      mockLeadModel.create.mockResolvedValue(makeModelRow({ name: 'Carlos', channel: 'web' }));

      const result = await repo.create(lead);

      expect(mockLeadModel.create).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(Lead);
    });
  });

  describe('save', () => {
    it('updates the lead and returns the updated entity', async () => {
      const updatedRow = makeModelRow({ name: 'Updated Name' });
      mockLeadModel.update.mockResolvedValue([1]);
      mockLeadModel.findOne.mockResolvedValue(updatedRow);

      const result = await repo.save(LEAD_ID, DOCTOR_ID, { name: 'Updated Name' });

      expect(mockLeadModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Name' }),
        expect.objectContaining({ where: { id: LEAD_ID, doctorId: DOCTOR_ID } }),
      );
      expect(result.name).toBe('Updated Name');
    });

    it('throws LeadNotFoundError when findOne returns null after update', async () => {
      mockLeadModel.update.mockResolvedValue([0]);
      mockLeadModel.findOne.mockResolvedValue(null);

      await expect(repo.save(LEAD_ID, DOCTOR_ID, { stage: 'contacted' })).rejects.toThrow(
        LeadNotFoundError,
      );
    });

    it('includes phone, channel, message, and lastActivity in updateData when provided', async () => {
      const updatedRow = makeModelRow({ phone: '+58 414 000 0000', channel: 'instagram' });
      mockLeadModel.update.mockResolvedValue([1]);
      mockLeadModel.findOne.mockResolvedValue(updatedRow);
      const activity = new Date('2026-06-02T00:00:00Z');

      await repo.save(LEAD_ID, DOCTOR_ID, {
        phone: '+58 414 000 0000',
        channel: 'instagram',
        message: 'nuevo',
        lastActivity: activity,
      });

      expect(mockLeadModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+58 414 000 0000',
          channel: 'instagram',
          message: 'nuevo',
          lastActivity: activity,
        }),
        expect.anything(),
      );
    });
  });

  describe('delete', () => {
    it('destroys the row when it exists', async () => {
      mockLeadModel.destroy.mockResolvedValue(1);

      await expect(repo.delete(LEAD_ID, DOCTOR_ID)).resolves.toBeUndefined();
      expect(mockLeadModel.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LEAD_ID, doctorId: DOCTOR_ID } }),
      );
    });

    it('throws LeadNotFoundError when destroy returns 0 (not found)', async () => {
      mockLeadModel.destroy.mockResolvedValue(0);

      await expect(repo.delete(LEAD_ID, DOCTOR_ID)).rejects.toThrow(LeadNotFoundError);
    });
  });
});
