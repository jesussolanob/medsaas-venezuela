import { GetCurrentPrivacyUseCase } from './get-current-privacy.use-case';
import type { ILegalDocumentRepository } from '../../domain/repositories/legal-document.repository';
import { LegalDocument } from '../../domain/entities/legal-document.entity';
import { LegalDocumentNotFoundError } from '../../domain/errors/legal-document-not-found.error';

const makeDocument = (): LegalDocument =>
  LegalDocument.reconstitute({
    id: 'uuid-p01',
    docType: 'privacy',
    version: '2026-07',
    contentHtml: '<h1>Política de Privacidad</h1>',
    isCurrent: true,
    createdAt: new Date('2026-07-24T10:00:00Z'),
    updatedAt: new Date('2026-07-24T10:00:00Z'),
  });

describe('GetCurrentPrivacyUseCase', () => {
  let useCase: GetCurrentPrivacyUseCase;
  let mockRepo: jest.Mocked<ILegalDocumentRepository>;

  beforeEach(() => {
    mockRepo = {
      findCurrentByType: jest.fn(),
    } as jest.Mocked<ILegalDocumentRepository>;

    useCase = new GetCurrentPrivacyUseCase(mockRepo);
  });

  it('returns the current privacy document mapped to output DTO', async () => {
    mockRepo.findCurrentByType.mockResolvedValue(makeDocument());

    const result = await useCase.execute();

    expect(mockRepo.findCurrentByType).toHaveBeenCalledWith('privacy');
    expect(result).toEqual({
      type: 'privacy',
      version: '2026-07',
      contentHtml: '<h1>Política de Privacidad</h1>',
      updatedAt: new Date('2026-07-24T10:00:00Z').toISOString(),
    });
  });

  it('throws LegalDocumentNotFoundError when no current privacy document exists', async () => {
    mockRepo.findCurrentByType.mockResolvedValue(null);

    await expect(useCase.execute()).rejects.toThrow(LegalDocumentNotFoundError);
    await expect(useCase.execute()).rejects.toThrow('privacy');
  });
});
