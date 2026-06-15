import { Test, type TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { ListThreadsUseCase } from '../../application/use-cases/messages/list-threads.use-case';
import { GetThreadUseCase } from '../../application/use-cases/messages/get-thread.use-case';
import { SendMessageUseCase } from '../../application/use-cases/messages/send-message.use-case';
import { Message } from '../../domain/entities/message.entity';
import { MessageNotFoundError } from '../../domain/errors/message-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { ThreadSummary } from '../../domain/repositories/message.repository';
import type { SendMessageDto } from '@delta/shared-types';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeMessage(overrides: Partial<Parameters<typeof Message.create>[0]> = {}): Message {
  return Message.create({
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    body: 'Hello doctor',
    direction: 'patient_to_doctor',
    readAt: null,
    createdAt: now,
    ...overrides,
  });
}

function makeThread(): ThreadSummary {
  return {
    patientId: PATIENT_ID,
    patientName: 'Juan Pérez',
    lastMessageAt: now,
    unreadCount: 1,
  };
}

describe('MessagesController', () => {
  let controller: MessagesController;

  const mockListThreads = { execute: jest.fn() };
  const mockGetThread = { execute: jest.fn() };
  const mockSendMessage = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        { provide: ListThreadsUseCase, useValue: mockListThreads },
        { provide: GetThreadUseCase, useValue: mockGetThread },
        { provide: SendMessageUseCase, useValue: mockSendMessage },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MessagesController>(MessagesController);
  });

  describe('threads', () => {
    it('returns success envelope with plaintext thread list', async () => {
      const threads = [makeThread()];
      mockListThreads.execute.mockResolvedValue(threads);

      const result = await controller.threads(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      // PII in plain — "Juan Pérez" returned as-is
      expect(result.data[0]!.patientName).toBe('Juan Pérez');
      expect(mockListThreads.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns empty list when doctor has no threads', async () => {
      mockListThreads.execute.mockResolvedValue([]);

      const result = await controller.threads(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('always uses doctorId from authenticated user (anti-IDOR)', async () => {
      mockListThreads.execute.mockResolvedValue([]);

      await controller.threads(mockUser);

      expect(mockListThreads.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('includes unreadCount in thread list items', async () => {
      const thread: ThreadSummary = { ...makeThread(), unreadCount: 3 };
      mockListThreads.execute.mockResolvedValue([thread]);

      const result = await controller.threads(mockUser);

      expect(result.data[0]!.unreadCount).toBe(3);
    });
  });

  describe('thread', () => {
    it('returns success envelope with message list', async () => {
      const messages = [makeMessage()];
      mockGetThread.execute.mockResolvedValue(messages);

      const result = await controller.thread(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.body).toBe('Hello doctor');
      expect(mockGetThread.execute).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID);
    });

    it('returns empty list when thread has no messages', async () => {
      mockGetThread.execute.mockResolvedValue([]);

      const result = await controller.thread(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('propagates MessageNotFoundError for foreign patient (anti-IDOR)', async () => {
      mockGetThread.execute.mockRejectedValue(new MessageNotFoundError());

      await expect(controller.thread('other-patient-id', mockUser)).rejects.toThrow(
        MessageNotFoundError,
      );
    });

    it('always uses doctorId from authenticated user (anti-IDOR)', async () => {
      mockGetThread.execute.mockResolvedValue([]);

      await controller.thread(PATIENT_ID, mockUser);

      expect(mockGetThread.execute).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID);
    });
  });

  describe('send', () => {
    const dto: SendMessageDto = {
      patient_id: PATIENT_ID,
      body: 'Please take your medication.',
    };

    it('returns success envelope with the created message', async () => {
      const msg = makeMessage({ direction: 'doctor_to_patient', body: dto.body });
      mockSendMessage.execute.mockResolvedValue(msg);

      const result = await controller.send(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.body).toBe(dto.body);
      expect(mockSendMessage.execute).toHaveBeenCalledWith(dto, DOCTOR_ID);
    });

    it('always uses doctorId from authenticated user (anti-IDOR)', async () => {
      mockSendMessage.execute.mockResolvedValue(makeMessage({ direction: 'doctor_to_patient' }));

      await controller.send(dto, mockUser);

      expect(mockSendMessage.execute).toHaveBeenCalledWith(dto, DOCTOR_ID);
    });

    it('propagates MessageNotFoundError for foreign patient (anti-IDOR)', async () => {
      mockSendMessage.execute.mockRejectedValue(new MessageNotFoundError());

      await expect(
        controller.send({ ...dto, patient_id: 'foreign-patient' }, mockUser),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });
});
