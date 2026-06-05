import { UpsertDoctorTemplateUseCase } from './upsert-doctor-template.use-case';
import type { IDoctorTemplateRepository } from '../../../domain/repositories/doctor-template.repository';
import { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';
import { InvalidTemplateTypeError } from '../../../domain/errors/invalid-template-type.error';
import type { UpsertDoctorTemplateDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const TEMPLATE_ID = 'tttttttt-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeExistingTemplate(overrides: Partial<Parameters<typeof DoctorTemplate.create>[0]> = {}): DoctorTemplate {
  return DoctorTemplate.create({
    id: TEMPLATE_ID,
    doctorId: DOCTOR_ID,
    templateType: 'informe',
    logoUrl: null,
    signatureUrl: null,
    fontFamily: 'Inter',
    headerText: '',
    footerText: '',
    showLogo: true,
    showSignature: true,
    primaryColor: '#0891b2',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UpsertDoctorTemplateUseCase', () => {
  let useCase: UpsertDoctorTemplateUseCase;
  let mockRepo: jest.Mocked<IDoctorTemplateRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByDoctorAndType: jest.fn(),
      upsert: jest.fn(),
    };
    useCase = new UpsertDoctorTemplateUseCase(mockRepo);
  });

  describe('when template does not exist (create path)', () => {
    it('creates a new template with defaults when body is empty', async () => {
      mockRepo.findByDoctorAndType.mockResolvedValue(null);
      const created = makeExistingTemplate();
      mockRepo.upsert.mockResolvedValue(created);

      const dto: UpsertDoctorTemplateDto = {};
      const result = await useCase.execute('informe', dto, DOCTOR_ID);

      expect(result).toBe(created);
      expect(mockRepo.upsert).toHaveBeenCalledTimes(1);

      const passedTemplate = mockRepo.upsert.mock.calls[0]?.[0];
      expect(passedTemplate?.doctorId).toBe(DOCTOR_ID);
      expect(passedTemplate?.templateType).toBe('informe');
      expect(passedTemplate?.fontFamily).toBe('Inter');
      expect(passedTemplate?.primaryColor).toBe('#0891b2');
    });

    it('creates with provided field values', async () => {
      mockRepo.findByDoctorAndType.mockResolvedValue(null);
      const created = makeExistingTemplate({ fontFamily: 'Roboto', primaryColor: '#ff0000' });
      mockRepo.upsert.mockResolvedValue(created);

      const dto: UpsertDoctorTemplateDto = {
        font_family: 'Roboto',
        primary_color: '#ff0000',
        logo_url: 'https://storage/logo.png',
      };
      await useCase.execute('informe', dto, DOCTOR_ID);

      const passedTemplate = mockRepo.upsert.mock.calls[0]?.[0];
      expect(passedTemplate?.fontFamily).toBe('Roboto');
      expect(passedTemplate?.primaryColor).toBe('#ff0000');
      expect(passedTemplate?.logoUrl).toBe('https://storage/logo.png');
    });

    it('always uses doctorId from the caller (anti-IDOR)', async () => {
      mockRepo.findByDoctorAndType.mockResolvedValue(null);
      mockRepo.upsert.mockResolvedValue(makeExistingTemplate());

      await useCase.execute('recipe', {}, DOCTOR_ID);

      const passedTemplate = mockRepo.upsert.mock.calls[0]?.[0];
      expect(passedTemplate?.doctorId).toBe(DOCTOR_ID);
    });
  });

  describe('when template already exists (update path)', () => {
    it('merges changes into the existing template', async () => {
      const existing = makeExistingTemplate();
      mockRepo.findByDoctorAndType.mockResolvedValue(existing);
      const updated = existing.withUpdates({ fontFamily: 'Roboto' });
      mockRepo.upsert.mockResolvedValue(updated);

      const dto: UpsertDoctorTemplateDto = { font_family: 'Roboto' };
      const result = await useCase.execute('informe', dto, DOCTOR_ID);

      expect(result).toBe(updated);
      expect(mockRepo.upsert).toHaveBeenCalledTimes(1);

      const passedTemplate = mockRepo.upsert.mock.calls[0]?.[0];
      expect(passedTemplate?.id).toBe(TEMPLATE_ID);
    });

    it('can update logoUrl to null', async () => {
      const existing = makeExistingTemplate({ logoUrl: 'https://old-logo.png' });
      mockRepo.findByDoctorAndType.mockResolvedValue(existing);
      mockRepo.upsert.mockImplementation(async (t) => t);

      const dto: UpsertDoctorTemplateDto = { logo_url: null };
      await useCase.execute('informe', dto, DOCTOR_ID);

      const passedTemplate = mockRepo.upsert.mock.calls[0]?.[0];
      expect(passedTemplate?.logoUrl).toBeNull();
    });
  });

  describe('invalid template type', () => {
    it('throws InvalidTemplateTypeError for unknown type', async () => {
      await expect(useCase.execute('desconocido', {}, DOCTOR_ID)).rejects.toThrow(
        InvalidTemplateTypeError,
      );
      expect(mockRepo.findByDoctorAndType).not.toHaveBeenCalled();
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('throws InvalidTemplateTypeError for empty string', async () => {
      await expect(useCase.execute('', {}, DOCTOR_ID)).rejects.toThrow(InvalidTemplateTypeError);
    });

    it('throws InvalidTemplateTypeError for uppercase variant', async () => {
      await expect(useCase.execute('INFORME', {}, DOCTOR_ID)).rejects.toThrow(
        InvalidTemplateTypeError,
      );
    });
  });

  describe('valid template types', () => {
    it.each(['informe', 'recipe', 'prescripciones', 'reposo'])(
      'accepts valid type "%s"',
      async (type) => {
        mockRepo.findByDoctorAndType.mockResolvedValue(null);
        mockRepo.upsert.mockResolvedValue(makeExistingTemplate({ templateType: type as never }));

        await expect(useCase.execute(type, {}, DOCTOR_ID)).resolves.toBeDefined();
      },
    );
  });
});
