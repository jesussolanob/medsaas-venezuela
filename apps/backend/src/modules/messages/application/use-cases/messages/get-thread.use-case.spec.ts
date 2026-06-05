import { GetThreadUseCase } from './get-thread.use-case';
import type { IMessageRepository } from '../../../domain/repositories/message.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Message } from '../../../domain/entities/message.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { MessageNotFoundError } from '../../../domain/errors/message-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const OTHER_PATIENT_ID = 'pppppppp-0000-0000-0000-000000000099';
const now = new Date('2026-06-05T00:00:00Z');

function makeMessage(overrides: Partial<Parameters<typeof Message.create>[0]> = {}): Message {
  return Message.create({
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    body: 'Hello',
    direction: 'doctor_to_patient',
    readAt: null,
    createdAt: now,
    ...overrides,
  });
}

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    createdAt: now,
    updatedAt: now,
  });
}

describe('GetThreadUseCase', () => {
  let useCase: GetThreadUseCase;
  let mockMessageRepo: jest.Mocked<IMessageRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    mockMessageRepo = {
      listThreads: jest.fn(),
      findThread: jest.fn(),
      markThreadRead: jest.fn(),
      save: jest.fn(),
    };
    mockPatientRepo = {
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
    useCase = new GetThreadUseCase(mockMessageRepo, mockPatientRepo);
  });

  it('returns messages for an owned patient thread', async () => {
    const patient = makePatient();
    const messages = [makeMessage()];
    mockPatientRepo.findById.mockResolvedValue(patient);
    mockMessageRepo.findThread.mockResolvedValue(messages);
    mockMessageRepo.markThreadRead.mockResolvedValue(undefined);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(mockPatientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    expect(mockMessageRepo.findThread).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID);
    expect(result).toBe(messages);
  });

  it('marks thread as read after fetching messages', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockMessageRepo.findThread.mockResolvedValue([makeMessage()]);
    mockMessageRepo.markThreadRead.mockResolvedValue(undefined);

    await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(mockMessageRepo.markThreadRead).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID);
  });

  it('throws MessageNotFoundError when patient does not belong to the doctor (anti-IDOR)', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID, OTHER_PATIENT_ID)).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
    expect(mockMessageRepo.findThread).not.toHaveBeenCalled();
    expect(mockMessageRepo.markThreadRead).not.toHaveBeenCalled();
  });

  it('returns empty array when patient is owned but has no messages yet', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockMessageRepo.findThread.mockResolvedValue([]);
    mockMessageRepo.markThreadRead.mockResolvedValue(undefined);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(0);
  });
});
