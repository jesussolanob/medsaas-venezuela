import { SendMessageUseCase } from './send-message.use-case';
import type { IMessageRepository } from '../../../domain/repositories/message.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Message } from '../../../domain/entities/message.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { MessageNotFoundError } from '../../../domain/errors/message-not-found.error';
import type { SendMessageDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeDto(overrides: Partial<SendMessageDto> = {}): SendMessageDto {
  return {
    patient_id: PATIENT_ID,
    body: 'Please rest and drink plenty of water.',
    ...overrides,
  };
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

function makeSavedMessage(): Message {
  return Message.create({
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    body: 'Please rest and drink plenty of water.',
    direction: 'doctor_to_patient',
    readAt: null,
    createdAt: now,
  });
}

describe('SendMessageUseCase', () => {
  let useCase: SendMessageUseCase;
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
    useCase = new SendMessageUseCase(mockMessageRepo, mockPatientRepo);
  });

  it('creates and persists a doctor_to_patient message', async () => {
    const dto = makeDto();
    const savedMsg = makeSavedMessage();
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockMessageRepo.save.mockResolvedValue(savedMsg);

    const result = await useCase.execute(dto, DOCTOR_ID);

    expect(mockPatientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    expect(mockMessageRepo.save).toHaveBeenCalledTimes(1);
    const created = mockMessageRepo.save.mock.calls[0]![0] as Message;
    expect(created.doctorId).toBe(DOCTOR_ID);
    expect(created.patientId).toBe(PATIENT_ID);
    expect(created.body).toBe(dto.body);
    expect(created.direction).toBe('doctor_to_patient');
    expect(created.readAt).toBeNull();
    expect(result).toBe(savedMsg);
  });

  it('always assigns doctorId from actor, never from DTO (anti-IDOR)', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockMessageRepo.save.mockResolvedValue(makeSavedMessage());

    await useCase.execute(makeDto(), DOCTOR_ID);

    const created = mockMessageRepo.save.mock.calls[0]![0] as Message;
    expect(created.doctorId).toBe(DOCTOR_ID);
  });

  it('throws MessageNotFoundError when patient does not belong to the doctor (anti-IDOR)', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(makeDto(), DOCTOR_ID)).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
    expect(mockMessageRepo.save).not.toHaveBeenCalled();
  });

  it('generates a unique id for each message', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockMessageRepo.save.mockResolvedValue(makeSavedMessage());

    await useCase.execute(makeDto(), DOCTOR_ID);
    await useCase.execute(makeDto(), DOCTOR_ID);

    const id1 = (mockMessageRepo.save.mock.calls[0]![0] as Message).id;
    const id2 = (mockMessageRepo.save.mock.calls[1]![0] as Message).id;
    expect(id1).not.toBe(id2);
  });

  it('sets direction to doctor_to_patient regardless of input', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockMessageRepo.save.mockResolvedValue(makeSavedMessage());

    await useCase.execute(makeDto(), DOCTOR_ID);

    const created = mockMessageRepo.save.mock.calls[0]![0] as Message;
    expect(created.direction).toBe('doctor_to_patient');
  });
});
