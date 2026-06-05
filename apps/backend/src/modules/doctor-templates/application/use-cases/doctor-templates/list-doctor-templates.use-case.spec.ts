import { ListDoctorTemplatesUseCase } from './list-doctor-templates.use-case';
import type { IDoctorTemplateRepository } from '../../../domain/repositories/doctor-template.repository';
import { DoctorTemplate } from '../../../domain/entities/doctor-template.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeTemplate(id: string = 'tttt-001'): DoctorTemplate {
  return DoctorTemplate.create({
    id,
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
  });
}

describe('ListDoctorTemplatesUseCase', () => {
  let useCase: ListDoctorTemplatesUseCase;
  let mockRepo: jest.Mocked<IDoctorTemplateRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByDoctorAndType: jest.fn(),
      upsert: jest.fn(),
    };
    useCase = new ListDoctorTemplatesUseCase(mockRepo);
  });

  it('returns all templates for the authenticated doctor', async () => {
    const templates = [makeTemplate('t1'), makeTemplate('t2')];
    mockRepo.listByDoctor.mockResolvedValue(templates);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toBe(templates);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns empty array when doctor has no templates', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual([]);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });
});
