import { GetConsultationBlocksUseCase } from './get-consultation-blocks.use-case';
import type { IConsultationBlockRepository } from '../../../domain/repositories/consultation-block.repository';
import { ConsultationBlock } from '../../../domain/entities/consultation-block.entity';

const DOCTOR_ID = 'doctor-uuid-001';

function makeRepo(): jest.Mocked<IConsultationBlockRepository> {
  return {
    listCatalog: jest.fn(),
    getCatalogKeySet: jest.fn(),
    listSpecialtyDefaults: jest.fn(),
    listDoctorBlocks: jest.fn(),
    getDoctorSpecialty: jest.fn(),
    replaceDoctorBlocks: jest.fn(),
    resolveBlocks: jest.fn(),
  };
}

function makeResolvedBlock(key: string): ConsultationBlock {
  return new ConsultationBlock({
    key,
    label: 'Label',
    contentType: 'rich_text',
    enabled: true,
    sortOrder: 1,
    printable: true,
    sendToPatient: true,
  });
}

describe('GetConsultationBlocksUseCase', () => {
  let useCase: GetConsultationBlocksUseCase;
  let repo: jest.Mocked<IConsultationBlockRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new GetConsultationBlocksUseCase(repo);
  });

  it('returns full output structure with specialty', async () => {
    const catalogRow = {
      key: 'chief_complaint',
      defaultLabel: 'Motivo de consulta',
      defaultContentType: 'rich_text',
      defaultPrintable: true,
      defaultSendToPatient: true,
      defaultEnabled: true,
    };
    const doctorBlock = {
      doctorId: DOCTOR_ID,
      blockKey: 'chief_complaint',
      enabled: true,
      sortOrder: 1,
      customLabel: null,
      customContentType: null,
      printable: null,
      sendToPatient: null,
    };
    const specialtyDefault = {
      specialty: 'Medicina General',
      blockKey: 'chief_complaint',
      enabled: true,
      sortOrder: 1,
    };
    const resolved = makeResolvedBlock('chief_complaint');

    repo.getDoctorSpecialty.mockResolvedValue('Medicina General');
    repo.listCatalog.mockResolvedValue([catalogRow]);
    repo.listDoctorBlocks.mockResolvedValue([doctorBlock]);
    repo.listSpecialtyDefaults.mockResolvedValue([specialtyDefault]);
    repo.resolveBlocks.mockResolvedValue([resolved]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.doctor_specialty).toBe('Medicina General');
    expect(result.catalog).toEqual([catalogRow]);
    expect(result.doctor_config).toEqual([doctorBlock]);
    expect(result.specialty_defaults).toEqual([specialtyDefault]);
    expect(result.resolved).toEqual([resolved]);
  });

  it('passes null specialty to listSpecialtyDefaults when doctor has no specialty', async () => {
    repo.getDoctorSpecialty.mockResolvedValue(null);
    repo.listCatalog.mockResolvedValue([]);
    repo.listDoctorBlocks.mockResolvedValue([]);
    repo.listSpecialtyDefaults.mockResolvedValue([]);
    repo.resolveBlocks.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.doctor_specialty).toBeNull();
    expect(repo.listSpecialtyDefaults).toHaveBeenCalledWith(null);
    expect(repo.resolveBlocks).toHaveBeenCalledWith(DOCTOR_ID, null);
  });

  it('calls listCatalog, listDoctorBlocks, listSpecialtyDefaults, and resolveBlocks once each', async () => {
    repo.getDoctorSpecialty.mockResolvedValue('Pediatría');
    repo.listCatalog.mockResolvedValue([]);
    repo.listDoctorBlocks.mockResolvedValue([]);
    repo.listSpecialtyDefaults.mockResolvedValue([]);
    repo.resolveBlocks.mockResolvedValue([]);

    await useCase.execute(DOCTOR_ID);

    expect(repo.listCatalog).toHaveBeenCalledTimes(1);
    expect(repo.listDoctorBlocks).toHaveBeenCalledWith(DOCTOR_ID);
    expect(repo.listSpecialtyDefaults).toHaveBeenCalledWith('Pediatría');
    expect(repo.resolveBlocks).toHaveBeenCalledWith(DOCTOR_ID, 'Pediatría');
  });
});
