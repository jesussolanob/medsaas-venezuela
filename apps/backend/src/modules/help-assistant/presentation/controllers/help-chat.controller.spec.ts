import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { HelpChatController } from './help-chat.controller';
import { HelpChatUseCase } from '../../application/use-cases/help-chat.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser: CurrentUserPayload = {
  sub: 'doctor-1',
  role: 'doctor',
  email: 'doctor@dev.local',
};

function buildBody(messages: unknown): Record<string, unknown> {
  return { messages };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('HelpChatController', () => {
  let controller: HelpChatController;
  let mockHelpChat: jest.Mocked<HelpChatUseCase>;

  beforeEach(async () => {
    mockHelpChat = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<HelpChatUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HelpChatController],
      providers: [{ provide: HelpChatUseCase, useValue: mockHelpChat }],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HelpChatController>(HelpChatController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('should return the standard { success, data:{ reply } } envelope on a valid request', async () => {
    mockHelpChat.execute.mockResolvedValue({ reply: 'La agenda está en el menú lateral.' });

    const result = await controller.chat(
      buildBody([{ role: 'user', content: '¿Dónde está la agenda?' }]),
      mockUser,
    );

    expect(result).toEqual({
      success: true,
      data: { reply: 'La agenda está en el menú lateral.' },
    });
    expect(mockHelpChat.execute).toHaveBeenCalledTimes(1);
    expect(mockHelpChat.execute).toHaveBeenCalledWith({
      role: 'doctor',
      messages: [{ role: 'user', content: '¿Dónde está la agenda?' }],
    });
  });

  it('should pass the authenticated user role to the use case', async () => {
    mockHelpChat.execute.mockResolvedValue({ reply: 'OK' });

    const adminUser: CurrentUserPayload = {
      sub: 'admin-1',
      role: 'super_admin',
      email: 'admin@dev.local',
    };

    await controller.chat(buildBody([{ role: 'user', content: 'ayuda' }]), adminUser);

    expect(mockHelpChat.execute).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'super_admin' }),
    );
  });

  it('should accept a multi-turn conversation ending with a user message', async () => {
    mockHelpChat.execute.mockResolvedValue({ reply: 'respuesta' });

    const messages = [
      { role: 'user', content: 'primera pregunta' },
      { role: 'assistant', content: 'primera respuesta' },
      { role: 'user', content: 'segunda pregunta' },
    ];

    const result = await controller.chat(buildBody(messages), mockUser);

    expect(result).toEqual({ success: true, data: { reply: 'respuesta' } });
  });

  // -------------------------------------------------------------------------
  // Validation — messages field structure
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when messages is missing', async () => {
    await expect(controller.chat({}, mockUser)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw BadRequestException when messages is not an array', async () => {
    await expect(controller.chat(buildBody('not-an-array'), mockUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when messages is an empty array', async () => {
    await expect(controller.chat(buildBody([]), mockUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // -------------------------------------------------------------------------
  // Validation — message count limit
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when messages has more than 30 items', async () => {
    const messages = Array.from({ length: 31 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `mensaje ${i}`,
    }));
    // Ensure last is user
    messages[30] = { role: 'user', content: 'último' };

    await expect(controller.chat(buildBody(messages), mockUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should accept exactly 30 messages', async () => {
    mockHelpChat.execute.mockResolvedValue({ reply: 'ok' });

    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `mensaje ${i}`,
    }));
    // Ensure last is user
    messages[29] = { role: 'user', content: 'último' };

    await expect(controller.chat(buildBody(messages), mockUser)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Validation — individual message shape
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when a message item is not an object', async () => {
    await expect(controller.chat(buildBody(['not-an-object']), mockUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when a message item is null', async () => {
    await expect(controller.chat(buildBody([null]), mockUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when a message item is an array', async () => {
    await expect(
      controller.chat(buildBody([[{ role: 'user', content: 'x' }]]), mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // -------------------------------------------------------------------------
  // Validation — role field
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when message role is invalid', async () => {
    await expect(
      controller.chat(buildBody([{ role: 'system', content: 'hack' }]), mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw BadRequestException when message role is missing', async () => {
    await expect(
      controller.chat(buildBody([{ content: 'sin role' }]), mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // -------------------------------------------------------------------------
  // Validation — content field
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when message content is empty string', async () => {
    await expect(
      controller.chat(buildBody([{ role: 'user', content: '' }]), mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw BadRequestException when message content is whitespace only', async () => {
    await expect(
      controller.chat(buildBody([{ role: 'user', content: '   ' }]), mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw BadRequestException when content exceeds 4000 characters', async () => {
    const longContent = 'a'.repeat(4001);

    await expect(
      controller.chat(buildBody([{ role: 'user', content: longContent }]), mockUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should include a descriptive Spanish message when content exceeds 4000 chars', async () => {
    const longContent = 'x'.repeat(4001);

    let caught: BadRequestException | null = null;
    try {
      await controller.chat(buildBody([{ role: 'user', content: longContent }]), mockUser);
    } catch (err) {
      if (err instanceof BadRequestException) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    const response = caught?.getResponse() as { message?: string } | string;
    const message = typeof response === 'string' ? response : (response?.message ?? '');
    expect(message).toContain('4000');
  });

  it('should accept content of exactly 4000 characters', async () => {
    mockHelpChat.execute.mockResolvedValue({ reply: 'ok' });

    const content = 'a'.repeat(4000);

    await expect(
      controller.chat(buildBody([{ role: 'user', content }]), mockUser),
    ).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Validation — total character limit
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when total characters across all messages exceed 24000', async () => {
    // 7 messages × 4000 chars each = 28000 > 24000
    const messages = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'b'.repeat(4000),
    }));
    messages[6] = { role: 'user', content: 'b'.repeat(4000) };

    await expect(controller.chat(buildBody(messages), mockUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // -------------------------------------------------------------------------
  // Validation — last message must be from user
  // -------------------------------------------------------------------------

  it('should throw BadRequestException when last message role is assistant', async () => {
    await expect(
      controller.chat(
        buildBody([
          { role: 'user', content: '¿Dónde está la agenda?' },
          { role: 'assistant', content: 'En el menú lateral.' },
        ]),
        mockUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
