import { SequelizeSuggestionRepository } from './sequelize-suggestion.repository';
import { Suggestion } from '../../../domain/entities/suggestion.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const SUGGESTION_ID = 'ssssssss-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeModelRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SUGGESTION_ID,
    doctorId: DOCTOR_ID,
    subject: 'Better reports',
    message: 'Please add PDF export',
    category: 'general',
    status: 'pending',
    adminResponse: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SequelizeSuggestionRepository (unit)', () => {
  let repo: SequelizeSuggestionRepository;
  let mockModel: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    mockModel = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    repo = new SequelizeSuggestionRepository(mockModel as never);
  });

  describe('listForDoctor', () => {
    it('returns mapped domain entities for the given doctor', async () => {
      mockModel.findAll.mockResolvedValue([makeModelRow()]);

      const result = await repo.listForDoctor(DOCTOR_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Suggestion);
      expect(result[0]!.subject).toBe('Better reports');
    });

    it('queries by doctorId', async () => {
      mockModel.findAll.mockResolvedValue([]);

      await repo.listForDoctor(DOCTOR_ID);

      expect(mockModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ doctorId: DOCTOR_ID }),
        }),
      );
    });

    it('returns empty array when doctor has no suggestions', async () => {
      mockModel.findAll.mockResolvedValue([]);

      const result = await repo.listForDoctor(DOCTOR_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('listAll', () => {
    it('returns all suggestions without a status filter', async () => {
      mockModel.findAll.mockResolvedValue([makeModelRow()]);

      const result = await repo.listAll({});

      expect(result).toHaveLength(1);
      const callArg = mockModel.findAll.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(callArg.where).not.toHaveProperty('status');
    });

    it('filters by status when provided', async () => {
      mockModel.findAll.mockResolvedValue([]);

      await repo.listAll({ status: 'reviewed' });

      expect(mockModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'reviewed' }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns a domain entity when found', async () => {
      mockModel.findOne.mockResolvedValue(makeModelRow());

      const result = await repo.findById(SUGGESTION_ID);

      expect(result).toBeInstanceOf(Suggestion);
      expect(result?.id).toBe(SUGGESTION_ID);
    });

    it('returns null when not found', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await repo.findById(SUGGESTION_ID);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new row and returns the domain entity', async () => {
      const suggestion = Suggestion.create({
        id: SUGGESTION_ID,
        doctorId: DOCTOR_ID,
        subject: 'Feature request',
        message: 'Add dark mode',
        category: 'ui',
        status: 'pending',
        adminResponse: null,
        createdAt: now,
        updatedAt: now,
      });
      mockModel.create.mockResolvedValue(
        makeModelRow({ subject: 'Feature request', category: 'ui' }),
      );

      const result = await repo.create(suggestion);

      expect(mockModel.create).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(Suggestion);
    });

    it('persists all required fields', async () => {
      const suggestion = Suggestion.create({
        id: SUGGESTION_ID,
        doctorId: DOCTOR_ID,
        subject: 'Test subject',
        message: 'Test message',
        category: 'billing',
        status: 'pending',
        adminResponse: null,
        createdAt: now,
        updatedAt: now,
      });
      mockModel.create.mockResolvedValue(makeModelRow());

      await repo.create(suggestion);

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: SUGGESTION_ID,
          doctorId: DOCTOR_ID,
          subject: 'Test subject',
          message: 'Test message',
          category: 'billing',
          status: 'pending',
          adminResponse: null,
        }),
      );
    });
  });

  describe('save', () => {
    it('updates status and adminResponse fields', async () => {
      const suggestion = Suggestion.create({
        id: SUGGESTION_ID,
        doctorId: DOCTOR_ID,
        subject: 'Improve UI',
        message: 'Make it better',
        category: 'general',
        status: 'reviewed',
        adminResponse: 'Thank you!',
        createdAt: now,
        updatedAt: now,
      });
      const updatedRow = makeModelRow({ status: 'reviewed', adminResponse: 'Thank you!' });
      mockModel.update.mockResolvedValue([1]);
      mockModel.findOne.mockResolvedValue(updatedRow);

      const result = await repo.save(suggestion);

      expect(mockModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'reviewed', adminResponse: 'Thank you!' }),
        expect.objectContaining({ where: { id: SUGGESTION_ID } }),
      );
      expect(result.status).toBe('reviewed');
      expect(result.adminResponse).toBe('Thank you!');
    });

    it('throws when suggestion is not found after update', async () => {
      const suggestion = Suggestion.create({
        id: SUGGESTION_ID,
        doctorId: DOCTOR_ID,
        subject: 'Test',
        message: 'Test',
        category: 'general',
        status: 'done',
        adminResponse: null,
        createdAt: now,
        updatedAt: now,
      });
      mockModel.update.mockResolvedValue([0]);
      mockModel.findOne.mockResolvedValue(null);

      await expect(repo.save(suggestion)).rejects.toThrow(
        `Suggestion ${SUGGESTION_ID} not found after save`,
      );
    });
  });
});
