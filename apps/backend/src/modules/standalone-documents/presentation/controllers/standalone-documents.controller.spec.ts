import { Test, type TestingModule } from '@nestjs/testing';
import { StandaloneDocumentsController } from './standalone-documents.controller';
import { ListStandaloneDocumentsUseCase } from '../../application/use-cases/list-standalone-documents.use-case';
import { GetStandaloneDocumentUseCase } from '../../application/use-cases/get-standalone-document.use-case';
import { CreateStandaloneDocumentUseCase } from '../../application/use-cases/create-standalone-document.use-case';
import { UpdateStandaloneDocumentUseCase } from '../../application/use-cases/update-standalone-document.use-case';
import { DeleteStandaloneDocumentUseCase } from '../../application/use-cases/delete-standalone-document.use-case';
import { IssueStandaloneDocumentUseCase } from '../../application/use-cases/issue-standalone-document.use-case';
import { VoidStandaloneDocumentUseCase } from '../../application/use-cases/void-standalone-document.use-case';
import { StandaloneDocument } from '../../domain/entities/standalone-document.entity';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';
import { StandaloneDocumentNotDraftError } from '../../domain/errors/standalone-document-not-draft.error';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const DOC_ID = 'docDocDocDoc-0000-0000-0000-000000000001';

function makeDraft(): StandaloneDocument {
  return StandaloneDocument.create({
    id: DOC_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    type: 'recipe',
    code: null,
    status: 'draft',
    content: { medications: [], notes: '' },
    voidReason: null,
    issuedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-10-22T00:00:00Z'),
    updatedAt: new Date('2026-10-22T00:00:00Z'),
  });
}

function makeIssued(): StandaloneDocument {
  return StandaloneDocument.create({
    ...makeDraft(),
    code: 'REC-202610-0001',
    status: 'issued',
    issuedAt: new Date('2026-10-22T10:00:00Z'),
  });
}

const user = { sub: DOCTOR_ID, role: 'doctor' as const, email: 'doctor@example.com' };

describe('StandaloneDocumentsController', () => {
  let controller: StandaloneDocumentsController;
  let listUseCase: jest.Mocked<ListStandaloneDocumentsUseCase>;
  let getUseCase: jest.Mocked<GetStandaloneDocumentUseCase>;
  let createUseCase: jest.Mocked<CreateStandaloneDocumentUseCase>;
  let updateUseCase: jest.Mocked<UpdateStandaloneDocumentUseCase>;
  let deleteUseCase: jest.Mocked<DeleteStandaloneDocumentUseCase>;
  let issueUseCase: jest.Mocked<IssueStandaloneDocumentUseCase>;
  let voidUseCase: jest.Mocked<VoidStandaloneDocumentUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StandaloneDocumentsController],
      providers: [
        { provide: ListStandaloneDocumentsUseCase, useValue: { execute: jest.fn() } },
        { provide: GetStandaloneDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: CreateStandaloneDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateStandaloneDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteStandaloneDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: IssueStandaloneDocumentUseCase, useValue: { execute: jest.fn() } },
        { provide: VoidStandaloneDocumentUseCase, useValue: { execute: jest.fn() } },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StandaloneDocumentsController>(StandaloneDocumentsController);
    listUseCase = module.get(ListStandaloneDocumentsUseCase);
    getUseCase = module.get(GetStandaloneDocumentUseCase);
    createUseCase = module.get(CreateStandaloneDocumentUseCase);
    updateUseCase = module.get(UpdateStandaloneDocumentUseCase);
    deleteUseCase = module.get(DeleteStandaloneDocumentUseCase);
    issueUseCase = module.get(IssueStandaloneDocumentUseCase);
    voidUseCase = module.get(VoidStandaloneDocumentUseCase);
  });

  describe('index', () => {
    it('returns list of document summaries', async () => {
      const summary = {
        id: DOC_ID,
        type: 'recipe' as const,
        code: null,
        status: 'draft' as const,
        patientId: PATIENT_ID,
        patientName: 'Juan Pérez',
        createdAt: new Date(),
        issuedAt: null,
        voidedAt: null,
      };
      listUseCase.execute.mockResolvedValue([summary]);

      const result = await controller.index({ limit: 200, offset: 0 }, user);

      expect(result).toEqual({ success: true, data: [summary] });
    });
  });

  describe('create', () => {
    it('creates a draft and returns 201 envelope', async () => {
      createUseCase.execute.mockResolvedValue(makeDraft());

      const result = await controller.create(
        { type: 'recipe', patient_id: PATIENT_ID, content: { medications: [], notes: '' } },
        user,
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('draft');
    });
  });

  describe('show', () => {
    it('returns document detail with patient', async () => {
      const detail = {
        document: makeDraft(),
        patient: { id: PATIENT_ID, fullName: 'Juan Pérez', cedula: 'V-12345678', age: 30 },
      };
      getUseCase.execute.mockResolvedValue(detail);

      const result = await controller.show(DOC_ID, user);

      // Contrato F: detalle PLANO (el anidado { document, patient } dejaba al
      // frontend sin `type`/`content` y el modal "Editar borrador" abría vacío).
      const doc = detail.document;
      expect(result).toEqual({
        success: true,
        data: {
          id: doc.id,
          type: doc.type,
          code: doc.code,
          status: doc.status,
          patientId: doc.patientId,
          patientName: 'Juan Pérez',
          content: doc.content,
          voidReason: doc.voidReason,
          createdAt: doc.createdAt,
          issuedAt: doc.issuedAt,
          voidedAt: doc.voidedAt,
          patient: detail.patient,
        },
      });
      expect(result.data).not.toHaveProperty('document');
    });

    it('propagates StandaloneDocumentNotFoundError', async () => {
      getUseCase.execute.mockRejectedValue(new StandaloneDocumentNotFoundError());

      await expect(controller.show(DOC_ID, user)).rejects.toBeInstanceOf(
        StandaloneDocumentNotFoundError,
      );
    });
  });

  describe('update', () => {
    it('updates content and returns document', async () => {
      updateUseCase.execute.mockResolvedValue(makeDraft());

      const result = await controller.update(
        DOC_ID,
        { content: { medications: [], notes: 'updated' } },
        user,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('remove', () => {
    it('deletes and returns void', async () => {
      deleteUseCase.execute.mockResolvedValue(undefined);

      await expect(controller.remove(DOC_ID, user)).resolves.toBeUndefined();
    });

    it('propagates StandaloneDocumentNotDraftError', async () => {
      deleteUseCase.execute.mockRejectedValue(new StandaloneDocumentNotDraftError());

      await expect(controller.remove(DOC_ID, user)).rejects.toBeInstanceOf(
        StandaloneDocumentNotDraftError,
      );
    });
  });

  describe('issue', () => {
    it('issues the document and returns it', async () => {
      issueUseCase.execute.mockResolvedValue(makeIssued());

      const result = await controller.issue(DOC_ID, user);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('issued');
      expect(result.data.code).toBe('REC-202610-0001');
    });
  });

  describe('void', () => {
    it('voids the document and returns it', async () => {
      const voided = StandaloneDocument.create({
        ...makeIssued(),
        status: 'voided',
        voidReason: 'Error',
        voidedAt: new Date(),
      });
      voidUseCase.execute.mockResolvedValue(voided);

      const result = await controller.void(DOC_ID, { reason: 'Error' }, user);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('voided');
    });
  });
});
