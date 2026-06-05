import { Test, type TestingModule } from '@nestjs/testing';
import { DoctorTemplatesController } from './doctor-templates.controller';
import { ListDoctorTemplatesUseCase } from '../../application/use-cases/doctor-templates/list-doctor-templates.use-case';
import { UpsertDoctorTemplateUseCase } from '../../application/use-cases/doctor-templates/upsert-doctor-template.use-case';
import { DoctorTemplate } from '../../domain/entities/doctor-template.entity';
import { InvalidTemplateTypeError } from '../../domain/errors/invalid-template-type.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { UpsertDoctorTemplateDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeTemplate(
  overrides: Partial<Parameters<typeof DoctorTemplate.create>[0]> = {},
): DoctorTemplate {
  return DoctorTemplate.create({
    id: 'tttttttt-0000-0000-0000-000000000001',
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

describe('DoctorTemplatesController', () => {
  let controller: DoctorTemplatesController;

  const mockList = { execute: jest.fn() };
  const mockUpsert = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorTemplatesController],
      providers: [
        { provide: ListDoctorTemplatesUseCase, useValue: mockList },
        { provide: UpsertDoctorTemplateUseCase, useValue: mockUpsert },
      ],
    }).compile();

    controller = module.get<DoctorTemplatesController>(DoctorTemplatesController);
  });

  describe('list', () => {
    it('returns success envelope with template list', async () => {
      const templates = [makeTemplate()];
      mockList.execute.mockResolvedValue(templates);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns empty array when doctor has no templates', async () => {
      mockList.execute.mockResolvedValue([]);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      mockList.execute.mockResolvedValue([]);

      await controller.list(mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('upsert', () => {
    const dto: UpsertDoctorTemplateDto = {
      font_family: 'Roboto',
      primary_color: '#ff0000',
    };

    it('returns the upserted template in a success envelope', async () => {
      const template = makeTemplate({ fontFamily: 'Roboto', primaryColor: '#ff0000' });
      mockUpsert.execute.mockResolvedValue(template);

      const result = await controller.upsert('informe', dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toBe(template);
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      mockUpsert.execute.mockResolvedValue(makeTemplate());

      await controller.upsert('informe', dto, mockUser);

      expect(mockUpsert.execute).toHaveBeenCalledWith('informe', dto, DOCTOR_ID);
    });

    it('passes the templateType param to the use case', async () => {
      mockUpsert.execute.mockResolvedValue(makeTemplate({ templateType: 'recipe' }));

      await controller.upsert('recipe', {}, mockUser);

      expect(mockUpsert.execute).toHaveBeenCalledWith('recipe', {}, DOCTOR_ID);
    });

    it('propagates InvalidTemplateTypeError for unknown templateType', async () => {
      mockUpsert.execute.mockRejectedValue(new InvalidTemplateTypeError('xyz'));

      await expect(controller.upsert('xyz', {}, mockUser)).rejects.toThrow(
        InvalidTemplateTypeError,
      );
    });

    it('handles empty body (all fields optional)', async () => {
      const template = makeTemplate();
      mockUpsert.execute.mockResolvedValue(template);

      const result = await controller.upsert('informe', {}, mockUser);

      expect(result.success).toBe(true);
    });
  });
});
