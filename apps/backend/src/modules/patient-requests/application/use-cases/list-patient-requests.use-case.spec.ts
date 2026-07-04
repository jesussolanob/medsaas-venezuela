import { ListPatientRequestsUseCase } from './list-patient-requests.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import type { IPatientRequestAttachmentRepository } from '../../domain/repositories/patient-request-attachment.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { Patient } from '../../../patients/domain/entities/patient.entity';

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

const makeRequest = (id: string, status: 'pending' | 'fulfilled' = 'pending'): PatientRequest =>
  PatientRequest.create({
    id,
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: `token-${id}`,
    title: `Análisis ${id}`,
    description: null,
    responseText: null,
    status,
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    fulfilledAt: status === 'fulfilled' ? new Date() : null,
    createdAt: new Date(),
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

describe('ListPatientRequestsUseCase', () => {
  let useCase: ListPatientRequestsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ListPatientRequestsUseCase(mockRequestRepo, mockAttachmentRepo, mockPatientRepo);

    mockPatientRepo.findAllByDoctor.mockResolvedValue([makePatient()]);
    mockAttachmentRepo.countByRequestIds.mockResolvedValue({ 'req-1': 2, 'req-2': 0 });
  });

  it('returns mapped list items with patient name and attachment count', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([makeRequest('req-1'), makeRequest('req-2')]);

    const result = await useCase.execute({ doctorId: 'doctor-1' });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.patientName).toBe('María González');
    expect(result.items[0]!.attachmentCount).toBe(2);
    expect(result.items[1]!.attachmentCount).toBe(0);
    expect(result.items[0]!.status).toBe('pending');
  });

  it('returns empty list when no requests exist', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: 'doctor-1' });

    expect(result.items).toHaveLength(0);
    // Should not call batch methods for empty list
    expect(mockPatientRepo.findAllByDoctor).not.toHaveBeenCalled();
    expect(mockAttachmentRepo.countByRequestIds).not.toHaveBeenCalled();
  });

  it('falls back to "Paciente" when patient is not found', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([makeRequest('req-1')]);
    mockPatientRepo.findAllByDoctor.mockResolvedValue([]); // patient not in results

    const result = await useCase.execute({ doctorId: 'doctor-1' });

    expect(result.items[0]!.patientName).toBe('Paciente');
  });

  it('uses batch methods — calls countByRequestIds once with all IDs', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([makeRequest('req-1'), makeRequest('req-2')]);

    await useCase.execute({ doctorId: 'doctor-1' });

    expect(mockAttachmentRepo.countByRequestIds).toHaveBeenCalledTimes(1);
    expect(mockAttachmentRepo.countByRequestIds).toHaveBeenCalledWith(
      expect.arrayContaining(['req-1', 'req-2']),
    );
  });

  it('uses batch methods — calls findAllByDoctor once', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([makeRequest('req-1'), makeRequest('req-2')]);

    await useCase.execute({ doctorId: 'doctor-1' });

    expect(mockPatientRepo.findAllByDoctor).toHaveBeenCalledTimes(1);
    expect(mockPatientRepo.findAllByDoctor).toHaveBeenCalledWith('doctor-1');
  });

  it('defaults to 0 attachments when requestId not in countMap', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([makeRequest('req-99')]);
    mockAttachmentRepo.countByRequestIds.mockResolvedValue({}); // no entry for req-99

    const result = await useCase.execute({ doctorId: 'doctor-1' });

    expect(result.items[0]!.attachmentCount).toBe(0);
  });

  it('includes fulfilledAt as ISO string when fulfilled', async () => {
    mockRequestRepo.listByDoctor.mockResolvedValue([makeRequest('req-1', 'fulfilled')]);
    mockAttachmentRepo.countByRequestIds.mockResolvedValue({ 'req-1': 0 });

    const result = await useCase.execute({ doctorId: 'doctor-1' });

    expect(result.items[0]!.fulfilledAt).not.toBeNull();
  });
});
