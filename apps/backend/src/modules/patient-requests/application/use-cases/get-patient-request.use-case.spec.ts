import { GetPatientRequestUseCase } from './get-patient-request.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import type { IPatientRequestAttachmentRepository } from '../../domain/repositories/patient-request-attachment.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestAttachment } from '../../domain/entities/patient-request-attachment.entity';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';

const mockRequestRepo: jest.Mocked<IPatientRequestRepository> = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  listByDoctor: jest.fn(),
  incrementLinkFailedAttempts: jest.fn(),
  updateLastCodeRequestedAt: jest.fn(),
  markFulfilled: jest.fn(),
};

const mockAttachmentRepo: jest.Mocked<IPatientRequestAttachmentRepository> = {
  save: jest.fn(),
  findByRequestId: jest.fn(),
  countByRequestId: jest.fn(),
  countByRequestIds: jest.fn(),
};

const mockPatientRepo: jest.Mocked<IPatientRepository> = {
  findById: jest.fn(),
  findByCedulaHash: jest.fn(),
  findByEmailHash: jest.fn(),
  list: jest.fn(),
  findAllByDoctor: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  logReveal: jest.fn(),
};

const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const makePendingRequest = (): PatientRequest =>
  PatientRequest.create({
    id: 'req-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'valid-token',
    title: 'Análisis de sangre',
    description: 'Por favor incluya los resultados recientes',
    responseText: null,
    status: 'pending',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  });

const makeAttachment = (): PatientRequestAttachment =>
  PatientRequestAttachment.create({
    id: 'att-1',
    requestId: 'req-1',
    fileUrl: 'patient-requests/req-1/uuid-file.pdf',
    fileName: 'resultado.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    uploadedAt: new Date(),
  });

const makePatient = (): Patient =>
  Patient.create({
    id: 'patient-1',
    doctorId: 'doctor-1',
    fullName: 'María González',
    cedula: 'V-12345678',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('GetPatientRequestUseCase', () => {
  let useCase: GetPatientRequestUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new GetPatientRequestUseCase(
      mockRequestRepo,
      mockAttachmentRepo,
      mockPatientRepo,
      mockStorage,
    );

    mockRequestRepo.findById.mockResolvedValue(makePendingRequest());
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockAttachmentRepo.findByRequestId.mockResolvedValue([makeAttachment()]);
    mockStorage.getSignedUrl.mockResolvedValue('https://signed.example.com/file.pdf?token=abc');
  });

  it('returns full request detail with signed attachment URL', async () => {
    const result = await useCase.execute({ id: 'req-1', doctorId: 'doctor-1' });

    expect(result.id).toBe('req-1');
    expect(result.patientName).toBe('María González');
    expect(result.title).toBe('Análisis de sangre');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]!.signedUrl).toBe('https://signed.example.com/file.pdf?token=abc');
    expect(result.attachments[0]!.fileName).toBe('resultado.pdf');
  });

  it('throws PatientRequestNotFoundError when request not found', async () => {
    mockRequestRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'req-1', doctorId: 'doctor-1' })).rejects.toBeInstanceOf(
      PatientRequestNotFoundError,
    );
  });

  it('throws PatientRequestNotFoundError when request belongs to different doctor', async () => {
    mockRequestRepo.findById.mockResolvedValue(null); // scoped query returns null

    await expect(useCase.execute({ id: 'req-1', doctorId: 'doctor-2' })).rejects.toBeInstanceOf(
      PatientRequestNotFoundError,
    );
  });

  it('falls back to "Paciente" when patient record is not found', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ id: 'req-1', doctorId: 'doctor-1' });

    expect(result.patientName).toBe('Paciente');
  });

  it('returns empty signedUrl when storage fails (graceful degradation)', async () => {
    mockStorage.getSignedUrl.mockRejectedValue(new Error('Storage error'));

    const result = await useCase.execute({ id: 'req-1', doctorId: 'doctor-1' });

    expect(result.attachments[0]!.signedUrl).toBe('');
  });

  it('returns empty attachments array when no attachments exist', async () => {
    mockAttachmentRepo.findByRequestId.mockResolvedValue([]);

    const result = await useCase.execute({ id: 'req-1', doctorId: 'doctor-1' });

    expect(result.attachments).toHaveLength(0);
  });

  it('scopes findById to the doctorId (anti-IDOR)', async () => {
    await useCase.execute({ id: 'req-1', doctorId: 'doctor-1' });

    expect(mockRequestRepo.findById).toHaveBeenCalledWith('req-1', 'doctor-1');
  });

  it('logs PHI access (audit) after returning result — fire-and-forget', async () => {
    mockPatientRepo.logReveal.mockResolvedValue();

    await useCase.execute({ id: 'req-1', doctorId: 'doctor-1' });

    // Allow the void promise to settle
    await new Promise((r) => setImmediate(r));

    expect(mockPatientRepo.logReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'doctor-1',
        actorRole: 'doctor',
        patientId: 'patient-1',
        fieldRevealed: 'patient_request_detail',
      }),
    );
  });

  it('does not throw when audit log fails (fire-and-forget)', async () => {
    mockPatientRepo.logReveal.mockRejectedValue(new Error('DB timeout'));

    await expect(useCase.execute({ id: 'req-1', doctorId: 'doctor-1' })).resolves.toBeDefined();
  });
});
