import { Test, type TestingModule } from '@nestjs/testing';
import { ContentTemplatesController } from './content-templates.controller';
import { ListContentTemplatesUseCase } from '../../application/use-cases/list-content-templates.use-case';
import { GetContentTemplateUseCase } from '../../application/use-cases/get-content-template.use-case';
import { CreateContentTemplateUseCase } from '../../application/use-cases/create-content-template.use-case';
import { UpdateContentTemplateUseCase } from '../../application/use-cases/update-content-template.use-case';
import { DeleteContentTemplateUseCase } from '../../application/use-cases/delete-content-template.use-case';
import { ContentTemplate } from '../../domain/entities/content-template.entity';
import { ContentTemplateNotFoundError } from '../../domain/errors/content-template-not-found.error';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const TEMPLATE_ID = 'tttttttt-0000-0000-0000-000000000001';

function makeTemplate(): ContentTemplate {
  return ContentTemplate.create({
    id: TEMPLATE_ID,
    doctorId: DOCTOR_ID,
    type: 'recipe',
    name: 'Plantilla A',
    content: { medications: [], notes: '' },
    createdAt: new Date('2026-10-22T00:00:00Z'),
    updatedAt: new Date('2026-10-22T00:00:00Z'),
  });
}

const user = { sub: DOCTOR_ID, role: 'doctor' as const, email: 'doctor@example.com' };

describe('ContentTemplatesController', () => {
  let controller: ContentTemplatesController;
  let listUseCase: jest.Mocked<ListContentTemplatesUseCase>;
  let getUseCase: jest.Mocked<GetContentTemplateUseCase>;
  let createUseCase: jest.Mocked<CreateContentTemplateUseCase>;
  let updateUseCase: jest.Mocked<UpdateContentTemplateUseCase>;
  let deleteUseCase: jest.Mocked<DeleteContentTemplateUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentTemplatesController],
      providers: [
        { provide: ListContentTemplatesUseCase, useValue: { execute: jest.fn() } },
        { provide: GetContentTemplateUseCase, useValue: { execute: jest.fn() } },
        { provide: CreateContentTemplateUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateContentTemplateUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteContentTemplateUseCase, useValue: { execute: jest.fn() } },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContentTemplatesController>(ContentTemplatesController);
    listUseCase = module.get(ListContentTemplatesUseCase);
    getUseCase = module.get(GetContentTemplateUseCase);
    createUseCase = module.get(CreateContentTemplateUseCase);
    updateUseCase = module.get(UpdateContentTemplateUseCase);
    deleteUseCase = module.get(DeleteContentTemplateUseCase);
  });

  describe('index', () => {
    it('returns success envelope with template list', async () => {
      const t = makeTemplate();
      listUseCase.execute.mockResolvedValue([t]);

      const result = await controller.index({}, user);

      expect(result).toEqual({ success: true, data: [t] });
      expect(listUseCase.execute).toHaveBeenCalledWith(DOCTOR_ID, {});
    });
  });

  describe('create', () => {
    it('returns 201 with created template', async () => {
      const t = makeTemplate();
      createUseCase.execute.mockResolvedValue(t);

      const result = await controller.create(
        { type: 'recipe', name: 'Plantilla A', content: { medications: [], notes: '' } },
        user,
      );

      expect(result).toEqual({ success: true, data: t });
      expect(createUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'recipe' }),
        DOCTOR_ID,
      );
    });
  });

  describe('show', () => {
    it('returns the template', async () => {
      const t = makeTemplate();
      getUseCase.execute.mockResolvedValue(t);

      const result = await controller.show(TEMPLATE_ID, user);

      expect(result).toEqual({ success: true, data: t });
    });

    it('propagates ContentTemplateNotFoundError', async () => {
      getUseCase.execute.mockRejectedValue(new ContentTemplateNotFoundError());

      await expect(controller.show(TEMPLATE_ID, user)).rejects.toBeInstanceOf(
        ContentTemplateNotFoundError,
      );
    });
  });

  describe('update', () => {
    it('returns updated template', async () => {
      const t = makeTemplate();
      updateUseCase.execute.mockResolvedValue(t);

      const result = await controller.update(TEMPLATE_ID, { name: 'Nuevo' }, user);

      expect(result).toEqual({ success: true, data: t });
    });
  });

  describe('remove', () => {
    it('deletes and returns void', async () => {
      deleteUseCase.execute.mockResolvedValue(undefined);

      await expect(controller.remove(TEMPLATE_ID, user)).resolves.toBeUndefined();
      expect(deleteUseCase.execute).toHaveBeenCalledWith(TEMPLATE_ID, DOCTOR_ID);
    });
  });
});
