import { GetCurrentTermsUseCase } from './get-current-terms.use-case';
import type { ILegalDocumentRepository } from '../../domain/repositories/legal-document.repository';
import { LegalDocument } from '../../domain/entities/legal-document.entity';
import { LegalDocumentNotFoundError } from '../../domain/errors/legal-document-not-found.error';

const makeDocument = (): LegalDocument =>
  LegalDocument.reconstitute({
    id: 'uuid-001',
    docType: 'terms',
    version: '2026-07',
    contentHtml: '<h1>Términos y Condiciones</h1>',
    isCurrent: true,
    createdAt: new Date('2026-07-12T10:00:00Z'),
    updatedAt: new Date('2026-07-12T10:00:00Z'),
  });

describe('GetCurrentTermsUseCase', () => {
  let useCase: GetCurrentTermsUseCase;
  let mockRepo: jest.Mocked<ILegalDocumentRepository>;

  beforeEach(() => {
    mockRepo = {
      findCurrentByType: jest.fn(),
    } as jest.Mocked<ILegalDocumentRepository>;

    useCase = new GetCurrentTermsUseCase(mockRepo);
  });

  it('returns the current terms document mapped to output DTO', async () => {
    mockRepo.findCurrentByType.mockResolvedValue(makeDocument());

    const result = await useCase.execute();

    expect(mockRepo.findCurrentByType).toHaveBeenCalledWith('terms');
    expect(result).toEqual({
      type: 'terms',
      version: '2026-07',
      contentHtml: '<h1>Términos y Condiciones</h1>',
      updatedAt: new Date('2026-07-12T10:00:00Z').toISOString(),
    });
  });

  it('throws LegalDocumentNotFoundError when no current terms document exists', async () => {
    mockRepo.findCurrentByType.mockResolvedValue(null);

    await expect(useCase.execute()).rejects.toThrow(LegalDocumentNotFoundError);
    await expect(useCase.execute()).rejects.toThrow('terms');
  });

  it('LegalDocumentNotFoundError has correct code and httpStatus', async () => {
    mockRepo.findCurrentByType.mockResolvedValue(null);

    try {
      await useCase.execute();
      fail('expected error');
    } catch (err) {
      expect(err).toBeInstanceOf(LegalDocumentNotFoundError);
      expect((err as LegalDocumentNotFoundError).code).toBe('LEGAL_DOCUMENT_NOT_FOUND');
      expect((err as LegalDocumentNotFoundError).httpStatus).toBe(404);
    }
  });

  it('updatedAt is serialised as ISO string', async () => {
    const date = new Date('2026-01-15T08:30:00.000Z');
    const doc = LegalDocument.reconstitute({
      id: 'uuid-002',
      docType: 'terms',
      version: '1.0',
      contentHtml: '<p>body</p>',
      isCurrent: true,
      createdAt: date,
      updatedAt: date,
    });
    mockRepo.findCurrentByType.mockResolvedValue(doc);

    const result = await useCase.execute();

    expect(result.updatedAt).toBe('2026-01-15T08:30:00.000Z');
  });
});
