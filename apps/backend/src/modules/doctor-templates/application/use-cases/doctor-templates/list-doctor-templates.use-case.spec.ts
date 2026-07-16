import { ListDoctorTemplatesUseCase } from './list-doctor-templates.use-case';
import type { IDoctorTemplateRepository } from '../../../domain/repositories/doctor-template.repository';
import type { IStoragePort } from '../../../../storage/application/ports/storage.port';
import { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

const GCS_URL =
  'https://storage.googleapis.com/my-bucket/logo/doc.png?X-Goog-Algorithm=GOOG4-RSA-SHA256';
const FRESH_URL =
  'https://storage.googleapis.com/my-bucket/logo/doc.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&refreshed=1';

function makeTemplate(
  id: string = 'tttt-001',
  logoUrl: string | null = null,
  signatureUrl: string | null = null,
): DoctorTemplate {
  return DoctorTemplate.create({
    id,
    doctorId: DOCTOR_ID,
    templateType: 'informe',
    logoUrl,
    signatureUrl,
    fontFamily: 'Inter',
    headerText: '',
    footerText: '',
    showLogo: true,
    showSignature: true,
    primaryColor: '#0891b2',
    createdAt: now,
    updatedAt: now,
  });
}

function makeMockStoragePort(): jest.Mocked<IStoragePort> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn().mockResolvedValue(FRESH_URL),
  };
}

describe('ListDoctorTemplatesUseCase', () => {
  let useCase: ListDoctorTemplatesUseCase;
  let mockRepo: jest.Mocked<IDoctorTemplateRepository>;
  let mockStorage: jest.Mocked<IStoragePort>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByDoctorAndType: jest.fn(),
      upsert: jest.fn(),
    };
    mockStorage = makeMockStoragePort();
    useCase = new ListDoctorTemplatesUseCase(mockRepo, mockStorage);
  });

  it('returns all templates for the authenticated doctor', async () => {
    const templates = [makeTemplate('t1'), makeTemplate('t2')];
    mockRepo.listByDoctor.mockResolvedValue(templates);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(2);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns empty array when doctor has no templates', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual([]);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns the same template objects when URLs are null (no GCS re-signing needed)', async () => {
    const templates = [makeTemplate('t1'), makeTemplate('t2')];
    mockRepo.listByDoctor.mockResolvedValue(templates);

    const result = await useCase.execute(DOCTOR_ID);

    // null URLs are not GCS — getSignedUrl should not be called
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    // Objects are returned as-is (same reference)
    expect(result[0]).toBe(templates[0]);
    expect(result[1]).toBe(templates[1]);
  });

  it('re-signs GCS logo URL and returns a new template with fresh URL', async () => {
    const template = makeTemplate('t1', GCS_URL, null);
    mockRepo.listByDoctor.mockResolvedValue([template]);
    mockStorage.getSignedUrl.mockResolvedValue(FRESH_URL);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result[0]?.logoUrl).toBe(FRESH_URL);
    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith('logo/doc.png', expect.any(Number));
  });

  it('re-signs GCS signature URL and returns a new template with fresh URL', async () => {
    const template = makeTemplate('t1', null, GCS_URL);
    mockRepo.listByDoctor.mockResolvedValue([template]);
    mockStorage.getSignedUrl.mockResolvedValue(FRESH_URL);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result[0]?.signatureUrl).toBe(FRESH_URL);
  });

  it('returns original template when re-signing returns the same URL (non-GCS)', async () => {
    const nonGcsUrl = 'https://cdn.example.com/logo.png';
    const template = makeTemplate('t1', nonGcsUrl, null);
    mockRepo.listByDoctor.mockResolvedValue([template]);

    const result = await useCase.execute(DOCTOR_ID);

    // Non-GCS URL is returned as-is, and the same template object is returned
    expect(result[0]?.logoUrl).toBe(nonGcsUrl);
    expect(result[0]).toBe(template);
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });
});
